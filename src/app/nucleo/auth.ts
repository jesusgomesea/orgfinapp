// Sessão do usuário (Supabase Auth) e os guards de rota:
// sem login → /entrar; logado mas sem o cadastro inicial → /primeiro-acesso.
import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

@Injectable({ providedIn: 'root' })
export class Auth {
  readonly sessao = signal<Session | null>(null);
  private readonly pronta: Promise<void>;

  constructor() {
    this.pronta = supabase.auth.getSession().then(({ data }) => this.sessao.set(data.session));
    supabase.auth.onAuthStateChange((_evento, sessao) => this.sessao.set(sessao));
  }

  /** Espera a sessão salva no aparelho ser lida antes de decidir a rota. */
  async aguardar(): Promise<Session | null> {
    await this.pronta;
    return this.sessao();
  }

  entrar(email: string, senha: string) {
    return supabase.auth.signInWithPassword({ email, password: senha });
  }

  criarConta(email: string, senha: string) {
    return supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin } });
  }

  sair() {
    return supabase.auth.signOut();
  }

  /** Token para a Netlify Function do Gemini provar quem está chamando. */
  token(): string | undefined {
    return this.sessao()?.access_token;
  }
}

// inject() só funciona antes do primeiro await — por isso o Router é pego no começo.
export const exigeLogin: CanActivateFn = async () => {
  const router = inject(Router);
  const sessao = await inject(Auth).aguardar();
  return sessao ? true : router.parseUrl('/entrar');
};

export const exigeCadastroInicial: CanActivateFn = async () => {
  const router = inject(Router);
  const { data, error } = await supabase.from('configuracao').select('usuario_id').maybeSingle();
  // Erro de rede não deve mandar para o cadastro inicial (sobrescreveria nada, mas confunde); deixa entrar.
  if (error) return true;
  return data ? true : router.parseUrl('/primeiro-acesso');
};
