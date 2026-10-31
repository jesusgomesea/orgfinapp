-- org-fin — schema do banco no Supabase (Postgres).
-- Como usar: Supabase → SQL Editor → colar este arquivo inteiro → Run. Pode rodar de novo sem quebrar
-- (usa "if not exists" / "or replace"), mas não apaga colunas antigas: mudança de estrutura = arquivo novo
-- em supabase/ (ex.: 002-....sql) para manter o histórico.
--
-- Segurança: toda tabela tem usuario_id e Row Level Security. O navegador fala direto com o banco usando a
-- chave pública (anon), então quem garante que cada pessoa só vê os próprios dados é a RLS, não a tela.

-- ---------------------------------------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------------------------------------

-- Dados do primeiro acesso. Uma linha por usuário; existir a linha = cadastro inicial feito.
create table if not exists configuracao (
  usuario_id     uuid primary key default auth.uid() references auth.users on delete cascade,
  renda_mensal   numeric(12,2) not null default 0 check (renda_mensal >= 0),
  dia_salario    smallint check (dia_salario between 1 and 31),
  saldo_inicial  numeric(12,2) not null default 0,
  criado_em      timestamptz not null default now()
);

-- Para onde vai o dinheiro (Mercado, Moradia...).
create table if not exists categoria (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null default auth.uid() references auth.users on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  cor         text not null default '#64748b',
  unique (usuario_id, nome)
);

-- Forma de pagamento. Só "credito" usa dia de fechamento/vencimento (regra do mês da 1ª parcela).
create table if not exists conta_cartao (
  id              bigint generated always as identity primary key,
  usuario_id      uuid not null default auth.uid() references auth.users on delete cascade,
  nome            text not null check (length(trim(nome)) > 0),
  tipo            text not null check (tipo in ('dinheiro', 'pix', 'debito', 'credito', 'boleto')),
  dia_fechamento  smallint check (dia_fechamento between 1 and 31),
  dia_vencimento  smallint check (dia_vencimento between 1 and 31),
  unique (usuario_id, nome)
);

-- O que a pessoa informou: valor TOTAL e número de parcelas. As parcelas ficam em "lancamento".
create table if not exists compra (
  id              bigint generated always as identity primary key,
  usuario_id      uuid not null default auth.uid() references auth.users on delete cascade,
  descricao       text not null check (length(trim(descricao)) > 0),
  estabelecimento text,
  valor_total     numeric(12,2) not null check (valor_total > 0),
  parcelas        smallint not null default 1 check (parcelas between 1 and 120),
  data_compra     date not null,
  categoria_id    bigint references categoria on delete set null,
  conta_id        bigint references conta_cartao on delete set null,
  origem          text not null default 'manual' check (origem in ('manual', 'ia')),
  criado_em       timestamptz not null default now()
);

-- Cada parcela. "competencia" é sempre o dia 1 do mês em que o gasto conta (painel do mês);
-- "data_prevista" é o dia em que aparece no calendário (vencimento da fatura, ou o dia da compra).
create table if not exists lancamento (
  id              bigint generated always as identity primary key,
  usuario_id      uuid not null default auth.uid() references auth.users on delete cascade,
  compra_id       bigint not null references compra on delete cascade,
  numero          smallint not null check (numero >= 1),
  total_parcelas  smallint not null check (total_parcelas >= 1),
  valor           numeric(12,2) not null check (valor > 0),
  competencia     date not null check (extract(day from competencia) = 1),
  data_prevista   date not null,
  unique (compra_id, numero)
);

create index if not exists lancamento_usuario_competencia on lancamento (usuario_id, competencia);
create index if not exists compra_usuario_data on compra (usuario_id, data_compra);

-- ---------------------------------------------------------------------------------------------------------
-- Row Level Security: cada usuário só enxerga e altera as próprias linhas
-- ---------------------------------------------------------------------------------------------------------

alter table configuracao enable row level security;
alter table categoria    enable row level security;
alter table conta_cartao enable row level security;
alter table compra       enable row level security;
alter table lancamento   enable row level security;

drop policy if exists dono on configuracao;
create policy dono on configuracao for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists dono on categoria;
create policy dono on categoria for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists dono on conta_cartao;
create policy dono on conta_cartao for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Chave estrangeira não passa pela RLS: sem o "exists" daria para apontar para a categoria/cartão de outra
-- pessoa só chutando o id.
drop policy if exists dono on compra;
create policy dono on compra for all
  using (usuario_id = auth.uid())
  with check (
    usuario_id = auth.uid()
    and (categoria_id is null or exists (select 1 from categoria c where c.id = categoria_id and c.usuario_id = auth.uid()))
    and (conta_id is null or exists (select 1 from conta_cartao k where k.id = conta_id and k.usuario_id = auth.uid()))
  );

drop policy if exists dono on lancamento;
create policy dono on lancamento for all
  using (usuario_id = auth.uid())
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from compra c where c.id = compra_id and c.usuario_id = auth.uid())
  );

-- ---------------------------------------------------------------------------------------------------------
-- salvar_compra: grava (ou edita) a compra e troca TODAS as parcelas numa transação só.
-- As parcelas são calculadas no app (src/app/dominio/parcelamento.ts, que tem teste); aqui o banco confere
-- que a conta fecha — soma = valor total e quantidade = parcelas — para nunca ficar centavo sobrando.
-- security invoker: roda com o usuário logado, então a RLS acima continua valendo.
-- ---------------------------------------------------------------------------------------------------------

create or replace function salvar_compra(p_compra jsonb, p_lancamentos jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id bigint;
  v_soma numeric(12,2);
begin
  select coalesce(sum((l->>'valor')::numeric(12,2)), 0) into v_soma from jsonb_array_elements(p_lancamentos) l;
  if v_soma <> (p_compra->>'valor_total')::numeric(12,2) then
    raise exception 'A soma das parcelas (%) difere do valor total (%)', v_soma, p_compra->>'valor_total';
  end if;
  if jsonb_array_length(p_lancamentos) <> (p_compra->>'parcelas')::int then
    raise exception 'Quantidade de parcelas não confere';
  end if;

  if nullif(p_compra->>'id', '') is not null then
    update compra set
      descricao       = p_compra->>'descricao',
      estabelecimento = nullif(p_compra->>'estabelecimento', ''),
      valor_total     = (p_compra->>'valor_total')::numeric,
      parcelas        = (p_compra->>'parcelas')::smallint,
      data_compra     = (p_compra->>'data_compra')::date,
      categoria_id    = nullif(p_compra->>'categoria_id', '')::bigint,
      conta_id        = nullif(p_compra->>'conta_id', '')::bigint
    where id = (p_compra->>'id')::bigint
    returning id into v_id;
    if v_id is null then
      raise exception 'Compra não encontrada';
    end if;
    delete from lancamento where compra_id = v_id;
  else
    insert into compra (descricao, estabelecimento, valor_total, parcelas, data_compra, categoria_id, conta_id, origem)
    values (
      p_compra->>'descricao',
      nullif(p_compra->>'estabelecimento', ''),
      (p_compra->>'valor_total')::numeric,
      (p_compra->>'parcelas')::smallint,
      (p_compra->>'data_compra')::date,
      nullif(p_compra->>'categoria_id', '')::bigint,
      nullif(p_compra->>'conta_id', '')::bigint,
      coalesce(nullif(p_compra->>'origem', ''), 'manual')
    )
    returning id into v_id;
  end if;

  insert into lancamento (compra_id, numero, total_parcelas, valor, competencia, data_prevista)
  select v_id,
         (l->>'numero')::smallint,
         (l->>'total_parcelas')::smallint,
         (l->>'valor')::numeric,
         (l->>'competencia')::date,
         (l->>'data_prevista')::date
  from jsonb_array_elements(p_lancamentos) l;

  return v_id;
end;
$$;
