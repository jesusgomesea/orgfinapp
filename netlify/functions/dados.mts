// API de dados do org-fin. Guarda tudo num único documento JSON no Netlify Blobs (loja "orgfin", chave "banco").
//   GET  → devolve o banco inteiro (app de uma pessoa: são poucos KB mesmo com anos de gastos)
//   POST { acao, ... } → aplica a ação (netlify/lib/operacoes.mts) e devolve o banco atualizado
// Gravação com "onlyIfMatch" (etag): se dois aparelhos salvarem ao mesmo tempo, um tenta de novo em cima do
// dado mais novo em vez de apagar o do outro.
import { getStore } from '@netlify/blobs';
import { aplicar, bancoVazio, ErroDeRegra, type Acao, type Banco } from '../lib/operacoes.mts';
import { autorizado, configurado, json } from '../lib/sessao.mts';

const CHAVE = 'banco';
const TENTATIVAS = 3;

export default async (req: Request): Promise<Response> => {
  if (!configurado()) return json(500, { erro: 'Faltam as variáveis APP_SENHA e APP_SEGREDO no Netlify.' });
  if (!autorizado(req)) return json(401, { erro: 'Sessão expirada. Entre de novo.' });

  // strong: ler logo depois de gravar precisa ver o que acabou de ser gravado.
  const loja = getStore({ name: 'orgfin', consistency: 'strong' });

  if (req.method === 'GET') {
    const atual = await loja.get(CHAVE, { type: 'json' });
    return json(200, (atual as Banco | null) ?? bancoVazio());
  }
  if (req.method !== 'POST') return json(405, { erro: 'Use GET ou POST.' });

  const acao = (await req.json().catch(() => null)) as Acao | null;
  if (!acao?.acao) return json(400, { erro: 'Pedido inválido.' });

  for (let i = 0; i < TENTATIVAS; i++) {
    const lido = await loja.getWithMetadata(CHAVE, { type: 'json' });
    let novo: Banco;
    try {
      novo = aplicar((lido?.data as Banco | undefined) ?? bancoVazio(), acao);
    } catch (e) {
      if (e instanceof ErroDeRegra) return json(400, { erro: e.message });
      throw e;
    }
    const gravado = lido?.etag
      ? await loja.setJSON(CHAVE, novo, { onlyIfMatch: lido.etag })
      : await loja.setJSON(CHAVE, novo, { onlyIfNew: true });
    if (gravado.modified) return json(200, novo);
  }
  return json(409, { erro: 'Outro aparelho salvou ao mesmo tempo. Tente de novo.' });
};
