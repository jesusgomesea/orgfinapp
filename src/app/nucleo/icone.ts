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
  olho: ['M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  'olho-fechado': ['M3 3l18 18', 'M6.7 6.7C4.1 8.4 2 12 2 12s3 7 10 7c2 0 3.7-.6 5.1-1.4', 'M10.6 5.1L12 5c7 0 10 7 10 7s-.8 1.8-2.4 3.6', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
  alerta: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
  busca: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  fechar: ['M18 6L6 18', 'M6 6l12 12'],
  subindo: ['M22 7l-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
  descendo: ['M22 17l-8.5-8.5-5 5L2 7', 'M16 17h6v-6'],
  // categorias
  carrinho: ['M3 3h2l2.4 12.2a2 2 0 0 0 2 1.8h8.2a2 2 0 0 0 2-1.6L21 8H6', 'M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'],
  casa: ['M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  raio: ['M13 2L3 14h9l-1 8 10-12h-9z'],
  carro: ['M14 16H9m10 0h3v-3.2a1 1 0 0 0-.8-1L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.2a2 2 0 0 0-1.8 1.1l-.8 1.6A6 6 0 0 0 2 12.4V16h2', 'M6.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M16.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  talheres: ['M3 2v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3v7'],
  coracao: ['M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z'],
  livro: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  musica: ['M9 18V5l12-2v13', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  celular: ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01'],
  tomada: ['M12 22v-5', 'M9 8V2', 'M15 8V2', 'M18 8v5a6 6 0 0 1-12 0V8z'],
  camiseta: ['M20.4 3.5L16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.6 3.5a1 1 0 0 0 1 .8H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.2a1 1 0 0 0 1-.8l.6-3.5a2 2 0 0 0-1.4-2.2z'],
  pacote: ['M21 8l-9-5-9 5v8l9 5 9-5z', 'M3 8l9 5 9-5', 'M12 13v8'],
  pata: ['M11 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'M18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'M20 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.8 1.2 1.6 1.6 0 0 0-1-1A3.5 3.5 0 0 1 4 15.3V15a5 5 0 0 1 5-5z'],
  aviao: ['M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'],
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
