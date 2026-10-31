# org-fin — Plano de desenvolvimento

App de organização financeira pessoal, publicado como **site instalável (PWA)** no Netlify.
No iPhone: Safari → Compartilhar → *Adicionar à Tela de Início*. No Android: Chrome → *Instalar app*.
Atualiza sozinho a cada deploy (sem QR, sem reinstalar).

## Decisões tomadas

| Tema | Decisão | Motivo |
|---|---|---|
| Plataforma | PWA (site instalável) | Sem conta Apple Developer; funciona em iOS e Android |
| Frontend | Angular 22 + `@angular/pwa` | Mesmo framework do HelpAgent |
| Login + banco | **Supabase** (Auth + Postgres, plano gratuito) | Netlify Identity foi descontinuado (fev/2025); dados sobrevivem à troca de celular e sincronizam entre aparelhos |
| Segurança dos dados | Row Level Security: cada usuário só lê/grava as próprias linhas | Garantido pelo banco, não pela tela |
| IA | Gemini chamado por uma **Netlify Function** | Chave fica nas variáveis do Netlify, nunca no navegador; função exige o token do Supabase |
| Hospedagem | Netlify | Deploy contínuo, HTTPS, funções |

## Modelo de dados (Supabase / Postgres)

- `configuracao` — renda mensal, dia do salário, saldo inicial (1 linha por usuário)
- `categoria` — para onde vai o dinheiro (Mercado, Moradia, Transporte…)
- `conta_cartao` — forma de pagamento; cartão de crédito tem **dia de fechamento** opcional
- `compra` — o que foi informado: descrição, estabelecimento, **valor total**, **nº de parcelas**, data, categoria, cartão
- `lancamento` — cada parcela: `compra_id`, número (3/10), valor, **mês de competência**, data prevista

Todas com `usuario_id` (= `auth.uid()`) e política RLS.

## Regras de negócio

1. **Parcelamento:** valor total ÷ nº de parcelas. Sobra de centavos vai para a 1ª parcela
   (R$ 100 em 3x → 33,34 + 33,33 + 33,33). Soma das parcelas = valor total, sempre.
2. **Mês da 1ª parcela:**
   - à vista fora do cartão (dinheiro/Pix/débito) → mês da compra;
   - parcelado fora do cartão (boleto/carnê) → mês seguinte;
   - cartão **sem** dia de fechamento → mês seguinte à compra;
   - cartão **com** dia de fechamento → compra até o fechamento cai no mês seguinte; depois do fechamento, dois meses à frente.
3. Editar ou excluir uma compra refaz/apaga todas as suas parcelas juntas (função no banco, transação única).
4. A IA só **sugere**: o usuário revisa os campos antes de gravar.

## Telas

1. **Login** — e-mail + senha (Supabase Auth).
2. **Primeiro acesso** — renda, dia do salário, saldo inicial, categorias e cartões iniciais.
3. **Painel do mês** — gasto × renda, gastos por categoria, quanto já está comprometido com parcelas nos próximos meses.
4. **Calendário** — grade do mês; cada dia mostra os lançamentos; parcelas aparecem como
   "Geladeira (3/10) — R$ 300,00 → Casas Bahia / Eletrodomésticos".
5. **Novo gasto** — campo de frase livre ("geladeira 3 mil em 10x no Nubank, Casas Bahia") →
   Gemini preenche → revisão → gravar. Formulário manual sempre disponível (ditado do teclado funciona).
6. **Cadastros** — categorias e cartões.

## Etapas

- [x] 1. Projeto Angular 22 + PWA + `@supabase/supabase-js` em `org-fin`
- [x] 2. `supabase/schema.sql` — tabelas, RLS, função `salvar_compra` (compra + parcelas numa transação)
- [x] 3. Serviços: cliente Supabase, autenticação (guards), dados, cálculo de parcelas (9 testes)
- [x] 4. Telas acima, visual por tokens em `styles.scss`, pensado para celular
- [x] 5. `netlify/functions/interpretar-gasto` (Gemini, com troca de modelo) + `netlify.toml`
- [x] 6. README: criar contas Supabase/Netlify, rodar o SQL, variáveis de ambiente, instalar no celular
- [x] 7. Build sem avisos; regra de parcelas testada; função testada com Gemini simulado
- [ ] 8. Publicar (depende das contas) e testar de ponta a ponta com Supabase e Gemini reais

## O que fica com você (na hora de publicar)

1. Criar conta gratuita no **Supabase** → novo projeto → colar `supabase/schema.sql` no SQL Editor.
2. Criar conta gratuita no **Netlify** → conectar o repositório.
3. Gerar a chave do **Gemini** no Google AI Studio e colar nas variáveis de ambiente do Netlify
   (junto com URL e chave pública do Supabase).
