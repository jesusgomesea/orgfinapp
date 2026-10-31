// Painel do mês: gasto × renda, gastos por categoria e quanto dos próximos meses já está comprometido com parcelas.
// Tudo é calculado sobre "competencia" (o mês em que o gasto conta), não sobre o dia do calendário.
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Configuracao, Dados, LancamentoDetalhado } from '../nucleo/dados';
import { NOMES_MES, mesAtual, navegarMes, nomeMesCurto, primeiroDia, reais } from '../nucleo/formato';
import { mensagemDeErro } from '../nucleo/supabase';

const MESES_A_FRENTE = 12;

@Component({
  selector: 'app-painel',
  imports: [RouterLink],
  template: `
    <header class="topo">
      <button class="seta" (click)="mudarMes(-1)" aria-label="Mês anterior">‹</button>
      <h1>{{ titulo() }}</h1>
      <button class="seta" (click)="mudarMes(1)" aria-label="Próximo mês">›</button>
    </header>

    @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }

    <section class="cartao resumo">
      <div>
        <small class="suave">Gasto no mês</small>
        <strong class="grande">{{ reais(totalMes()) }}</strong>
      </div>
      <div class="direita">
        <small class="suave">Renda</small>
        <strong>{{ reais(renda()) }}</strong>
      </div>
      <div class="barra" [class.estourou]="percentual() > 100">
        <span [style.width.%]="percentualBarra()"></span>
      </div>
      <p class="suave">
        @if (renda() > 0) {
          {{ percentual() }}% da renda ·
          @if (sobra() >= 0) { sobram <strong class="positivo">{{ reais(sobra()) }}</strong> }
          @else { faltam <strong class="negativo">{{ reais(-sobra()) }}</strong> }
        } @else {
          Cadastre sua renda em Cadastros para ver quanto sobra.
        }
      </p>
    </section>

    <section class="cartao">
      <h2>Por categoria</h2>
      @for (c of porCategoria(); track c.nome) {
        <div class="categoria">
          <div class="linha-texto">
            <span><span class="bolinha" [style.background]="c.cor"></span>{{ c.nome }}</span>
            <strong>{{ reais(c.total) }}</strong>
          </div>
          <div class="barra fina"><span [style.width.%]="(c.total / maiorCategoria()) * 100" [style.background]="c.cor"></span></div>
        </div>
      } @empty {
        <p class="suave">Nenhum gasto neste mês. <a routerLink="/gasto/novo">Lançar um gasto</a></p>
      }
    </section>

    <section class="cartao">
      <h2>Já comprometido nos próximos meses</h2>
      <p class="suave">Parcelas que já vão cair, de compras feitas até agora.</p>
      <div class="colunas">
        @for (m of futuro(); track m.competencia) {
          <div class="coluna" [title]="reais(m.total)">
            <span class="valor">{{ m.total ? reaisCurto(m.total) : '' }}</span>
            <span class="pilar" [style.height.%]="(m.total / maiorFuturo()) * 100"></span>
            <small>{{ nomeMesCurto(m.competencia) }}</small>
          </div>
        }
      </div>
    </section>
  `,
})
export class Painel {
  private readonly dados = inject(Dados);

  protected readonly reais = reais;
  protected readonly nomeMesCurto = nomeMesCurto;
  protected readonly mes = signal(mesAtual());
  protected readonly config = signal<Configuracao | null>(null);
  protected readonly doMes = signal<LancamentoDetalhado[]>([]);
  protected readonly proximos = signal<LancamentoDetalhado[]>([]);
  protected readonly erro = signal('');
  private pedido = 0;

  protected readonly titulo = computed(() => `${NOMES_MES[this.mes().mes - 1]} ${this.mes().ano}`);
  protected readonly renda = computed(() => Number(this.config()?.renda_mensal ?? 0));
  protected readonly totalMes = computed(() => soma(this.doMes()));
  protected readonly sobra = computed(() => this.renda() - this.totalMes());
  protected readonly percentual = computed(() => (this.renda() > 0 ? Math.round((this.totalMes() / this.renda()) * 100) : 0));
  protected readonly percentualBarra = computed(() => Math.min(this.percentual(), 100));

  protected readonly porCategoria = computed(() => {
    const grupos = new Map<string, { nome: string; cor: string; total: number }>();
    for (const l of this.doMes()) {
      const nome = l.compra.categoria?.nome ?? 'Sem categoria';
      const g = grupos.get(nome) ?? { nome, cor: l.compra.categoria?.cor ?? '#94a3b8', total: 0 };
      g.total += l.valor;
      grupos.set(nome, g);
    }
    return [...grupos.values()].sort((a, b) => b.total - a.total);
  });
  protected readonly maiorCategoria = computed(() => Math.max(1, ...this.porCategoria().map((c) => c.total)));

  protected readonly futuro = computed(() => {
    const { ano, mes } = this.mes();
    return Array.from({ length: MESES_A_FRENTE }, (_, i) => {
      const m = navegarMes(ano, mes, i + 1);
      const competencia = primeiroDia(m.ano, m.mes);
      return { competencia, total: soma(this.proximos().filter((l) => l.competencia === competencia)) };
    });
  });
  protected readonly maiorFuturo = computed(() => Math.max(1, ...this.futuro().map((m) => m.total)));

  constructor() {
    this.dados.configuracao().then((c) => this.config.set(c)).catch((e) => this.erro.set(mensagemDeErro(e)));
    this.carregar();
  }

  protected mudarMes(quantos: number) {
    const { ano, mes } = this.mes();
    this.mes.set(navegarMes(ano, mes, quantos));
    this.carregar();
  }

  protected reaisCurto(v: number) {
    return v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : Math.round(v).toString();
  }

  private async carregar() {
    const { ano, mes } = this.mes();
    const inicio = primeiroDia(ano, mes);
    const depois = navegarMes(ano, mes, 1);
    const fim = navegarMes(ano, mes, MESES_A_FRENTE);
    this.erro.set('');
    const pedido = ++this.pedido;
    try {
      const [doMes, proximos] = await Promise.all([
        this.dados.lancamentosPorCompetencia(inicio, inicio),
        this.dados.lancamentosPorCompetencia(primeiroDia(depois.ano, depois.mes), primeiroDia(fim.ano, fim.mes)),
      ]);
      // Trocou de mês rápido: a resposta antiga chega depois e não pode sobrescrever a nova.
      if (pedido !== this.pedido) return;
      this.doMes.set(doMes);
      this.proximos.set(proximos);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}

function soma(l: LancamentoDetalhado[]): number {
  return Math.round(l.reduce((t, x) => t + x.valor, 0) * 100) / 100;
}
