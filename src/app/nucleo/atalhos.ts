// Estado das gavetas globais (abertas de qualquer tela), hoje: o lançamento rápido do "+".
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Atalhos {
  readonly lancamentoRapido = signal(false);

  /**
   * Use no (click) de um <a href="/gasto/novo"> (SEM routerLink: o routerLink navegaria mesmo com preventDefault).
   * Abre a gaveta; Ctrl/Cmd+clique deixa o navegador abrir a tela completa em outra aba.
   */
  abrirLancamento(e?: MouseEvent) {
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey)) return;
    e?.preventDefault();
    this.lancamentoRapido.set(true);
  }
}

/** Marca no aparelho que a retrospectiva do mês ('AAAA-MM') já foi vista, para o painel parar de oferecer. */
export function chaveRetrospectivaVista(mes: string) {
  return `orgfin.retro.${mes}`;
}
