// Aviso rápido ("toast") que aparece por alguns segundos, ex.: "Gasto salvo". Mostrado pela Estrutura.
import { Injectable, signal } from '@angular/core';

export interface Aviso {
  texto: string;
  tipo: 'ok' | 'erro';
}

@Injectable({ providedIn: 'root' })
export class Avisos {
  readonly atual = signal<Aviso | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  mostrar(texto: string, tipo: Aviso['tipo'] = 'ok', ms = 2600) {
    clearTimeout(this.timer);
    this.atual.set({ texto, tipo });
    this.timer = setTimeout(() => this.atual.set(null), ms);
  }
}
