// Cliente único do Supabase (login + banco). Todo acesso a dados passa por aqui.
import { createClient } from '@supabase/supabase-js';
import { ambiente } from '../ambiente';

export const supabase = createClient(ambiente.supabaseUrl || 'http://sem-configuracao.invalid', ambiente.supabaseChavePublica || 'x', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const supabaseConfigurado = !!(ambiente.supabaseUrl && ambiente.supabaseChavePublica);

/** Erro do Supabase → mensagem em português para mostrar na tela. */
export function mensagemDeErro(erro: unknown): string {
  const msg = (erro as { message?: string })?.message ?? String(erro);
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/User already registered/i.test(msg)) return 'Já existe uma conta com este e-mail.';
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet.';
  if (/duplicate key/i.test(msg)) return 'Já existe um cadastro com esse nome.';
  return msg;
}
