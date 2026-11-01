// Diretiva: deslizar o dedo para os lados troca o mês (como virar página). Para a esquerda = próximo mês.
// Só reage a gesto claramente horizontal, para não atrapalhar a rolagem da página.
// Uso: <section appDeslizarMes (anterior)="mudarMes(-1)" (proximo)="mudarMes(1)">
import { Directive, HostListener, output } from '@angular/core';
import { vibrar } from './efeitos';

@Directive({ selector: '[appDeslizarMes]', host: { style: 'touch-action: pan-y' } })
export class DeslizarMes {
  readonly anterior = output<void>();
  readonly proximo = output<void>();
  private inicio: { x: number; y: number; t: number } | null = null;

  @HostListener('touchstart', ['$event'])
  protected comecar(e: TouchEvent) {
    const t = e.touches[0];
    this.inicio = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  }

  @HostListener('touchend', ['$event'])
  protected terminar(e: TouchEvent) {
    if (!this.inicio) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this.inicio.x;
    const dy = t.clientY - this.inicio.y;
    const rapido = Date.now() - this.inicio.t < 600;
    this.inicio = null;
    // Gestos dentro de carrossel ou de item deslizável já têm dono.
    if ((e.target as HTMLElement).closest('.carrossel, app-item')) return;
    if (rapido && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.8) {
      vibrar(6);
      if (dx < 0) this.proximo.emit();
      else this.anterior.emit();
    }
  }
}
