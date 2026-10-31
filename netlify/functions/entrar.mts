// POST { senha } → { token }. Senha errada demora ~1 s de propósito, para atrapalhar quem tenta adivinhar.
import { emitirToken, json, problemaDeConfiguracao, senhaConfere } from '../lib/sessao.mts';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { erro: 'Use POST.' });
  const problema = problemaDeConfiguracao();
  if (problema) return json(500, { erro: problema });
  const corpo = (await req.json().catch(() => null)) as { senha?: string } | null;
  if (!senhaConfere(String(corpo?.senha ?? ''))) {
    await new Promise((r) => setTimeout(r, 1000));
    return json(401, { erro: 'Senha incorreta.' });
  }
  return json(200, { token: emitirToken() });
};
