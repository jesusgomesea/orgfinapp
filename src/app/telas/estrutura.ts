// Moldura das telas logadas. A MESMA navegação muda de forma pelo CSS (styles.scss, "responsivo"):
//  - celular e tablet: barra flutuante embaixo, com o "+" no meio;
//  - desktop (≥ 1100px): menu lateral fixo com a marca, os links e o botão "Novo gasto".
// Atalho de teclado no desktop: N abre um novo gasto (fora de campos de texto).
import { Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../nucleo/auth';
import { Avisos } from '../nucleo/avisos';
import { Dados } from '../nucleo/dados';
import { Icone } from '../nucleo/icone';

@Component({
  selector: 'app-estrutura',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icone],
  template: `
    <nav class="abas" aria-label="Navegação">
      <a class="nav-marca" routerLink="/painel" aria-label="org-fin, ir para o painel">
        <img src="icons/icon-96x96.png" alt="" width="32" height="32" /><span class="marca">org<span>fin</span></span>
      </a>
      <a routerLink="/painel" routerLinkActive="ativa" ariaCurrentWhenActive="page"><app-icone nome="painel" /><span>Painel</span></a>
      <a routerLink="/calendario" routerLinkActive="ativa" ariaCurrentWhenActive="page"><app-icone nome="calendario" /><span>Calendário</span></a>
      <a routerLink="/gasto/novo" class="mais" aria-label="Novo gasto" title="Novo gasto (N)">
        <span class="mais-icone"><app-icone nome="mais" /></span><span class="mais-texto">Novo gasto</span>
      </a>
      <a routerLink="/cadastros" routerLinkActive="ativa" ariaCurrentWhenActive="page"><app-icone nome="ajustes" /><span>Ajustes</span></a>
      <button type="button" class="nav-sair" (click)="sair()"><app-icone nome="sair" /><span>Sair</span></button>
    </nav>
    <main class="app">
      <router-outlet />
    </main>
    @if (avisos.atual(); as a) {
      <div class="toast" [class.erro]="a.tipo === 'erro'" role="status">
        <app-icone [nome]="a.tipo === 'erro' ? 'alerta' : 'check'" /> {{ a.texto }}
      </div>
    }
  `,
})
export class Estrutura {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly avisos = inject(Avisos);

  private readonly dados = inject(Dados);

  constructor() {
    // Voltou para o app (trocou de aba ou desbloqueou o celular): traz o que outro aparelho lançou.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.dados.atualizarSeAntigo();
    });
  }

  protected sair() {
    if (!confirm('Sair deste aparelho? Vai precisar da senha para entrar de novo.')) return;
    this.auth.sair();
    this.router.navigateByUrl('/entrar');
  }

  @HostListener('document:keydown', ['$event'])
  protected atalho(e: KeyboardEvent) {
    const alvo = e.target as HTMLElement;
    const digitando = alvo.closest('input, textarea, select, [contenteditable]');
    if (!digitando && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      this.router.navigateByUrl('/gasto/novo');
    }
  }
}
