// Lançamento rápido, no estilo do Pix dos bancos: o "+" abre uma gaveta com o VALOR em destaque e um teclado
// numérico próprio (digitar 1-2-3-4 dá R$ 12,34, sem vírgula para errar). Depois: o que foi, categoria, pagamento
// e parcelas em toques. "Mais opções" abre a tela completa (IA, foto, data da 1ª parcela) com o que já foi digitado.
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { mensagemDeErro } from '../nucleo/api';
import { Avisos } from '../nucleo/avisos';
import { IconeCategoria } from '../nucleo/categoria-icone';
import { Categoria, ContaCartao, Dados } from '../nucleo/dados';
import { vibrar } from '../nucleo/efeitos';
import { hoje, nomeMesCurto, reais } from '../nucleo/formato';
import { Gaveta } from '../nucleo/gaveta';
import { Icone } from '../nucleo/icone';

const PARCELAS = [1, 2, 3, 4, 5, 6, 10, 12];

@Component({
  selector: 'app-lancamento-rapido',
  imports: [FormsModule, Gaveta, Icone, IconeCategoria],
  template: `
    <app-gaveta [aberta]="aberta()" (fechar)="fechar()" [titulo]="etapa() === 1 ? 'Quanto foi?' : 'Detalhes'">
      @if (etapa() === 1) {
        <div class="valor-pix" [class.vazio]="!centavos()" aria-live="polite">
          <small>R$</small>{{ valorTexto() }}
        </div>
        <div class="teclado" role="group" aria-label="Teclado numérico">
          @for (t of teclas; track t) {
            <button type="button" (click)="tecla(t)" [attr.aria-label]="t === 'apagar' ? 'Apagar' : t">
              @if (t === 'apagar') { <app-icone nome="esquerda" /> } @else { {{ t }} }
            </button>
          }
        </div>
        <button type="button" class="primario largo" [disabled]="!centavos()" (click)="avancar()">Continuar</button>
        <button type="button" class="link" (click)="maisOpcoes()"><app-icone nome="brilho" /> Usar IA, foto ou mais opções</button>
      } @else {
        <button type="button" class="valor-resumo" (click)="etapa.set(1)" aria-label="Mudar valor">
          <strong>{{ reais(valor()) }}</strong> <small class="suave">tocar para mudar</small>
        </button>
        <label>O que foi <input [(ngModel)]="descricao" autofocus placeholder="Ex.: Mercado, Uber, Farmácia" (keydown.enter)="salvar()" /></label>

        <div class="rotulo">Categoria</div>
        <div class="fichas rolagem-lateral">
          @for (c of categorias(); track c.id) {
            <button type="button" class="ficha ficha-cat" [class.marcada]="categoria === c.id" (click)="categoria = categoria === c.id ? null : c.id">
              <app-icone-categoria [nome]="c.nome" [cor]="c.cor" />{{ c.nome }}
            </button>
          }
        </div>

        <div class="rotulo">Pagamento</div>
        <div class="fichas rolagem-lateral">
          @for (c of contas(); track c.id) {
            <button type="button" class="ficha" [class.marcada]="conta === c.id" (click)="conta = conta === c.id ? null : c.id">{{ c.nome }}</button>
          }
        </div>

        <div class="rotulo">Parcelas</div>
        <div class="fichas rolagem-lateral">
          @for (p of parcelasOpcoes; track p) {
            <button type="button" class="ficha" [class.marcada]="parcelas === p" (click)="parcelas = p">{{ p === 1 ? 'À vista' : p + 'x' }}</button>
          }
        </div>
        @if (parcelas > 1) { <p class="suave dica">{{ parcelas }}x de {{ reais(valor() / parcelas) }}</p> }

        @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }
        <button type="button" class="primario largo" (click)="salvar()" [disabled]="salvando()">
          <app-icone nome="check" /> {{ salvando() ? 'Salvando…' : 'Salvar ' + reais(valor()) }}
        </button>
        <button type="button" class="link" (click)="maisOpcoes()">Mais opções (data, 1ª parcela, loja)</button>
      }
    </app-gaveta>
  `,
})
export class LancamentoRapido {
  private readonly dados = inject(Dados);
  private readonly avisos = inject(Avisos);
  private readonly router = inject(Router);

  readonly aberta = input(false);
  readonly fechou = output<void>();

  protected readonly reais = reais;
  protected readonly teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'apagar'];
  protected readonly parcelasOpcoes = PARCELAS;
  protected readonly etapa = signal<1 | 2>(1);
  protected readonly centavos = signal(0);
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly contas = signal<ContaCartao[]>([]);
  protected readonly salvando = signal(false);
  protected readonly erro = signal('');
  protected descricao = '';
  protected categoria: number | null = null;
  protected conta: number | null = null;
  protected parcelas = 1;

  protected readonly valor = computed(() => this.centavos() / 100);
  protected readonly valorTexto = computed(() => reais(this.valor()).replace('R$', '').trim());

  /** Teclado: cada dígito entra pela direita, como em caixa eletrônico (máx. R$ 9.999.999,99). */
  protected tecla(t: string) {
    vibrar(6);
    if (t === 'apagar') return this.centavos.update((c) => Math.floor(c / 10));
    const novo = Number(String(this.centavos()) + t);
    if (novo <= 999_999_999) this.centavos.set(novo);
  }

  protected async avancar() {
    this.etapa.set(2);
    try {
      const [cats, contas] = await Promise.all([this.dados.categorias(), this.dados.contas()]);
      this.categorias.set(cats);
      this.contas.set(contas);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected async salvar() {
    if (!this.descricao.trim()) return this.erro.set('Diga o que foi (ex.: Mercado).');
    this.erro.set('');
    this.salvando.set(true);
    try {
      const compra = {
        descricao: this.descricao.trim(), estabelecimento: '', valor_total: this.valor(), parcelas: this.parcelas,
        data_compra: hoje(), categoria_id: this.categoria, conta_id: this.conta, origem: 'manual' as const,
      };
      const primeira = this.dados.previaParcelas(compra, this.contas())[0];
      await this.dados.salvarCompra(compra);
      vibrar([10, 30, 10]);
      this.avisos.mostrar(`${compra.descricao} · ${reais(compra.valor_total)} salvo${primeira && primeira.competencia.slice(0, 7) !== hoje().slice(0, 7) ? ' (1ª em ' + nomeMesCurto(primeira.competencia) + ')' : ''}`);
      this.fechar();
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }

  /** Abre a tela completa já com o que foi digitado aqui. */
  protected maisOpcoes() {
    const params: Record<string, string> = {};
    if (this.centavos()) params['valor'] = String(this.valor());
    if (this.descricao.trim()) params['descricao'] = this.descricao.trim();
    if (this.categoria) params['categoria'] = String(this.categoria);
    if (this.conta) params['conta'] = String(this.conta);
    if (this.parcelas > 1) params['parcelas'] = String(this.parcelas);
    this.fechar();
    this.router.navigate(['/gasto', 'novo'], { queryParams: params });
  }

  protected fechar() {
    this.etapa.set(1);
    this.centavos.set(0);
    this.descricao = '';
    this.categoria = null;
    this.conta = null;
    this.parcelas = 1;
    this.erro.set('');
    this.fechou.emit();
  }
}
