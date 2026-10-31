// Tela de login / criação de conta (Supabase Auth, e-mail + senha).
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../nucleo/auth';
import { mensagemDeErro, supabaseConfigurado } from '../nucleo/supabase';

@Component({
  selector: 'app-entrar',
  imports: [FormsModule],
  template: `
    <main class="centro">
      <form class="cartao estreito" (ngSubmit)="enviar()">
        <h1 class="marca">org<span>fin</span></h1>
        <p class="suave">{{ criando() ? 'Crie sua conta' : 'Entre para ver suas finanças' }}</p>

        @if (!configurado) {
          <p class="aviso erro">Supabase não configurado. Veja o README (SUPABASE_URL / SUPABASE_ANON_KEY).</p>
        }

        <label>E-mail <input type="email" name="email" [(ngModel)]="email" autocomplete="email" required /></label>
        <label>
          Senha
          <input type="password" name="senha" [(ngModel)]="senha" required minlength="6"
                 [attr.autocomplete]="criando() ? 'new-password' : 'current-password'" />
        </label>

        @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }
        @if (info()) { <p class="aviso ok">{{ info() }}</p> }

        <button class="primario" type="submit" [disabled]="ocupado()">
          {{ ocupado() ? 'Aguarde…' : criando() ? 'Criar conta' : 'Entrar' }}
        </button>
        <button class="link" type="button" (click)="criando.set(!criando()); erro.set('')">
          {{ criando() ? 'Já tenho conta' : 'Ainda não tenho conta' }}
        </button>
      </form>
    </main>
  `,
})
export class Entrar {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly configurado = supabaseConfigurado;
  protected email = '';
  protected senha = '';
  protected readonly criando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly erro = signal('');
  protected readonly info = signal('');

  protected async enviar() {
    this.erro.set('');
    this.info.set('');
    this.ocupado.set(true);
    try {
      if (this.criando()) {
        const { data, error } = await this.auth.criarConta(this.email.trim(), this.senha);
        if (error) throw error;
        // Com confirmação de e-mail ligada no Supabase, ainda não há sessão: precisa clicar no link.
        if (!data.session) {
          this.info.set('Conta criada! Abra o link que enviamos para o seu e-mail e depois entre aqui.');
          this.criando.set(false);
          return;
        }
      } else {
        const { error } = await this.auth.entrar(this.email.trim(), this.senha);
        if (error) throw error;
      }
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
