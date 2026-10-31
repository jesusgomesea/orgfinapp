// "Esconder valores" (o olhinho dos apps de banco): troca os valores por •••• para usar o app em público.
// Fica lembrado no aparelho.
import { Injectable, signal } from '@angular/core';
import { reais } from './formato';

const CHAVE = 'orgfin.ocultar';

@Injectable({ providedIn: 'root' })
export class Privacidade {
  readonly oculto = signal(ler());

  alternar() {
    this.oculto.update((v) => !v);
    try { localStorage.setItem(CHAVE, this.oculto() ? '1' : '0'); } catch { /* aba anônima */ }
  }

  /** Valor em reais, ou •••• quando oculto. */
  mostrar(v: number): string {
    return this.oculto() ? 'R$ ••••' : reais(v);
  }
}

function ler(): boolean {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}
