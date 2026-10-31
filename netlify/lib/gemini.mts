// Chamada ao Gemini compartilhada pelas funções de IA (interpretar-gasto, interpretar-lista, perguntar).
// - Chave no cabeçalho, nunca na URL (URL aparece em log).
// - Desce a lista de modelos (GEMINI_MODELOS) quando um está esgotado/sobrecarregado/indisponível (429/503/404).
// - Com "esquema", pede JSON estruturado e já devolve o objeto; sem esquema, devolve o texto.
import { env } from './sessao.mts';

const MODELOS_PADRAO = 'gemini-3.1-flash-lite,gemini-3.5-flash,gemini-2.5-flash';

export type Parte = { text: string } | { inlineData: { mimeType: string; data: string } };
export interface Mensagem {
  role: 'user' | 'model';
  parts: Parte[];
}

export class ErroGemini extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function chamarGemini(opcoes: {
  instrucao: string;
  conversa: Mensagem[];
  esquema?: object;
  temperatura?: number;
  /** Modelos com suporte a imagem: os flash atuais aceitam; a lista é a mesma. */
}): Promise<unknown> {
  if (!env('GEMINI_API_KEY')) throw new ErroGemini('Falta a variável GEMINI_API_KEY no Netlify.', 500);
  const modelos = (env('GEMINI_MODELOS') || MODELOS_PADRAO).split(',').map((m) => m.trim()).filter(Boolean);
  const generationConfig: Record<string, unknown> = { temperature: opcoes.temperatura ?? 0 };
  if (opcoes.esquema) {
    generationConfig['responseMimeType'] = 'application/json';
    generationConfig['responseJsonSchema'] = opcoes.esquema;
  }

  let ultimoErro = '';
  for (const modelo of modelos) {
    const resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: opcoes.instrucao }] }, contents: opcoes.conversa, generationConfig }),
    });
    if (resposta.status === 429 || resposta.status === 503 || resposta.status === 404) {
      ultimoErro = `${modelo}: HTTP ${resposta.status}`;
      continue;
    }
    if (!resposta.ok) {
      console.error('Gemini falhou', modelo, resposta.status, await resposta.text());
      throw new ErroGemini('A IA não conseguiu responder agora. Tente de novo.', 502);
    }
    const dados = await resposta.json();
    const texto: string = dados?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    if (!opcoes.esquema) return texto.trim();
    try {
      return JSON.parse(texto);
    } catch {
      console.error('Resposta do Gemini fora do formato', modelo, texto);
      throw new ErroGemini('A IA respondeu fora do formato. Tente de novo.', 502);
    }
  }
  console.error('Todos os modelos indisponíveis', ultimoErro);
  throw new ErroGemini('Limite da IA atingido por agora. Tente mais tarde.', 503);
}

/** Dia da semana por extenso, para a IA entender "ontem", "sexta"... */
export function descreverHoje(hoje: string): string {
  return `Hoje é ${hoje} (${new Date(hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}).`;
}

export function hojeValido(v: unknown): string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().slice(0, 10);
}

/** Imagem enviada pelo app: só tipos de imagem comuns e até ~4 MB em base64. */
export function imagemValida(v: unknown): { mimeType: string; data: string } | null {
  const i = v as { mime?: string; base64?: string } | null;
  if (!i?.mime || !i.base64) return null;
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(i.mime)) throw new ErroGemini('Envie uma foto (JPG, PNG ou WEBP).', 400);
  if (i.base64.length > 5_500_000) throw new ErroGemini('Foto grande demais.', 400);
  return { mimeType: i.mime, data: i.base64 };
}
