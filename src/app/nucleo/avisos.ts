// Aviso rápido ("toast") que aparece por alguns segundos, ex.: "Gasto salvo". Mostrado pela Estrutura.
// Pode ter um botão de ação, como "Desfazer" depois de excluir (fica mais tempo na tela).
import { Injectable, signal } from '@angular/core';

export interface Aviso {
  texto: string;
  tipo: 'ok' | 'erro';
  acao?: { rotulo: string; executar: () => void | Promise<void> };
}

@Injectable({ providedIn: 'root' })
export class Avisos {
  readonly atual = signal<Aviso | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  mostrar(texto: string, tipo: Aviso['tipo'] = 'ok', ms = 2600, acao?: Aviso['acao']) {
    clearTimeout(this.timer);
    this.atual.set({ texto, tipo, acao });
    this.timer = setTimeout(() => this.atual.set(null), acao ? Math.max(ms, 6000) : ms);
  }

  async executarAcao() {
    const a = this.atual();
    this.atual.set(null);
    await a?.acao?.executar();
  }
}
