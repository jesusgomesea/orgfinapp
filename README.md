# org-fin — Organização financeira

Site instalável (PWA) para registrar gastos do mês, com parcelamento automático no calendário.
Funciona no iPhone e no Android sem loja de apps e se atualiza sozinho a cada publicação.

- **Frontend:** Angular 22 + service worker (`@angular/pwa`)
- **Login e banco:** Supabase (Auth + Postgres com Row Level Security)
- **IA:** Gemini, chamado por uma Netlify Function (a chave nunca vai para o navegador)
- **Hospedagem:** Netlify

## O que o app faz

- **Primeiro acesso:** renda, dia do salário, saldo, categorias e cartões.
- **Novo gasto:** escreva ou fale "geladeira 3 mil em 10x no Nubank, Casas Bahia" → a IA preenche → você confere → salva.
  O formulário manual funciona sempre.
- **Parcelas:** valor total ÷ parcelas, sobra de centavos na 1ª. Cada parcela aparece no calendário do mês em que cai,
  com "Geladeira 3/10 — R$ 300,00 → Casas Bahia · Eletrodomésticos".
- **Painel do mês:** gasto × renda, gastos por categoria e quanto dos próximos 12 meses já está comprometido.
- **Cadastros:** renda, categorias e cartões.

### Em que mês cai a 1ª parcela

| Forma de pagamento | 1ª parcela |
|---|---|
| Pix, débito, dinheiro, à vista | no mês e no dia da compra |
| Boleto/carnê ou outro parcelado sem cartão | mês seguinte |
| Cartão de crédito sem dia de fechamento | mês seguinte |
| Cartão com fechamento, compra **até** o dia de fechamento | mês seguinte, no dia do vencimento |
| Cartão com fechamento, compra **depois** do fechamento | dois meses à frente |

A regra está em [`src/app/dominio/parcelamento.ts`](src/app/dominio/parcelamento.ts) e tem testes (`npm run test:regras`).

## Publicar (uma vez só)

### 1. Supabase (login + banco)
1. Crie uma conta em <https://supabase.com> → **New project** (anote a senha do banco; o app não usa, mas o Supabase pede).
2. **SQL Editor** → cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Project Settings → API**: copie a **Project URL** e a chave **anon / public**.
4. **Authentication → URL Configuration → Site URL**: coloque o endereço do site no Netlify (passo 2), para o link de
   confirmação do e-mail voltar para o app.
5. Depois de criar a sua conta no app: **Authentication → Sign In / Providers → desligue "Allow new users to sign up"**,
   para ninguém mais conseguir se cadastrar.

### 2. Netlify (site + função da IA)
1. Suba esta pasta para um repositório no GitHub.
2. Em <https://app.netlify.com> → **Add new site → Import an existing project** → escolha o repositório.
   O `netlify.toml` já diz como fazer o build.
3. **Site configuration → Environment variables**, crie:

   | Variável | Valor |
   |---|---|
   | `SUPABASE_URL` | Project URL do Supabase |
   | `SUPABASE_ANON_KEY` | chave anon/public do Supabase |
   | `GEMINI_API_KEY` | chave gerada em <https://aistudio.google.com/apikey> |
   | `GEMINI_MODELOS` *(opcional)* | lista de modelos, do preferido ao reserva. Padrão: `gemini-3.1-flash-lite,gemini-3.5-flash,gemini-2.5-flash` |

4. **Deploys → Trigger deploy**. A cada `git push`, o Netlify publica de novo.

### 3. Instalar no celular
- **iPhone:** abra o site no **Safari** → botão **Compartilhar** → **Adicionar à Tela de Início**.
- **Android:** abra no **Chrome** → menu ⋮ → **Instalar app**.

Quando sair versão nova, o app mostra **"Nova versão disponível — Atualizar"**. Os dados ficam no Supabase,
então nada se perde ao atualizar, trocar de celular ou remover o ícone.

## Rodar na máquina

```bash
copy .env.example .env
```
Preencha o `.env` com a URL e a chave anon do Supabase. Depois:

```bash
npm install --registry=https://registry.yarnpkg.com
```
```bash
npm start
```
Abre em <http://localhost:4200>. A IA não funciona com `npm start` (a função só existe no Netlify);
para testá-la localmente use `npx netlify dev` com as variáveis no `.env`.

## Mapa do código

| Caminho | Papel |
|---|---|
| `src/app/dominio/parcelamento.ts` | Regra das parcelas (código puro, testado) |
| `src/app/nucleo/` | Supabase, login/guards, acesso a dados, chamada da IA, formatação |
| `src/app/telas/` | Uma tela por arquivo (entrar, primeiro acesso, painel, calendário, gasto, cadastros) |
| `src/styles.scss` | Todo o visual, por tokens; componentes não têm CSS próprio |
| `supabase/schema.sql` | Tabelas, RLS e a função `salvar_compra` (grava compra + parcelas numa transação) |
| `netlify/functions/interpretar-gasto.mts` | Frase → Gemini → campos do gasto |
| `scripts/gerar-ambiente.mjs` | Gera `src/app/ambiente.ts` (URL/chave pública do Supabase) antes do build |
| `scripts/gerar-icones.mjs` | Gera os ícones do PWA |

### Cuidados ao mexer
- **Segredo nunca no frontend.** Só a chave *anon* do Supabase vai para o navegador; quem protege os dados é a RLS.
  A chave do Gemini existe só nas variáveis do Netlify.
- **Mudou a estrutura do banco?** Crie um arquivo novo em `supabase/` (ex.: `002-....sql`) em vez de editar o antigo,
  e rode no SQL Editor.
- **Datas são texto `AAAA-MM-DD`** em todo o app, para o fuso do navegador não "andar" um dia.
- **Valores em centavos inteiros** no cálculo das parcelas; a função `salvar_compra` recusa se a soma não fechar.
- `src/app/ambiente.ts` e `.env` são gerados/locais e ficam fora do git.
