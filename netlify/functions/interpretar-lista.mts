// Netlify Function: transforma uma lista colada ("aluguel 1800 dia 10, internet 120 dia 15, netflix 55 dia 20")
// em vários gastos/entradas FIXOS de uma vez (cadastro em massa da tela "Fixos e entradas").
// A IA só sugere: o app mostra as linhas preenchidas para a pessoa conferir antes de salvar.
import { chamarGemini, ErroGemini } from '../lib/gemini.mts';
import { autorizado, json } from '../lib/sessao.mts';

const LIMITE = 2000;

const ESQUEMA = {
  type: 'object',
  properties: {
    itens: {
      type: 'array',
      maxItems: 40,
      items: {
        type: 'object',
        properties: {
          descricao: { type: 'string', description: 'Nome curto. Ex.: "Aluguel", "Internet", "Netflix".' },
          valor: { type: ['number', 'null'], description: 'Valor mensal em reais. "1,8 mil" = 1800.' },
          dia: { type: ['integer', 'null'], description: 'Dia do mês em que vence/cai (1 a 31), se dito.' },
          categoria: { type: ['string', 'null'], description: 'Exatamente um nome da lista de categorias, ou null.' },
          conta: { type: ['string', 'null'], description: 'Exatamente um nome da lista de formas de pagamento, ou null.' },
        },
        required: ['descricao', 'valor', 'dia', 'categoria', 'conta'],
      },
    },
  },
  required: ['itens'],
};

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { erro: 'Use POST.' });
  if (!autorizado(req)) return json(401, { erro: 'Sessão expirada. Entre de novo.' });

  const corpo = (await req.json().catch(() => null)) as { texto?: string; tipo?: string; categorias?: string[]; contas?: string[] } | null;
  const texto = (corpo?.texto ?? '').trim();
  if (!texto) return json(400, { erro: 'Escreva ou cole a lista.' });
  if (texto.length > LIMITE) return json(400, { erro: `Lista muito longa (máx. ${LIMITE} caracteres).` });
  const entrada = corpo?.tipo === 'entrada';
  const categorias = (corpo?.categorias ?? []).slice(0, 100);
  const contas = (corpo?.contas ?? []).slice(0, 50);

  const instrucao =
    `Você recebe uma lista, em português do Brasil, de ${entrada ? 'ENTRADAS de dinheiro que se repetem todo mês' : 'GASTOS FIXOS mensais'} ` +
    'e devolve um item por linha/item da lista. Responda só no formato pedido.\n' +
    (entrada ? '' : `Categorias cadastradas: ${categorias.join(', ') || '(nenhuma)'}.\nFormas de pagamento cadastradas: ${contas.join(', ') || '(nenhuma)'}.\n`) +
    'Regras: não invente itens nem valores; categoria e conta só entre os nomes cadastrados (o mais parecido), senão null' +
    (entrada ? '; para entradas, categoria e conta são sempre null.' : '.');

  try {
    const r = (await chamarGemini({ instrucao, conversa: [{ role: 'user', parts: [{ text: texto }] }], esquema: ESQUEMA })) as { itens?: unknown[] };
    const itens = (r.itens ?? []).slice(0, 40).map((i) => limpar(i as Record<string, unknown>, categorias, contas, entrada));
    return json(200, itens.filter((i) => i.descricao));
  } catch (e) {
    if (e instanceof ErroGemini) return json(e.status, { erro: e.message });
    throw e;
  }
};

function limpar(s: Record<string, unknown>, categorias: string[], contas: string[], entrada: boolean) {
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  const daLista = (v: unknown, lista: string[]) => (typeof v === 'string' && lista.includes(v) ? v : null);
  const dia = Number.isInteger(s['dia']) && (s['dia'] as number) >= 1 && (s['dia'] as number) <= 31 ? (s['dia'] as number) : null;
  return {
    descricao: texto(s['descricao']),
    valor: typeof s['valor'] === 'number' && s['valor'] > 0 ? Math.round(s['valor'] * 100) / 100 : null,
    dia,
    categoria: entrada ? null : daLista(s['categoria'], categorias),
    conta: entrada ? null : daLista(s['conta'], contas),
  };
}
