// Login por senha única (variável APP_SENHA) e "crachá" assinado que o app guarda no aparelho.
// O token é payload.assinatura com HMAC-SHA256 usando APP_SEGREDO: não dá para forjar sem o segredo,
// e trocar o APP_SEGREDO no Netlify desloga todos os aparelhos de uma vez.
import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import process from 'node:process';

const DIAS_VALIDADE = 180;

export const env = (nome: string) => process.env[nome] ?? '';

export function configurado(): boolean {
  return !!env('APP_SENHA') && env('APP_SEGREDO').length >= 16;
}

export function senhaConfere(senha: string): boolean {
  const a = Buffer.from(senha);
  const b = Buffer.from(env('APP_SENHA'));
  // timingSafeEqual exige o mesmo tamanho; comparar tamanhos antes não revela a senha.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function emitirToken(agora = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: agora + DIAS_VALIDADE * 86_400_000 })).toString('base64url');
  return `${payload}.${assinar(payload)}`;
}

export function tokenValido(token: string, agora = Date.now()): boolean {
  const [payload, assinatura] = token.split('.');
  if (!payload || !assinatura) return false;
  const esperada = Buffer.from(assinar(payload));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > agora;
  } catch {
    return false;
  }
}

/** Confere o "Authorization: Bearer ..." da requisição. */
export function autorizado(req: Request): boolean {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return !!token && tokenValido(token);
}

export function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function assinar(payload: string): string {
  return createHmac('sha256', env('APP_SEGREDO')).update(payload).digest('base64url');
}
