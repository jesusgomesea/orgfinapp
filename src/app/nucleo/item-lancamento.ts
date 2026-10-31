// Uma linha de gasto/entrada (painel, calendário, fatura): botão de "pago/recebido" + ícone + descrição + valor.
// O botão de pago fica FORA do link (botão dentro de link não é permitido em HTML e confunde o toque).
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { lerData } from '../dominio/parcelamento';
import { mensagemDeErro } from './api';
import { Avisos } from './avisos';
import { IconeCategoria } from './categoria-icone';
import { Dados, LancamentoDetalhado } from './dados';
import { NOMES_MES, hoje } from './formato';
import { Icone } from './icone';
import { Privacidade } from './privacidade';

@Component({
  selector: 'app-item',
  imports: [RouterLink, Icone, IconeCategoria],
  host: { class: 'linha-lancamento', '[class.pago]': '!!item().pago', '[class.entra]': 'item().entra' },
  template: `
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
    try {
      await this.dados.marcarPago([l.chave], !l.pago);
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
