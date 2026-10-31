// Painel do mês: gasto × renda, gastos por categoria (rosca), próximos vencimentos e quanto dos próximos meses
// já está comprometido com parcelas. Totais do mês usam "competencia" (o mês em que o gasto conta).
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatar, lerData } from '../dominio/parcelamento';
import { mensagemDeErro } from '../nucleo/api';
import { Configuracao, Dados, LancamentoDetalhado } from '../nucleo/dados';
import { NOMES_MES, dataCurta, hoje, mesAtual, navegarMes, nomeMesCurto, primeiroDia, reais } from '../nucleo/formato';
import { Icone } from '../nucleo/icone';

const MESES_A_FRENTE = 12;
const DIAS_PROXIMOS = 30;

@Component({
  selector: 'app-painel',
  imports: [RouterLink, Icone],
  template: `
    <header class="topo">
      <div>
        <small class="suave">{{ saudacao }}</small>
        <h1>Seu mês</h1>
      </div>
      <div class="seletor-mes">
        <button type="button" (click)="mudarMes(-1)" aria-label="Mês anterior"><app-icone nome="esquerda" /></button>
        <span>{{ titulo() }}</span>
        <button type="button" (click)="mudarMes(1)" aria-label="Próximo mês"><app-icone nome="direita" /></button>
      </div>
    </header>

    @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }

    <section class="destaque-mes">
      <small>Gasto em {{ nomeMes() }}</small>
      <strong class="valor-grande">{{ reais(totalMes()) }}</strong>
      @if (renda() > 0) {
        <div class="barra clara" [class.estourou]="percentual() > 100"><span [style.width.%]="percentualBarra()"></span></div>
        <small>{{ percentual() }}% da renda de {{ reais(renda()) }}</small>
      }
      <div class="numeros">
        <div>
          <small>{{ sobra() >= 0 ? 'Disponível' : 'Acima da renda' }}</small>
          <strong [class.alerta]="sobra() < 0">{{ renda() > 0 ? reais(abs(sobra())) : '—' }}</strong>
        </div>
        <div>
          <small>Parcelas a vencer</small>
          <strong>{{ reais(totalFuturo()) }}</strong>
        </div>
      </div>
    </section>

    <section class="cartao">
      <h2>Por categoria</h2>
      @if (porCategoria().length) {
        <div class="rosca-area">
          <svg class="rosca" viewBox="0 0 42 42" role="img" [attr.aria-label]="'Gastos por categoria em ' + nomeMes()">
            <circle cx="21" cy="21" r="15.9155" fill="none" class="rosca-fundo" stroke-width="6" />
            @for (f of fatias(); track f.nome) {
              <circle cx="21" cy="21" r="15.9155" fill="none" [attr.stroke]="f.cor" stroke-width="6"
                      [attr.stroke-dasharray]="f.pct + ' ' + (100 - f.pct)" [attr.stroke-dashoffset]="f.deslocamento" />
            }
          </svg>
          <ul class="legenda">
            @for (c of porCategoria(); track c.nome) {
              <li>
                <span class="bolinha" [style.background]="c.cor"></span>
                <span class="nome">{{ c.nome }}</span>
                <span class="suave">{{ pct(c.total) }}%</span>
                <strong>{{ reais(c.total) }}</strong>
              </li>
            }
          </ul>
        </div>
      } @else {
        <div class="vazio">
          <p>Nenhum gasto em {{ nomeMes() }}.</p>
          <a class="botao primario" routerLink="/gasto/novo"><app-icone nome="mais" /> Lançar um gasto</a>
        </div>
      }
    </section>

    <section class="cartao">
      <h2>Próximos {{ diasProximos }} dias</h2>
      @for (l of proximos(); track l.id) {
        <a class="linha-lancamento" [routerLink]="['/gasto', l.compra.id]">
          <span class="data-bloco"><strong>{{ dia(l.data_prevista) }}</strong><small>{{ mesCurto(l.data_prevista) }}</small></span>
          <span class="texto">
            <strong>{{ l.compra.descricao }} @if (l.total_parcelas > 1) { <span class="parcela">{{ l.numero }}/{{ l.total_parcelas }}</span> }</strong>
            <small class="suave">{{ l.compra.estabelecimento ?? l.compra.categoria?.nome ?? '' }}</small>
          </span>
          <strong>{{ reais(l.valor) }}</strong>
        </a>
      } @empty {
        <p class="suave">Nada previsto.</p>
      }
    </section>

    <section class="cartao">
      <h2>Já comprometido</h2>
      <p class="suave">Parcelas que vão cair nos próximos meses, de compras já feitas.</p>
      <div class="colunas">
        @for (m of futuro(); track m.competencia) {
          <div class="coluna" [title]="reais(m.total)">
            <span class="valor">{{ m.total ? curto(m.total) : '' }}</span>
            <span class="pilar" [style.height.%]="(m.total / maiorFuturo()) * 100"></span>
            <small>{{ nomeMesCurto(m.competencia).slice(0, 3) }}</small>
          </div>
        }
      </div>
    </section>
  `,
})
export class Painel {
  private readonly dados = inject(Dados);

  protected readonly reais = reais;
  protected readonly abs = Math.abs;
  protected readonly nomeMesCurto = nomeMesCurto;
  protected readonly diasProximos = DIAS_PROXIMOS;
  protected readonly saudacao = saudacao();
  protected readonly mes = signal(mesAtual());
  protected readonly config = signal<Configuracao | null>(null);
  protected readonly doMes = signal<LancamentoDetalhado[]>([]);
  protected readonly aVencer = signal<LancamentoDetalhado[]>([]);
  protected readonly proximos = signal<LancamentoDetalhado[]>([]);
  protected readonly erro = signal('');
  private pedido = 0;

  protected readonly nomeMes = computed(() => NOMES_MES[this.mes().mes - 1]);
  protected readonly titulo = computed(() => `${this.nomeMes().slice(0, 3)} ${this.mes().ano}`);
  protected readonly renda = computed(() => Number(this.config()?.renda_mensal ?? 0));
  protected readonly totalMes = computed(() => soma(this.doMes()));
  protected readonly totalFuturo = computed(() => soma(this.aVencer()));
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

  /** Rosca: cada fatia é um círculo com traço tracejado (circunferência = 100, então % = comprimento). */
  protected readonly fatias = computed(() => {
    let acumulado = 0;
    return this.porCategoria().map((c) => {
      const pct = this.totalMes() ? (c.total / this.totalMes()) * 100 : 0;
      const fatia = { nome: c.nome, cor: c.cor, pct, deslocamento: 25 - acumulado };
      acumulado += pct;
      return fatia;
    });
  });

  protected readonly futuro = computed(() => {
    const { ano, mes } = this.mes();
    return Array.from({ length: MESES_A_FRENTE }, (_, i) => {
      const m = navegarMes(ano, mes, i + 1);
      const competencia = primeiroDia(m.ano, m.mes);
      return { competencia, total: soma(this.aVencer().filter((l) => l.competencia === competencia)) };
    });
  });
  protected readonly maiorFuturo = computed(() => Math.max(1, ...this.futuro().map((m) => m.total)));

  constructor() {
    this.dados.configuracao().then((c) => this.config.set(c)).catch((e) => this.erro.set(mensagemDeErro(e)));
    this.carregarProximos();
    this.carregar();
  }

  protected mudarMes(quantos: number) {
    const { ano, mes } = this.mes();
    this.mes.set(navegarMes(ano, mes, quantos));
    this.carregar();
  }

  protected pct(v: number) {
    return this.totalMes() ? Math.round((v / this.totalMes()) * 100) : 0;
  }

  protected dia(data: string) {
    return dataCurta(data).slice(0, 2);
  }

  protected mesCurto(data: string) {
    return NOMES_MES[lerData(data).mes - 1].slice(0, 3);
  }

  protected curto(v: number) {
    return v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : Math.round(v).toString();
  }

  private async carregarProximos() {
    const h = lerData(hoje());
    const fim = new Date(h.ano, h.mes - 1, h.dia + DIAS_PROXIMOS);
    try {
      const lista = await this.dados.lancamentosPorData(hoje(), formatar(fim.getFullYear(), fim.getMonth() + 1, fim.getDate()));
      this.proximos.set(lista.slice(0, 6));
    } catch {
      /* o erro principal já aparece pelo carregar() */
    }
  }

  private async carregar() {
    const { ano, mes } = this.mes();
    const inicio = primeiroDia(ano, mes);
    const depois = navegarMes(ano, mes, 1);
    const fim = navegarMes(ano, mes, MESES_A_FRENTE);
    this.erro.set('');
    const pedido = ++this.pedido;
    try {
      const [doMes, aVencer] = await Promise.all([
        this.dados.lancamentosPorCompetencia(inicio, inicio),
        this.dados.lancamentosPorCompetencia(primeiroDia(depois.ano, depois.mes), primeiroDia(fim.ano, fim.mes)),
      ]);
      // Trocou de mês rápido: a resposta antiga chega depois e não pode sobrescrever a nova.
      if (pedido !== this.pedido) return;
      this.doMes.set(doMes);
      this.aVencer.set(aVencer);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}

function soma(l: LancamentoDetalhado[]): number {
  return Math.round(l.reduce((t, x) => t + x.valor, 0) * 100) / 100;
}

function saudacao(): string {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
