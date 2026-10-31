# org-fin — Organização financeira

Site instalável (PWA) para registrar gastos do mês, com parcelamento automático no calendário.
Funciona no iPhone e no Android sem loja de apps, se atualiza sozinho a cada publicação e roda **só no Netlify**:
sem banco externo nem outra conta para configurar.

- **Frontend:** Angular 22 + service worker (`@angular/pwa`), visual escuro com destaque verde-limão e fonte Geist
- **Dados:** Netlify Blobs (armazenamento do próprio Netlify), um documento JSON
- **Login:** uma senha do app (variável `APP_SENHA`), aparelho fica lembrado por 180 dias
- **IA:** Gemini, chamado por uma Netlify Function (a chave nunca vai para o navegador)

## O que o app faz

- **Primeiro acesso:** renda, dia do salário, saldo, categorias e formas de pagamento.
- **Novo gasto, em conversa:** escreva ou fale "geladeira 3 mil em 10x no Nubank" → a IA responde o que entendeu e
  preenche o formulário → você confere → salva. O formulário manual funciona sempre.
- **Parcelas:** valor total ÷ parcelas, sobra de centavos na 1ª. Cada parcela aparece no calendário do mês em que cai,
  com "Geladeira 3/10 — R$ 300,00 → Casas Bahia · Eletrodomésticos".
- **Painel do mês:** gasto × renda (com o "olhinho" para esconder valores), atalhos, cartões de crédito desenhados com a
  fatura do mês, gastos por categoria com ícones, próximos 30 dias e quanto dos próximos 12 meses já está comprometido.
- **Calendário:** busca no mês (descrição, loja, categoria, cartão); ao salvar um gasto, abre no mês da 1ª parcela.
- **Ajustes:** renda, formas de pagamento, categorias e **backup** (baixar / restaurar um arquivo .json).
- **Funciona em qualquer tela:** celular (barra de abas embaixo), tablet (blocos lado a lado) e desktop (menu lateral,
  telas em duas colunas, tecla **N** abre um novo gasto). Ao voltar para o app, busca o que outro aparelho lançou.

### Em que mês cai a 1ª parcela

| Forma de pagamento | 1ª parcela |
|---|---|
| Pix, débito, dinheiro, à vista | no mês e no dia da compra |
| Boleto/carnê ou outro parcelado sem cartão | mês seguinte |
| Cartão de crédito sem dia de fechamento | mês seguinte |
| Cartão com fechamento, compra **até** o dia de fechamento | mês seguinte, no dia do vencimento |
| Cartão com fechamento, compra **depois** do fechamento | dois meses à frente |

A regra está em [`src/app/dominio/parcelamento.ts`](src/app/dominio/parcelamento.ts) e é usada pelo app (prévia) e pelo
servidor (gravação).

## Publicar

1. Site importado do GitHub no Netlify (o `netlify.toml` já diz como fazer o build).
2. **Site configuration → Environment variables**, crie:

   | Variável | Valor | Secreta? |
   |---|---|---|
   | `APP_SENHA` | a senha para entrar no app | sim |
   | `APP_SEGREDO` | um texto aleatório com **16 caracteres ou mais** (ex.: bata no teclado). Trocar desloga todos os aparelhos | sim |
   | `GEMINI_API_KEY` | chave de <https://aistudio.google.com/apikey> | sim |
   | `GEMINI_MODELOS` *(opcional)* | modelos do preferido ao reserva. Padrão: `gemini-3.1-flash-lite,gemini-3.5-flash,gemini-2.5-flash` | não |

3. **Deploys → Trigger deploy**. A cada `git push`, o Netlify publica de novo.

### Instalar no celular
- **iPhone:** abra o site no **Safari** → **Compartilhar** → **Adicionar à Tela de Início**.
- **Android:** abra no **Chrome** → menu ⋮ → **Instalar app**.

Versão nova aparece como **"Nova versão disponível — Atualizar"**. Os dados ficam no Netlify: nada se perde ao
atualizar, trocar de celular ou remover o ícone. Mesmo assim, baixe um backup de vez em quando em **Ajustes**.

## Rodar na máquina

```bash
npm install --registry=https://registry.yarnpkg.com
```
```bash
npm test
```
`npm start` sobe só as telas (sem as funções, então não entra). Para o app completo use `npx netlify dev`
com `APP_SENHA`, `APP_SEGREDO` e `GEMINI_API_KEY` num arquivo `.env` (fora do git).

## Mapa do código

| Caminho | Papel |
|---|---|
| `src/app/dominio/parcelamento.ts` | Regra das parcelas (código puro, testado) |
| `src/app/nucleo/` | API, login/guards, dados (cache do documento), IA, ícones, formatação |
| `src/app/telas/` | Uma tela por arquivo (entrar, primeiro acesso, painel, calendário, gasto, ajustes) |
| `src/styles.scss` | Todo o visual, por tokens; componentes não têm CSS próprio |
| `netlify/functions/entrar.mts` | Senha → token assinado |
| `netlify/functions/dados.mts` | Lê/grava o documento no Netlify Blobs (com controle de gravação simultânea) |
| `netlify/functions/interpretar-gasto.mts` | Frase → Gemini → campos do gasto |
| `netlify/lib/operacoes.mts` | Ações sobre os dados: validação, parcelas, backup (testado) |
| `netlify/lib/sessao.mts` | Senha, token HMAC, resposta JSON |
| `scripts/gerar-icones.mjs` | Gera os ícones do PWA |

### Cuidados ao mexer
- **Segredo nunca no frontend.** Senha, segredo do token e chave do Gemini só existem nas variáveis do Netlify.
- **Um usuário por site.** Quem tem a senha vê os mesmos dados. Para outra pessoa, publique outro site.
- **Tipos espelhados:** `src/app/nucleo/dados.ts` repete os tipos de `netlify/lib/operacoes.mts`. Mudou um, mude o outro.
- **Datas são texto `AAAA-MM-DD`** em todo o app, para o fuso do navegador não "andar" um dia.
- **Valores em centavos inteiros** no cálculo das parcelas; a soma sempre fecha com o total.
