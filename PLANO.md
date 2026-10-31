# org-fin — Plano de desenvolvimento

App de organização financeira pessoal, publicado como **site instalável (PWA)** no Netlify.
No iPhone: Safari → Compartilhar → *Adicionar à Tela de Início*. No Android: Chrome → *Instalar app*.
Atualiza sozinho a cada deploy (sem QR, sem reinstalar).

## Decisões tomadas

| Tema | Decisão | Motivo |
|---|---|---|
| Plataforma | PWA (site instalável) | Sem conta Apple Developer; funciona em iOS e Android |
| Frontend | Angular 22 + `@angular/pwa` | Mesmo framework do HelpAgent |
| Dados | **Netlify Blobs**, um documento JSON | Tudo num lugar só, sem conta extra (Supabase foi descartado por simplicidade) |
| Login | Senha única (`APP_SENHA`) + token HMAC de 180 dias | App de uma pessoa; sem cadastro |
| IA | Gemini por Netlify Function | Chave fica no servidor; a IA só sugere, a pessoa confere |
| Visual | Escuro (zinco), destaque verde-limão, Geist, pílulas, entrada em conversa | Referência: apps conversacionais como o Pierre |

## Regras de negócio

1. **Parcelamento:** valor total ÷ nº de parcelas, sobra de centavos na 1ª (R$ 100 em 3x → 33,34 + 33,33 + 33,33).
2. **Mês da 1ª parcela:** à vista fora do cartão → mês da compra; parcelado fora do cartão → mês seguinte;
   cartão sem fechamento → mês seguinte; cartão com fechamento → até o fechamento, mês seguinte; depois, dois meses à frente.
3. Editar ou excluir uma compra refaz/apaga todas as parcelas juntas (o servidor calcula).
4. Excluir categoria/forma de pagamento não apaga gastos.

## Etapas

- [x] Projeto Angular + PWA, regra de parcelas com testes
- [x] Telas: entrar, primeiro acesso, painel, calendário, novo gasto (conversa), ajustes com backup
- [x] Funções Netlify: entrar, dados (Blobs), interpretar-gasto (Gemini com troca de modelo)
- [x] 18 testes (parcelas, ações dos dados, token); app testado no navegador com servidor simulado
- [x] Publicado no Netlify com `APP_SENHA`, `APP_SEGREDO`, `GEMINI_API_KEY`
- [x] Responsivo (celular, tablet, deitado, desktop) e acessibilidade
- [x] Foto do comprovante, fixos e entradas (com cadastro em massa), pago, fatura do cartão, desfazer, limite por categoria
- [x] Cofres com meta, relatórios do ano com exportação para Excel, assistente de perguntas, avisos de vencimento
- [ ] Testar no site publicado: foto real, assistente e avisos com Gemini e push de verdade

## Ideias para depois

- Importar extrato do banco (OFX/CSV)
- Dividir gasto com outra pessoa
