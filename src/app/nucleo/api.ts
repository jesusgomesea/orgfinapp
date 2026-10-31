// Chamadas às Netlify Functions (/.netlify/functions/*) com o token do login e mensagens de erro em português.
// Resposta 401 = token vencido ou senha trocada: apaga o token e volta para a tela de entrar.

export const CHAVE_TOKEN = 'orgfin.token';

export function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export class ErroApi extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function chamar<T>(funcao: string, opcoes: { metodo?: 'GET' | 'POST'; corpo?: unknown } = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`/.netlify/functions/${funcao}`, {
      method: opcoes.metodo ?? (opcoes.corpo === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lerToken() ?? ''}` },
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    });
  } catch {
    throw new ErroApi('Sem conexão. Verifique a internet.', 0);
  }
  const corpo = await resposta.json().catch(() => ({}));
  if (resposta.status === 401 && funcao !== 'entrar') {
    try { localStorage.removeItem(CHAVE_TOKEN); } catch { /* aba anônima */ }
    location.assign('/entrar');
  }
  if (!resposta.ok) {
    // Com "ng serve" as funções não existem: avisa em vez de mostrar 404.
    if (resposta.status === 404) throw new ErroApi('Servidor não encontrado. Rode com "npx netlify dev" ou use o site publicado.', 404);
    throw new ErroApi(corpo.erro ?? `Erro ${resposta.status}.`, resposta.status);
  }
  return corpo as T;
}

export function mensagemDeErro(erro: unknown): string {
  return (erro as { message?: string })?.message ?? String(erro);
}
