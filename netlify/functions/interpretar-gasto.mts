// Netlify Function: recebe uma frase ("geladeira 3 mil em 10x no Nubank") e devolve os campos do gasto,
// usando o Gemini. Existe para a chave do Gemini nunca ir para o navegador.
//
// Proteções:
//  - só atende quem está logado: o token do Supabase é conferido no próprio Supabase (/auth/v1/user);
//  - frase limitada a 500 caracteres;
//  - a IA só sugere — o app mostra o resultado para a pessoa conferir antes de gravar.
//
// Variáveis de ambiente (painel do Netlify): GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY e,
// opcional, GEMINI_MODELOS (lista separada por vírgula, do preferido ao reserva).

const MODELOS_PADRAO = 'gemini-3.1-flash-lite,gemini-3.5-flash,gemini-2.5-flash';
const LIMITE_FRASE = 500;

// Formato exigido do Gemini (saída estruturada). null = não dá para saber pela frase.
const ESQUEMA = {
  type: 'object',
  properties: {
    descricao: { type: ['string', 'null'], description: 'O que foi comprado/pago, curto. Ex.: "Geladeira".' },
    estabelecimento: { type: ['string', 'null'], description: 'Para onde foi o dinheiro: loja, empresa ou pessoa.' },
    valor_total: { type: ['number', 'null'], description: 'Valor TOTAL em reais. "3 mil" = 3000. Se disser "10x de 300", o total é 3000.' },
    parcelas: { type: ['integer', 'null'], description: 'Número de parcelas. À vista = 1.' },
    data_compra: { type: ['string', 'null'], description: 'AAAA-MM-DD. "hoje", "ontem", "sexta" são relativos à data de hoje informada.' },
    categoria: { type: ['string', 'null'], description: 'Exatamente um nome da lista de categorias, ou null.' },
    conta: { type: ['string', 'null'], description: 'Exatamente um nome da lista de formas de pagamento, ou null.' },
    observacao: { type: ['string', 'null'], description: 'Só se algo ficou ambíguo; uma frase curta em português.' },
  },
  required: ['descricao', 'estabelecimento', 'valor_total', 'parcelas', 'data_compra', 'categoria', 'conta', 'observacao'],
};

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { erro: 'Use POST.' });

  const env = (nome: string) => process.env[nome] ?? '';
  if (!env('GEMINI_API_KEY') || !env('SUPABASE_URL') || !env('SUPABASE_ANON_KEY')) {
    return json(500, { erro: 'Servidor sem configuração da IA (variáveis do Netlify).' });
  }

  // 1) Quem está chamando?
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { erro: 'Entre na sua conta para usar a IA.' });
  const usuario = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: `Bearer ${token}` },
  });
  if (!usuario.ok) return json(401, { erro: 'Sessão expirada. Entre de novo.' });

  // 2) Pedido
  const corpo = (await req.json().catch(() => null)) as
    | { frase?: string; hoje?: string; categorias?: string[]; contas?: string[] }
    | null;
  const frase = (corpo?.frase ?? '').trim();
  if (!frase) return json(400, { erro: 'Escreva o gasto.' });
  if (frase.length > LIMITE_FRASE) return json(400, { erro: `Frase muito longa (máx. ${LIMITE_FRASE} caracteres).` });
  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(corpo?.hoje ?? '') ? corpo!.hoje! : new Date().toISOString().slice(0, 10);
  const categorias = (corpo?.categorias ?? []).slice(0, 100);
  const contas = (corpo?.contas ?? []).slice(0, 50);

  const instrucao =
    'Você extrai dados de um gasto pessoal descrito em português do Brasil. Responda só no formato pedido.\n' +
    `Hoje é ${hoje} (${new Date(hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}).\n` +
    `Categorias cadastradas: ${categorias.join(', ') || '(nenhuma)'}.\n` +
    `Formas de pagamento cadastradas: ${contas.join(', ') || '(nenhuma)'}.\n` +
    'Regras: valor_total é sempre o TOTAL da compra; sem data na frase, use hoje; escolha categoria e conta ' +
    'apenas entre os nomes cadastrados (o mais parecido), senão null; não invente o que a frase não diz.';

  // 3) Gemini, descendo a lista de modelos se um estiver esgotado/sobrecarregado/indisponível.
  const modelos = (env('GEMINI_MODELOS') || MODELOS_PADRAO).split(',').map((m) => m.trim()).filter(Boolean);
  let ultimoErro = '';
  for (const modelo of modelos) {
    const resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      // Chave no cabeçalho, nunca na URL (URL aparece em log).
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instrucao }] },
        contents: [{ role: 'user', parts: [{ text: frase }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: ESQUEMA },
      }),
    });

    if (resposta.status === 429 || resposta.status === 503 || resposta.status === 404) {
      ultimoErro = `${modelo}: HTTP ${resposta.status}`;
      continue;
    }
    if (!resposta.ok) {
      console.error('Gemini falhou', modelo, resposta.status, await resposta.text());
      return json(502, { erro: 'A IA não conseguiu ler agora. Preencha manualmente.' });
    }

    const dados = await resposta.json();
    const texto: string = dados?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    try {
      return json(200, limpar(JSON.parse(texto), categorias, contas));
    } catch {
      console.error('Resposta do Gemini fora do formato', modelo, texto);
      return json(502, { erro: 'A IA respondeu fora do formato. Tente reescrever a frase.' });
    }
  }

  console.error('Todos os modelos indisponíveis', ultimoErro);
  return json(503, { erro: 'Limite da IA atingido por agora. Preencha manualmente ou tente mais tarde.' });
};

/** Não confia cegamente na IA: tipos, faixas e nomes só da lista. */
function limpar(s: Record<string, unknown>, categorias: string[], contas: string[]) {
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  const valor = typeof s['valor_total'] === 'number' && s['valor_total'] > 0 ? Math.round(s['valor_total'] * 100) / 100 : null;
  const parcelas = Number.isInteger(s['parcelas']) && (s['parcelas'] as number) >= 1 && (s['parcelas'] as number) <= 120 ? s['parcelas'] : null;
  const data = typeof s['data_compra'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s['data_compra']) ? s['data_compra'] : null;
  const daLista = (v: unknown, lista: string[]) => (typeof v === 'string' && lista.includes(v) ? v : texto(v));
  return {
    descricao: texto(s['descricao']),
    estabelecimento: texto(s['estabelecimento']),
    valor_total: valor,
    parcelas,
    data_compra: data,
    categoria: daLista(s['categoria'], categorias),
    conta: daLista(s['conta'], contas),
    observacao: texto(s['observacao']),
  };
}

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

declare const process: { env: Record<string, string | undefined> };
