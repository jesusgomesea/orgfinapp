// Netlify Function: recebe uma frase ("geladeira 3 mil em 10x no Nubank") e/ou a FOTO de um comprovante
// (cupom fiscal, nota, print do Pix) e devolve os campos do gasto, usando o Gemini.
// Existe para a chave do Gemini nunca ir para o navegador.
//
// Proteções:
//  - só atende quem entrou com a senha do app (token assinado);
//  - frase limitada a 500 caracteres; foto só de imagem e com tamanho máximo;
//  - a IA só sugere — o app mostra o resultado para a pessoa conferir antes de gravar.
import { chamarGemini, descreverHoje, ErroGemini, hojeValido, imagemValida, type Parte } from '../lib/gemini.mts';
import { autorizado, json } from '../lib/sessao.mts';

const LIMITE_FRASE = 500;

// Formato exigido do Gemini (saída estruturada). null = não dá para saber.
const ESQUEMA = {
  type: 'object',
  properties: {
    descricao: { type: ['string', 'null'], description: 'O que foi comprado/pago, curto. Ex.: "Geladeira", "Compras do mercado".' },
    estabelecimento: { type: ['string', 'null'], description: 'Para onde foi o dinheiro: loja, empresa ou pessoa.' },
    valor_total: { type: ['number', 'null'], description: 'Valor TOTAL em reais. "3 mil" = 3000. Se disser "10x de 300", o total é 3000. No cupom, o TOTAL A PAGAR.' },
    parcelas: { type: ['integer', 'null'], description: 'Número de parcelas. À vista = 1.' },
    data_compra: { type: ['string', 'null'], description: 'AAAA-MM-DD. "hoje", "ontem", "sexta" são relativos à data de hoje informada. No comprovante, a data impressa.' },
    primeira_parcela: {
      type: ['string', 'null'],
      description:
        'AAAA-MM-DD em que a 1ª parcela (ou o pagamento) vence, SÓ se for dito: "primeira dia 10", "começa a pagar 10/11", ' +
        '"vence dia 10", "cai agora dia 10". Dia sem mês = próxima ocorrência desse dia a partir de hoje. Senão null.',
    },
    categoria: { type: ['string', 'null'], description: 'Exatamente um nome da lista de categorias, ou null.' },
    conta: { type: ['string', 'null'], description: 'Exatamente um nome da lista de formas de pagamento, ou null. Pix no comprovante = a conta "Pix" se existir.' },
    observacao: { type: ['string', 'null'], description: 'Só se algo ficou ambíguo ou ilegível; uma frase curta em português.' },
  },
  required: ['descricao', 'estabelecimento', 'valor_total', 'parcelas', 'data_compra', 'primeira_parcela', 'categoria', 'conta', 'observacao'],
};

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { erro: 'Use POST.' });
  if (!autorizado(req)) return json(401, { erro: 'Sessão expirada. Entre de novo.' });

  const corpo = (await req.json().catch(() => null)) as
    | { frase?: string; hoje?: string; categorias?: string[]; contas?: string[]; imagem?: { mime: string; base64: string } }
    | null;
  const frase = (corpo?.frase ?? '').trim();
  try {
    const imagem = imagemValida(corpo?.imagem);
    if (!frase && !imagem) return json(400, { erro: 'Escreva o gasto ou envie uma foto.' });
    if (frase.length > LIMITE_FRASE) return json(400, { erro: `Frase muito longa (máx. ${LIMITE_FRASE} caracteres).` });
    const hoje = hojeValido(corpo?.hoje);
    const categorias = (corpo?.categorias ?? []).slice(0, 100);
    const contas = (corpo?.contas ?? []).slice(0, 50);

    const instrucao =
      'Você extrai dados de um gasto pessoal, a partir de uma frase em português do Brasil e/ou da foto de um comprovante ' +
      '(cupom fiscal, nota, recibo, print de Pix ou de compra no cartão). Responda só no formato pedido.\n' +
      `${descreverHoje(hoje)}\n` +
      `Categorias cadastradas: ${categorias.join(', ') || '(nenhuma)'}.\n` +
      `Formas de pagamento cadastradas: ${contas.join(', ') || '(nenhuma)'}.\n` +
      'Regras: valor_total é sempre o TOTAL da compra; sem data, use hoje; escolha categoria e conta ' +
      'apenas entre os nomes cadastrados (o mais parecido), senão null; não invente o que não está escrito. ' +
      'Se a frase e a foto se complementam, use as duas (a frase manda em caso de conflito).';

    const partes: Parte[] = [];
    if (imagem) partes.push({ inlineData: imagem });
    partes.push({ text: frase || 'Leia o comprovante da foto.' });

    const resposta = await chamarGemini({ instrucao, conversa: [{ role: 'user', parts: partes }], esquema: ESQUEMA });
    return json(200, limpar(resposta as Record<string, unknown>, categorias, contas));
  } catch (e) {
    if (e instanceof ErroGemini) return json(e.status, { erro: e.message });
    throw e;
  }
};

/** Não confia cegamente na IA: tipos, faixas e nomes só da lista. */
function limpar(s: Record<string, unknown>, categorias: string[], contas: string[]) {
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  const valor = typeof s['valor_total'] === 'number' && s['valor_total'] > 0 ? Math.round(s['valor_total'] * 100) / 100 : null;
  const parcelas = Number.isInteger(s['parcelas']) && (s['parcelas'] as number) >= 1 && (s['parcelas'] as number) <= 120 ? s['parcelas'] : null;
  const dataValida = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const daLista = (v: unknown, lista: string[]) => (typeof v === 'string' && lista.includes(v) ? v : texto(v));
  return {
    descricao: texto(s['descricao']),
    estabelecimento: texto(s['estabelecimento']),
    valor_total: valor,
    parcelas,
    data_compra: dataValida(s['data_compra']),
    primeira_parcela: dataValida(s['primeira_parcela']),
    categoria: daLista(s['categoria'], categorias),
    conta: daLista(s['conta'], contas),
    observacao: texto(s['observacao']),
  };
}
