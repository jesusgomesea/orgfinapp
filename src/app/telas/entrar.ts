// Tela de entrada: só a senha do app (variável APP_SENHA no Netlify). Depois de entrar, o aparelho fica
// lembrado por 180 dias.
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { mensagemDeErro } from '../nucleo/api';
import { Auth } from '../nucleo/auth';
import { Icone } from '../nucleo/icone';

@Component({
  selector: 'app-entrar',
  imports: [FormsModule, Icone],
  template: `
    <main class="entrada">
      <div class="entrada-marca">
        <img src="icons/icon-192x192.png" alt="" width="56" height="56" />
        <span class="marca">org<span>fin</span></span>
        <h1>Seu dinheiro,<br />mês a mês.</h1>
        <p>Conte o que gastou. O resto a gente organiza.</p>
      </div>

      <form class="cartao" (ngSubmit)="enviar()">
        <label>
          Senha do app
          <span class="campo-icone">
            <app-icone nome="cadeado" />
            <input type="password" name="senha" [(ngModel)]="senha" autocomplete="current-password" required autofocus />
          </span>
        </label>
        @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }
        <button class="primario largo" type="submit" [disabled]="ocupado() || !senha">
          {{ ocupado() ? 'Entrando…' : 'Entrar' }}
        </button>
      </form>
    </main>
  `,
})
export class Entrar {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected senha = '';
  protected readonly ocupado = signal(false);
  protected readonly erro = signal('');

  protected async enviar() {
    this.erro.set('');
    this.ocupado.set(true);
    try {
      await this.auth.entrar(this.senha);
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
