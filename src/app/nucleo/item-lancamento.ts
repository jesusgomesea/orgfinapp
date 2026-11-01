// Uma linha de gasto/entrada (painel, calendário, fatura): botão de "pago/recebido" + ícone + descrição + valor.
// Gestos (como Nubank/Monzo): deslizar para a DIREITA marca pago; para a ESQUERDA exclui (com "Desfazer").
// Fixos não são excluídos por gesto (apagaria todos os meses): para eles só o "pago".
// O botão de pago fica FORA do link (botão dentro de link não é permitido em HTML e confunde o toque).
import { Component, HostListener, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { lerData } from '../dominio/parcelamento';
import { mensagemDeErro } from './api';
import { Avisos } from './avisos';
import { IconeCategoria } from './categoria-icone';
import { Dados, LancamentoDetalhado } from './dados';
import { vibrar } from './efeitos';
import { NOMES_MES, hoje, reais } from './formato';
import { Icone } from './icone';
import { Privacidade } from './privacidade';

const LIMIAR = 80;

@Component({
  selector: 'app-item',
  imports: [RouterLink, Icone, IconeCategoria],
  host: {
    class: 'linha-lancamento',
    '[class.pago]': '!!item().pago',
    '[class.entra]': 'item().entra',
    '[class.deslizando]': 'dx() !== 0',
  },
  template: `
    <div class="deslize-fundo" aria-hidden="true">
      <span class="deslize-pago" [class.pronto]="dx() > limiar"><app-icone nome="check" /> {{ item().pago ? 'Desmarcar' : item().entra ? 'Recebido' : 'Pago' }}</span>
      @if (podeExcluir()) { <span class="deslize-excluir" [class.pronto]="dx() < -limiar">Excluir <app-icone nome="lixeira" /></span> }
    </div>
    <div class="deslize-frente" [style.transform]="dx() ? 'translateX(' + dx() + 'px)' : null">
      <button type="button" class="check" (click)="alternar()" [attr.aria-pressed]="!!item().pago"
              [attr.aria-label]="(item().pago ? 'Desmarcar ' : 'Marcar como ') + (item().entra ? 'recebido' : 'pago') + ': ' + item().compra.descricao">
        <app-icone nome="check" />
      </button>
      <a class="corpo" [routerLink]="item().rota">
        <app-icone-categoria [nome]="item().compra.categoria?.nome" [cor]="item().compra.categoria?.cor" />
        <span class="texto">
          <strong>
            {{ item().compra.descricao }}
            @if (item().total_parcelas > 1) { <span class="parcela">{{ item().numero }}/{{ item().total_parcelas }}</span> }
            @if (item().tipo === 'fixo') { <span class="parcela fixo">fixo</span> }
          </strong>
          <small class="suave">{{ detalhe() }}</small>
          @if (item().total_parcelas > 1 && completo()) { <small class="suave">Total da compra {{ priv.mostrar(item().compra.valor_total) }}</small> }
        </span>
        <strong class="valor">{{ item().entra ? '+ ' : '' }}{{ priv.mostrar(item().valor) }}</strong>
      </a>
    </div>
  `,
})
export class ItemLancamento {
  private readonly dados = inject(Dados);
  private readonly avisos = inject(Avisos);
  protected readonly priv = inject(Privacidade);

  readonly item = input.required<LancamentoDetalhado>();
  /** Começa a linha de detalhe com a data ("Hoje", "4 de nov"). */
  readonly comData = input(false);
  /** Mostra também o total da compra parcelada. */
  readonly completo = input(true);

  protected readonly limiar = LIMIAR;
  protected readonly dx = signal(0);
  protected readonly podeExcluir = computed(() => this.item().tipo !== 'fixo');

  protected readonly detalhe = computed(() => {
    const l = this.item();
    const partes = [
      this.comData() ? quando(l.data_prevista) : null,
      l.compra.estabelecimento ? '→ ' + l.compra.estabelecimento : null,
      l.entra ? null : l.compra.categoria?.nome ?? 'Sem categoria',
      l.compra.conta_cartao?.nome,
      l.pago ? (l.entra ? 'recebido' : 'pago') : null,
    ];
    return partes.filter(Boolean).join(' · ');
  });

  protected async alternar() {
    const l = this.item();
    vibrar(10);
    try {
      await this.dados.marcarPago([l.chave], !l.pago);
    } catch (e) {
      this.avisos.mostrar(mensagemDeErro(e), 'erro');
    }
  }

  // ---------- gesto de deslizar ----------
  private inicio: { x: number; y: number; id: number } | null = null;
  private direcao: 'horizontal' | 'vertical' | null = null;
  private engolirClique = false;

  @HostListener('pointerdown', ['$event'])
  protected tocar(e: PointerEvent) {
    if (e.button !== 0) return;
    this.inicio = { x: e.clientX, y: e.clientY, id: e.pointerId };
    this.direcao = null;
  }

  @HostListener('pointermove', ['$event'])
  protected mover(e: PointerEvent) {
    if (!this.inicio || e.pointerId !== this.inicio.id) return;
    const dx = e.clientX - this.inicio.x;
    const dy = e.clientY - this.inicio.y;
    if (!this.direcao) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      this.direcao = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'horizontal' : 'vertical';
      if (this.direcao === 'horizontal') {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* ponteiro já liberado: segue sem captura */
        }
      }
    }
    if (this.direcao !== 'horizontal') return;
    const limite = this.podeExcluir() ? -140 : 0;
    const novo = Math.max(limite, Math.min(140, dx));
    // vibra uma vez ao cruzar o limiar, para a pessoa saber que soltar vai valer
    if ((Math.abs(novo) > LIMIAR) !== (Math.abs(this.dx()) > LIMIAR)) vibrar(8);
    this.dx.set(novo);
  }

  @HostListener('pointerup')
  @HostListener('pointercancel')
  protected soltar() {
    const dx = this.dx();
    if (this.direcao === 'horizontal') this.engolirClique = true;
    this.inicio = null;
    this.direcao = null;
    this.dx.set(0);
    if (dx > LIMIAR) this.alternar();
    else if (dx < -LIMIAR && this.podeExcluir()) this.excluir();
  }

  /** Depois de arrastar, o clique que o navegador dispara ao soltar não pode abrir o gasto. */
  @HostListener('click', ['$event'])
  protected clique(e: MouseEvent) {
    if (!this.engolirClique) return;
    this.engolirClique = false;
    e.preventDefault();
    e.stopPropagation();
  }

  private async excluir() {
    const l = this.item();
    vibrar([10, 30, 10]);
    try {
      if (l.tipo === 'compra') {
        const antes = await this.dados.excluirCompra(l.compra.id);
        const texto = l.total_parcelas > 1 ? `${l.compra.descricao} (${l.total_parcelas} parcelas) excluído` : `${l.compra.descricao} excluído`;
        this.avisos.mostrar(texto, 'ok', 6000, antes ? { rotulo: 'Desfazer', executar: () => this.dados.salvarCompra({ ...antes, id: undefined }) } : undefined);
      } else if (l.tipo === 'entrada') {
        const antes = (await this.dados.entradas()).find((x) => x.id === l.id);
        await this.dados.excluirEntrada(l.id);
        this.avisos.mostrar(`Entrada de ${reais(l.valor)} excluída`, 'ok', 6000, antes ? { rotulo: 'Desfazer', executar: () => this.dados.salvarEntrada({ ...antes, id: undefined }) } : undefined);
      }
    } catch (e) {
      this.avisos.mostrar(mensagemDeErro(e), 'erro');
    }
  }
}

function quando(data: string) {
  if (data === hoje()) return 'Hoje';
  const { dia, mes } = lerData(data);
  return `${dia} de ${NOMES_MES[mes - 1].slice(0, 3).toLowerCase()}`;
}
