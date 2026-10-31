// Moldura das telas logadas: conteúdo + barra de abas fixa embaixo (estilo app de celular), com o "+" no meio.
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../nucleo/auth';
import { Icone } from '../nucleo/icone';

@Component({
  selector: 'app-estrutura',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icone],
  template: `
    <div class="app">
      <router-outlet />
    </div>
    <nav class="abas" aria-label="Navegação">
      <a routerLink="/painel" routerLinkActive="ativa"><app-icone nome="painel" />Painel</a>
      <a routerLink="/calendario" routerLinkActive="ativa"><app-icone nome="calendario" />Calendário</a>
      <a routerLink="/gasto/novo" class="mais" aria-label="Novo gasto"><span><app-icone nome="mais" /></span></a>
      <a routerLink="/cadastros" routerLinkActive="ativa"><app-icone nome="ajustes" />Ajustes</a>
      <button type="button" (click)="sair()"><app-icone nome="sair" />Sair</button>
    </nav>
  `,
})
export class Estrutura {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected sair() {
    if (!confirm('Sair deste aparelho? Vai precisar da senha para entrar de novo.')) return;
    this.auth.sair();
    this.router.navigateByUrl('/entrar');
  }
}
