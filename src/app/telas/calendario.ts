// Calendário do mês: grade com o total de cada dia e, abaixo, o detalhe de cada parcela
// ("Geladeira (3/10) — R$ 300,00 → Casas Bahia · Eletrodomésticos"). Usa data_prevista (o dia em que cai).
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { diasNoMes, formatar } from '../dominio/parcelamento';
import { Dados, LancamentoDetalhado } from '../nucleo/dados';
import { NOMES_MES, dataCurta, hoje, mesAtual, navegarMes, reais } from '../nucleo/formato';
import { mensagemDeErro } from '../nucleo/supabase';

interface Dia {
  data: string;
  numero: number;
  total: number;
  cores: string[];
}

@Component({
  selector: 'app-calendario',
  template: `
    <header class="topo">
      <button class="seta" (click)="mudarMes(-1)" aria-label="Mês anterior">‹</button>
      <h1>{{ titulo() }}</h1>
      <button class="seta" (click)="mudarMes(1)" aria-label="Próximo mês">›</button>
    </header>

    @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }

    <section class="cartao">
      <div class="grade">
        @for (s of semana; track $index) { <span class="dia-semana">{{ s }}</span> }
        @for (v of vazios(); track $index) { <span></span> }
        @for (d of dias(); track d.data) {
          <button type="button" class="dia" [class.hoje]="d.data === hoje" [class.selecionado]="d.data === selecionado()"
                  [class.com-gasto]="d.total > 0" (click)="selecionar(d.data)">
            <span class="numero">{{ d.numero }}</span>
            @if (d.total > 0) {
              <span class="pontos">@for (c of d.cores; track $index) { <i [style.background]="c"></i> }</span>
              <small>{{ curto(d.total) }}</small>
            }
          </button>
        }
      </div>
      <p class="total-mes">Total do mês <strong>{{ reais(totalMes()) }}</strong></p>
    </section>

    <section class="cartao">
      <div class="linha-texto">
        <h2>{{ selecionado() ? 'Dia ' + dataCurta(selecionado()!) : 'Todos os gastos do mês' }}</h2>
        @if (selecionado()) { <button class="link" (click)="selecionado.set(null)">ver o mês</button> }
      </div>
      @for (l of lista(); track l.id) {
        <button type="button" class="lancamento" (click)="editar(l.compra.id)">
          <span class="bolinha" [style.background]="l.compra.categoria?.cor ?? '#94a3b8'"></span>
          <span class="texto">
            <strong>
              {{ l.compra.descricao }}
              @if (l.total_parcelas > 1) { <span class="parcela">{{ l.numero }}/{{ l.total_parcelas }}</span> }
            </strong>
            <small class="suave">
              {{ dataCurta(l.data_prevista) }}
              @if (l.compra.estabelecimento) { · → {{ l.compra.estabelecimento }} }
              · {{ l.compra.categoria?.nome ?? 'Sem categoria' }}
              @if (l.compra.conta_cartao) { · {{ l.compra.conta_cartao.nome }} }
              @if (l.total_parcelas > 1) { · total {{ reais(l.compra.valor_total) }} }
            </small>
          </span>
          <strong class="valor">{{ reais(l.valor) }}</strong>
        </button>
      } @empty {
        <p class="suave">Nada lançado {{ selecionado() ? 'neste dia' : 'neste mês' }}.</p>
      }
    </section>
  `,
})
export class Calendario {
  private readonly dados = inject(Dados);
  private readonly router = inject(Router);

  protected readonly reais = reais;
  protected readonly dataCurta = dataCurta;
  protected readonly hoje = hoje();
  protected readonly semana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  protected readonly mes = signal(mesAtual());
  protected readonly lancamentos = signal<LancamentoDetalhado[]>([]);
  protected readonly selecionado = signal<string | null>(null);
  protected readonly erro = signal('');
  private pedido = 0;

  protected readonly titulo = computed(() => `${NOMES_MES[this.mes().mes - 1]} ${this.mes().ano}`);
  /** Casas vazias antes do dia 1 (domingo = 0). */
  protected readonly vazios = computed(() => Array(new Date(this.mes().ano, this.mes().mes - 1, 1).getDay()));
  protected readonly totalMes = computed(() => this.lancamentos().reduce((t, l) => t + l.valor, 0));

  protected readonly dias = computed<Dia[]>(() => {
    const { ano, mes } = this.mes();
    return Array.from({ length: diasNoMes(ano, mes) }, (_, i) => {
      const data = formatar(ano, mes, i + 1);
      const doDia = this.lancamentos().filter((l) => l.data_prevista === data);
      const cores = [...new Set(doDia.map((l) => l.compra.categoria?.cor ?? '#94a3b8'))].slice(0, 3);
      return { data, numero: i + 1, total: doDia.reduce((t, l) => t + l.valor, 0), cores };
    });
  });

  protected readonly lista = computed(() => {
    const dia = this.selecionado();
    return dia ? this.lancamentos().filter((l) => l.data_prevista === dia) : this.lancamentos();
  });

  constructor() {
    this.carregar();
  }

  protected mudarMes(quantos: number) {
    const { ano, mes } = this.mes();
    this.mes.set(navegarMes(ano, mes, quantos));
    this.selecionado.set(null);
    this.carregar();
  }

  protected selecionar(data: string) {
    this.selecionado.set(this.selecionado() === data ? null : data);
  }

  protected editar(compraId: number) {
    this.router.navigate(['/gasto', compraId]);
  }

  protected curto(v: number) {
    return v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : Math.round(v).toString();
  }

  private async carregar() {
    const { ano, mes } = this.mes();
    const pedido = ++this.pedido;
    this.erro.set('');
    try {
      const l = await this.dados.lancamentosPorData(formatar(ano, mes, 1), formatar(ano, mes, diasNoMes(ano, mes)));
      if (pedido === this.pedido) this.lancamentos.set(l);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}
