// Assistente: conversa com a IA sobre as próprias finanças ("quanto gastei com mercado este ano?",
// "onde posso economizar?", "quanto falta para a meta da casa?"). Quem lê os dados e monta o contexto é o
// servidor (netlify/functions/perguntar.mts); aqui só vai a pergunta e as últimas mensagens.
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { mensagemDeErro } from '../nucleo/api';
import { Ia } from '../nucleo/ia';
import { Icone } from '../nucleo/icone';

const SUGESTOES = [
  'Quanto gastei este mês e com o quê?',
  'Onde posso economizar?',
  'Quanto já tenho comprometido com parcelas?',
  'Quanto falta para minhas metas dos cofres?',
];

@Component({
  selector: 'app-assistente',
  host: { class: 'tela tela-assistente' },
  imports: [FormsModule, Icone],
  template: `
    <header class="topo">
      <div><small>Pergunte sobre seus gastos</small><h1>Assistente</h1></div>
      @if (mensagens().length > 1) {
        <button type="button" class="link" (click)="limpar()">nova conversa</button>
      }
    </header>

    <div class="conversa longa" aria-live="polite" #rolagem>
      @for (m of mensagens(); track $index) {
        <div class="balao" [class.app]="m.de !== 'voce'" [class.voce]="m.de === 'voce'" [class.aviso-ia]="m.erro">{{ m.texto }}</div>
      }
      @if (pensando()) { <div class="balao app digitando" aria-label="Pensando"><i></i><i></i><i></i></div> }
    </div>

    @if (mensagens().length === 1) {
      <div class="fichas exemplos">
        @for (s of sugestoes; track s) { <button type="button" class="ficha" (click)="perguntar(s)">{{ s }}</button> }
      </div>
    }

    <div class="compositor fixo-baixo">
      <textarea rows="1" [(ngModel)]="texto" placeholder="Pergunte qualquer coisa" aria-label="Sua pergunta"
                (keydown.enter)="enviar($event)"></textarea>
      <button type="button" class="icone-botao enviar" (click)="perguntar(texto)" [disabled]="!texto.trim() || pensando()" aria-label="Perguntar">
        <app-icone nome="brilho" />
      </button>
    </div>
    <p class="suave dica centro-texto">A IA usa só os dados do seu app. Confira números importantes.</p>
  `,
})
export class Assistente {
  private readonly ia = inject(Ia);
  private readonly rolagem = viewChild<ElementRef<HTMLElement>>('rolagem');

  protected readonly sugestoes = SUGESTOES;
  protected readonly mensagens = signal<{ de: 'voce' | 'app'; texto: string; erro?: boolean }[]>([this.boasVindas()]);
  protected readonly pensando = signal(false);
  protected texto = '';

  protected enviar(e: Event) {
    if ((e as KeyboardEvent).shiftKey) return;
    e.preventDefault();
    this.perguntar(this.texto);
  }

  protected async perguntar(pergunta: string) {
    pergunta = pergunta.trim();
    if (!pergunta || this.pensando()) return;
    const historico = this.mensagens().slice(1).filter((m) => !m.erro).map(({ de, texto }) => ({ de, texto }));
    this.mensagens.update((l) => [...l, { de: 'voce', texto: pergunta }]);
    this.texto = '';
    this.pensando.set(true);
    this.rolar();
    try {
      const resposta = await this.ia.perguntar(pergunta, historico);
      this.mensagens.update((l) => [...l, { de: 'app', texto: resposta }]);
    } catch (e) {
      this.mensagens.update((l) => [...l, { de: 'app', texto: mensagemDeErro(e), erro: true }]);
    } finally {
      this.pensando.set(false);
      this.rolar();
    }
  }

  protected limpar() {
    this.mensagens.set([this.boasVindas()]);
  }

  private boasVindas() {
    return { de: 'app' as const, texto: 'Oi! Eu olho seus gastos, fixos, entradas e cofres e respondo o que você quiser saber. Pergunte do seu jeito.' };
  }

  private rolar() {
    setTimeout(() => {
      const ultimo = this.rolagem()?.nativeElement.lastElementChild;
      ultimo?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50);
  }
}
