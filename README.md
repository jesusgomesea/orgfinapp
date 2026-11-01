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
- **Ajustes:** renda, formas de pagamento, categorias (com **limite por mês**), avisos e **backup** (baixar / restaurar .json).
- **Foto do comprovante:** no novo gasto, toque na câmera e mande a foto do cupom, nota ou print do Pix; a IA lê e preenche.
- **Fixos e entradas:** aluguel, internet, assinaturas e entradas fixas aparecem todo mês sozinhos. **Cadastro em massa:**
  várias linhas de uma vez, digitadas ou coladas para a IA ("aluguel 1800 dia 10, internet 120 dia 15…").
  Entradas avulsas (freela, 13º, reembolso) somam na renda do mês.
- **Pago / recebido:** cada parcela, fixo ou entrada tem um círculo para marcar; o painel mostra quanto falta pagar.
- **Fatura do cartão:** tocar no cartão desenhado abre a fatura do mês, com "marcar fatura como paga".
- **Desfazer:** depois de excluir um gasto, fixo, entrada ou registro de cofre, o aviso traz "Desfazer".
- **Limite por categoria:** a partir de 80% do limite, o painel mostra um alerta.
- **Cofres:** poupanças com meta opcional ("Construção da casa: R$ 80.000 até dez/2028"). Registre todo mês quanto
  guardou ou retirou; o app mostra o saldo, quanto falta e quanto guardar por mês. O guardado sai do "Disponível".
- **Relatórios:** ano mês a mês (gastos × renda), categorias, evolução dos cofres, maiores gastos e **exportar para Excel**.
- **Assistente:** pergunte em conversa ("quanto gastei com mercado este ano?", "onde posso economizar?").
- **Avisos de vencimento:** às 8h da véspera, o celular avisa o que vence amanhã e ainda não foi pago.
- **Lançamento rápido:** o **+** abre uma gaveta com o valor grande e um teclado numérico (como no Pix: 1-2-3-4 vira
  R$ 12,34), depois categoria, pagamento e parcelas em toques. "Mais opções" leva à tela completa (IA, foto, datas).
- **Gestos:** deslizar um gasto para a direita marca como pago; para a esquerda, exclui (com "Desfazer").
  Deslizar para os lados no painel, no calendário e na fatura troca o mês.
- **Ritmo do mês:** gráfico do gasto acumulado dia a dia contra o mês passado ("20% mais rápido que o mês passado").
- **Retrospectiva:** nos primeiros dias do mês, o painel oferece os "stories" do mês anterior (total, categoria campeã,
  maior gasto, dia mais caro, limites, cofres). Também em Relatórios.
- **Aparência (por aparelho):** seu nome na saudação, tema escuro/claro/automático e 6 cores de destaque.
- **Detalhes:** esqueleto brilhando enquanto carrega, vibração leve ao salvar/pagar (Android) e confete ao bater a meta de um cofre.
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

**Data da 1ª parcela informada:** se a loja ou o boleto disser quando vence (carnê, crediário, "primeira dia 10"),
preencha **"1ª parcela vence em"** (ou diga na frase para a IA). Essa data manda sobre a tabela acima: a 1ª cai nela,
mesmo que seja no mês atual, e as outras no mesmo dia dos meses seguintes.

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

**Avisos no celular:** em **Ajustes → Avisos de vencimento → Ligar**. No iPhone só funciona com o app **adicionado à
Tela de Início** (iOS 16.4 ou mais novo) e aberto por lá. Não precisa configurar nada no Netlify: as chaves de envio são
criadas sozinhas na primeira vez. A função `lembretes` roda todo dia às 8h (horário de Brasília) só no site publicado.

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
| `src/app/telas/` | Uma tela por arquivo (painel, calendário, gasto, fixos, cofres, fatura, relatórios, assistente, mais, ajustes…) |
| `src/styles.scss` | Todo o visual, por tokens; componentes não têm CSS próprio |
| `netlify/functions/entrar.mts` | Senha → token assinado |
| `netlify/functions/dados.mts` | Lê/grava o documento no Netlify Blobs (com controle de gravação simultânea) |
| `src/app/dominio/recorrencia.ts` | Fixos: gera as ocorrências de cada mês a partir da regra (código puro) |
| `netlify/functions/interpretar-gasto.mts` | Frase e/ou foto do comprovante → Gemini → campos do gasto |
| `netlify/functions/interpretar-lista.mts` | Lista colada → vários fixos de uma vez |
| `netlify/functions/perguntar.mts` | Assistente: lê os dados, monta o resumo e pergunta ao Gemini |
| `netlify/functions/avisos.mts` / `lembretes.mts` | Liga os avisos no aparelho / envia todo dia às 8h o que vence amanhã |
| `netlify/lib/gemini.mts` | Chamada ao Gemini compartilhada (troca de modelo, JSON estruturado, imagem) |
| `netlify/lib/resumo.mts` / `vencimentos.mts` / `push.mts` | Resumo para a IA, o que vence no dia, envio de notificações |
| `netlify/lib/operacoes.mts` | Ações sobre os dados: compras, fixos, entradas, cofres, pago, limites, backup (testado) |
| `netlify/lib/sessao.mts` | Senha, token HMAC, resposta JSON |
| `scripts/gerar-icones.mjs` | Gera os ícones do PWA |

### Cuidados ao mexer
- **Segredo nunca no frontend.** Senha, segredo do token e chave do Gemini só existem nas variáveis do Netlify.
- **Um usuário por site.** Quem tem a senha vê os mesmos dados. Para outra pessoa, publique outro site.
- **Tipos espelhados:** `src/app/nucleo/dados.ts` repete os tipos de `netlify/lib/operacoes.mts`. Mudou um, mude o outro.
- **Datas são texto `AAAA-MM-DD`** em todo o app, para o fuso do navegador não "andar" um dia.
- **Valores em centavos inteiros** no cálculo das parcelas; a soma sempre fecha com o total.
