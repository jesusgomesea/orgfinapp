// Moldura das telas logadas. A MESMA navegação muda de forma pelo CSS (styles.scss, "responsivo"):
//  - celular e tablet: barra flutuante embaixo (Painel, Calendário, +, Relatórios, Mais);
//  - celular deitado: trilho vertical só com ícones;
//  - desktop (≥ 1100px): menu lateral com todas as telas (.so-desktop) e o botão "Novo gasto".
// "Mais" (.so-celular) abre a tela /mais com Cofres, Fixos, Assistente, Ajustes e Sair.
// O "+" abre o lançamento rápido (gaveta com teclado de valor); Ctrl+clique abre a tela completa.
// Atalho de teclado no desktop: N abre o lançamento rápido (fora de campos de texto).
import { Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../nucleo/auth';
import { Avisos } from '../nucleo/avisos';
import { Dados } from '../nucleo/dados';
import { Atalhos } from '../nucleo/atalhos';
import { Icone } from '../nucleo/icone';
import { LancamentoRapido } from './lancamento-rapido';

@Component({
  selector: 'app-estrutura',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icone, LancamentoRapido],
  template: `
    <nav class="abas" aria-label="Navegação">
      <a class="nav-marca" routerLink="/painel" aria-label="org-fin, ir para o painel">
        <img src="icons/icon-96x96.png" alt="" width="32" height="32" /><span class="marca">org<span>fin</span></span>
      </a>
      <a routerLink="/painel" routerLinkActive="ativa" ariaCurrentWhenActive="page"><app-icone nome="painel" /><span>Painel</span></a>
      <a routerLink="/calendario" routerLinkActive="ativa" ariaCurrentWhenActive="page"><app-icone nome="calendario" /><span>Calendário</span></a>
      <!-- href comum (sem routerLink): o clique abre a gaveta; Ctrl+clique abre a tela completa em outra aba -->
      <a href="/gasto/novo" class="mais" aria-label="Novo gasto" title="Novo gasto (N)" (click)="atalhos.abrirLancamento($event)">
        <span class="mais-icone"><app-icone nome="mais" /></span><span class="mais-texto">Novo gasto</span>
      </a>
      <a routerLink="/relatorios" routerLinkActive="ativa" ariaCurrentWhenActive="page"><app-icone nome="grafico" /><span>Relatórios</span></a>
      <a class="so-desktop" routerLink="/cofres" routerLinkActive="ativa" ariaCurrentWhenActive="page"><app-icone nome="cofre" /><span>Cofres</span></a>
      <a class="so-desktop" routerLink="/fixos" routerLinkActive="ativa" ariaCurrentWhenActive="page"><app-icone nome="repetir" /><span>Fixos e entradas</span></a>
      <a class="so-desktop" routerLink="/assistente" routerLinkActive="ativa" ariaCurrentWhenActive="page"><app-icone nome="conversa" /><span>Assistente</span></a>
      <a class="so-desktop" routerLink="/cadastros" routerLinkActive="ativa" ariaCurrentWhenActive="page"><app-icone nome="ajustes" /><span>Ajustes</span></a>
      <a class="so-celular" routerLink="/mais" routerLinkActive="ativa" ariaCurrentWhenActive="page"><app-icone nome="menu" /><span>Mais</span></a>
      <button type="button" class="nav-sair so-desktop" (click)="sair()"><app-icone nome="sair" /><span>Sair</span></button>
    </nav>
    <main class="app">
      <router-outlet />
    </main>
    <app-lancamento-rapido [aberta]="atalhos.lancamentoRapido()" (fechou)="atalhos.lancamentoRapido.set(false)" />
    @if (avisos.atual(); as a) {
      <div class="toast" [class.erro]="a.tipo === 'erro'" role="status">
        <app-icone [nome]="a.tipo === 'erro' ? 'alerta' : 'check'" /> {{ a.texto }}
        @if (a.acao) { <button type="button" class="toast-acao" (click)="avisos.executarAcao()">{{ a.acao.rotulo }}</button> }
      </div>
    }
  `,
})
export class Estrutura {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly dados = inject(Dados);
  protected readonly avisos = inject(Avisos);
  protected readonly atalhos = inject(Atalhos);

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
      this.atalhos.abrirLancamento();
    }
  }
}
