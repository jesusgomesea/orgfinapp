// Fatura de um cartão de crédito num mês (/fatura/:id?m=AAAA-MM): tudo que caiu nela, total, vencimento e
// o botão de marcar a fatura inteira como paga. Navega entre os meses como no app do banco.
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { mensagemDeErro } from '../nucleo/api';
import { Avisos } from '../nucleo/avisos';
import { ContaCartao, Dados, LancamentoDetalhado, ehGasto } from '../nucleo/dados';
import { NOMES_MES, gradienteDoCartao, mesAtual, navegarMes, primeiroDia } from '../nucleo/formato';
import { Icone } from '../nucleo/icone';
import { ItemLancamento } from '../nucleo/item-lancamento';
import { DeslizarMes } from '../nucleo/deslizar-mes';
import { Privacidade } from '../nucleo/privacidade';

@Component({
  selector: 'app-fatura',
  host: { class: 'tela tela-fatura', '[class.carregando]': '!dados.pronto()' },
  imports: [RouterLink, Icone, ItemLancamento, DeslizarMes],
  template: `
    <header class="topo">
      <a class="icone-botao" routerLink="/painel" aria-label="Voltar"><app-icone nome="esquerda" /></a>
      <h1>Fatura</h1>
      <div class="seletor-mes">
        <button type="button" (click)="mudarMes(-1)" aria-label="Mês anterior"><app-icone nome="esquerda" /></button>
        <span>{{ titulo() }}</span>
        <button type="button" (click)="mudarMes(1)" aria-label="Próximo mês"><app-icone nome="direita" /></button>
      </div>
    </header>

    @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }

    <div class="col-principal">
      @if (conta(); as c) {
        <div class="cartao-credito grande" [style.background]="fundo()" appDeslizarMes (anterior)="mudarMes(-1)" (proximo)="mudarMes(1)">
          <div class="cc-topo"><strong>{{ c.nome }}</strong>@if (paga()) { <span class="selo-pago"><app-icone nome="check" /> paga</span> }</div>
          <span class="cc-chip"></span>
          <div><small>Fatura de {{ nomeMes().toLowerCase() }}</small><strong class="cc-valor">{{ priv.mostrar(total()) }}</strong></div>
          <small>
            {{ c.dia_vencimento ? 'Vence dia ' + c.dia_vencimento : 'Sem vencimento' }}{{ c.dia_fechamento ? ' · fecha dia ' + c.dia_fechamento : '' }}
          </small>
        </div>
        @if (itens().length) {
          <button type="button" class="largo" [class.primario]="!paga()" (click)="alternarFatura()">
            <app-icone nome="check" /> {{ paga() ? 'Desmarcar pagamento' : 'Marcar fatura como paga' }}
          </button>
        }
      }
    </div>

    <div class="col-lateral">
      <section class="cartao lista">
        <div class="linha-texto"><h2>{{ itens().length }} lançamento(s)</h2><span class="suave">{{ priv.mostrar(pago()) }} pagos</span></div>
        @for (l of itens(); track l.chave) { <app-item [item]="l" /> } @empty { <p class="suave">Nada nesta fatura.</p> }
      </section>
    </div>
  `,
})
export class Fatura {
  protected readonly dados = inject(Dados);
  private readonly avisos = inject(Avisos);
  protected readonly priv = inject(Privacidade);

  readonly id = input<string>();
  readonly m = input<string>();

  protected readonly mes = signal(mesAtual());
  protected readonly conta = signal<ContaCartao | null>(null);
  protected readonly itens = signal<LancamentoDetalhado[]>([]);
  protected readonly erro = signal('');

  protected readonly nomeMes = computed(() => NOMES_MES[this.mes().mes - 1]);
  protected readonly titulo = computed(() => `${this.nomeMes().slice(0, 3)} ${this.mes().ano}`);
  protected readonly fundo = computed(() => gradienteDoCartao(this.conta()?.id ?? 0));
  protected readonly total = computed(() => this.itens().reduce((t, l) => t + l.valor, 0));
  protected readonly pago = computed(() => this.itens().filter((l) => l.pago).reduce((t, l) => t + l.valor, 0));
  protected readonly paga = computed(() => this.itens().length > 0 && this.itens().every((l) => l.pago));

  constructor() {
    effect(() => {
      const m = /^(\d{4})-(\d{2})$/.exec(this.m() ?? '');
      if (m) untracked(() => this.mes.set({ ano: +m[1], mes: +m[2] }));
    });
    effect(() => {
      this.mes();
      this.id();
      this.dados.versao();
      untracked(() => this.carregar());
    });
  }

  protected mudarMes(n: number) {
    const { ano, mes } = this.mes();
    this.mes.set(navegarMes(ano, mes, n));
  }

  protected async alternarFatura() {
    const pagar = !this.paga();
    try {
      await this.dados.marcarPago(this.itens().map((l) => l.chave), pagar);
      this.avisos.mostrar(pagar ? 'Fatura marcada como paga' : 'Pagamento desmarcado');
    } catch (e) {
      this.avisos.mostrar(mensagemDeErro(e), 'erro');
    }
  }

  private async carregar() {
    const id = Number(this.id());
    const { ano, mes } = this.mes();
    const comp = primeiroDia(ano, mes);
    try {
      const [contas, itens] = await Promise.all([this.dados.contas(), this.dados.lancamentosPorCompetencia(comp, comp)]);
      this.conta.set(contas.find((c) => c.id === id) ?? null);
      if (!contas.some((c) => c.id === id)) this.erro.set('Cartão não encontrado.');
      this.itens.set(itens.filter((l) => ehGasto(l) && l.compra.conta_cartao?.id === id));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}
