// Ícones em SVG de traço (estilo Lucide), desenhados aqui para não depender de biblioteca nem de internet.
// Uso: <app-icone nome="calendario" />. Tamanho e cor vêm do CSS (.icone em styles.scss, cor = currentColor).
import { Component, computed, input } from '@angular/core';

const DESENHOS = {
  painel: ['M21 12a9 9 0 1 1-9-9v9z', 'M12 3a9 9 0 0 1 9 9h-9z'],
  calendario: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  mais: ['M12 5v14', 'M5 12h14'],
  ajustes: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  sair: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  esquerda: ['M15 18l-6-6 6-6'],
  direita: ['M9 18l6-6-6-6'],
  brilho: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 17v4', 'M17 19h4'],
  microfone: ['M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z', 'M5 10a7 7 0 0 0 14 0', 'M12 17v5'],
  baixar: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  enviar: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  lixeira: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
  cartao: ['M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M2 10h20'],
  etiqueta: ['M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z', 'M7 7h.01'],
  carteira: ['M20 12V8H6a2 2 0 0 1 0-4h12v4', 'M4 6v12a2 2 0 0 0 2 2h14v-4', 'M18 12a2 2 0 0 0 0 4h4v-4z'],
  lapis: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  cadeado: ['M6 11h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  check: ['M20 6L9 17l-5-5'],
} as const;

export type NomeIcone = keyof typeof DESENHOS;

@Component({
  selector: 'app-icone',
  host: { class: 'icone', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      @for (d of tracos(); track $index) { <path [attr.d]="d" /> }
    </svg>
  `,
})
export class Icone {
  readonly nome = input.required<NomeIcone>();
  protected readonly tracos = computed(() => DESENHOS[this.nome()]);
}
