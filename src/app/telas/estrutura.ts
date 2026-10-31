// Moldura das telas logadas: conteúdo + barra de navegação fixa embaixo (estilo app de celular).
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../nucleo/auth';

@Component({
  selector: 'app-estrutura',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app">
      <router-outlet />
    </div>
    <nav class="abas">
      <a routerLink="/painel" routerLinkActive="ativa"><span class="icone">◔</span>Painel</a>
      <a routerLink="/calendario" routerLinkActive="ativa"><span class="icone">▦</span>Calendário</a>
      <a routerLink="/gasto/novo" class="mais" aria-label="Novo gasto"><span>+</span></a>
      <a routerLink="/cadastros" routerLinkActive="ativa"><span class="icone">☰</span>Cadastros</a>
      <button type="button" (click)="sair()"><span class="icone">⎋</span>Sair</button>
    </nav>
  `,
})
export class Estrutura {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected async sair() {
    await this.auth.sair();
    await this.router.navigateByUrl('/entrar');
  }
}
