// Gaveta que sobe de baixo (bottom sheet, como Revolut/Apple): abre por cima da tela, sem trocar de página.
// Fecha tocando fora, com Esc ou arrastando a alça para baixo. No desktop vira um painel centralizado.
// Uso: <app-gaveta [aberta]="x()" (fechar)="x.set(false)" titulo="...">conteúdo</app-gaveta>
import { Component, ElementRef, HostListener, effect, input, output, signal, viewChild } from '@angular/core';

@Component({
  selector: 'app-gaveta',
  template: `
    @if (aberta()) {
      <div class="gaveta-fundo" (click)="fechar.emit()"></div>
      <section class="gaveta" role="dialog" aria-modal="true" [attr.aria-label]="titulo()" #painel
               [style.transform]="arrasto() ? 'translateY(' + arrasto() + 'px)' : null" [class.arrastando]="arrasto() > 0">
        <div class="gaveta-alca" (pointerdown)="iniciar($event)" (pointermove)="mover($event)" (pointerup)="soltar()" (pointercancel)="soltar()">
          <span></span>
        </div>
        @if (titulo()) { <h2 class="gaveta-titulo">{{ titulo() }}</h2> }
        <ng-content />
      </section>
    }
  `,
})
export class Gaveta {
  readonly aberta = input(false);
  readonly titulo = input('');
  readonly fechar = output<void>();

  private readonly painel = viewChild<ElementRef<HTMLElement>>('painel');
  protected readonly arrasto = signal(0);
  private inicioY: number | null = null;

  constructor() {
    // Trava a rolagem da página de trás enquanto a gaveta está aberta; põe o foco dentro dela.
    effect(() => {
      document.body.classList.toggle('sem-rolagem', this.aberta());
      if (this.aberta()) setTimeout(() => this.painel()?.nativeElement.querySelector<HTMLElement>('[autofocus], input, button')?.focus(), 60);
    });
  }

  @HostListener('document:keydown.escape')
  protected esc() {
    if (this.aberta()) this.fechar.emit();
  }

  protected iniciar(e: PointerEvent) {
    this.inicioY = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  protected mover(e: PointerEvent) {
    if (this.inicioY !== null) this.arrasto.set(Math.max(0, e.clientY - this.inicioY));
  }

  protected soltar() {
    if (this.arrasto() > 90) this.fechar.emit();
    this.arrasto.set(0);
    this.inicioY = null;
  }
}
