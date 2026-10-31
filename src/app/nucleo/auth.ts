// Login por senha (a senha fica na variável APP_SENHA do Netlify) e os guards de rota:
// sem login → /entrar; logado mas sem o cadastro inicial → /primeiro-acesso.
import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CHAVE_TOKEN, chamar, lerToken } from './api';
import { Dados } from './dados';

@Injectable({ providedIn: 'root' })
export class Auth {
  async entrar(senha: string): Promise<void> {
    const { token } = await chamar<{ token: string }>('entrar', { corpo: { senha } });
    localStorage.setItem(CHAVE_TOKEN, token);
  }

  sair() {
    try { localStorage.removeItem(CHAVE_TOKEN); } catch { /* aba anônima */ }
  }

  token(): string | null {
    return lerToken();
  }

  /** Só olha a validade gravada no token; quem confere a assinatura é o servidor. */
  logado(): boolean {
    const token = lerToken();
    if (!token) return false;
    try {
      const payload = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(payload)).exp > Date.now();
    } catch {
      return false;
    }
  }
}

export const exigeLogin: CanActivateFn = () => {
  return inject(Auth).logado() ? true : inject(Router).parseUrl('/entrar');
};

// inject() só funciona antes do primeiro await — por isso o Router é pego no começo.
export const exigeCadastroInicial: CanActivateFn = async () => {
  const router = inject(Router);
  const dados = inject(Dados);
  try {
    return (await dados.banco()).configuracao ? true : router.parseUrl('/primeiro-acesso');
  } catch {
    return true; // sem rede: deixa entrar e a tela mostra o erro
  }
};
