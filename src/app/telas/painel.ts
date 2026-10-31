// Painel do mês, no estilo de app de banco: cartão principal com gradiente (gasto × renda, número animado),
// atalhos, cartões de crédito desenhados com a fatura do mês, gastos por categoria (rosca), próximos vencimentos
// e quanto dos próximos meses já está comprometido. Totais usam "competencia" (o mês em que o gasto conta).
// O olhinho esconde os valores (Privacidade).
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatar, lerData } from '../dominio/parcelamento';
import { mensagemDeErro } from '../nucleo/api';
import { IconeCategoria } from '../nucleo/categoria-icone';
import { Configuracao, ContaCartao, Dados, LancamentoDetalhado } from '../nucleo/dados';
import { NOMES_MES, gradienteDoCartao, hoje, mesAtual, navegarMes, nomeMesCurto, primeiroDia } from '../nucleo/formato';
import { Icone } from '../nucleo/icone';
import { Privacidade } from '../nucleo/privacidade';

const MESES_A_FRENTE = 12;
const DIAS_PROXIMOS = 30;

@Component({
  selector: 'app-painel',
  host: { class: 'tela tela-painel' },
  imports: [RouterLink, Icone, IconeCategoria],
  template: `
    <header class="topo">
      <div>
        <small>{{ saudacao }}</small>
        <h1>Seu mês</h1>
      </div>
      <div class="topo-acoes">
        <button type="button" class="icone-botao contorno" (click)="priv.alternar()"
                [attr.aria-label]="priv.oculto() ? 'Mostrar valores' : 'Esconder valores'">
          <app-icone [nome]="priv.oculto() ? 'olho-fechado' : 'olho'" />
        </button>
      </div>
    </header>

    @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }

    <div class="col-principal">
    <section class="heroi">
      <div class="heroi-topo">
        @if (variacao(); as v) {
          <span class="variacao vidro" [class.subiu]="v.pct > 0" [title]="'Mês anterior: ' + priv.mostrar(totalAnterior())">
            <app-icone [nome]="v.pct > 0 ? 'subindo' : 'descendo'" /> {{ v.pct > 0 ? '+' : '' }}{{ v.pct }}% vs {{ v.mes }}
          </span>
        }
        <div class="seletor-mes vidro">
          <button type="button" (click)="mudarMes(-1)" aria-label="Mês anterior"><app-icone nome="esquerda" /></button>
          <span>{{ titulo() }}</span>
          <button type="button" (click)="mudarMes(1)" aria-label="Próximo mês"><app-icone nome="direita" /></button>
        </div>
      </div>
      <small>Gasto em {{ nomeMes() }}</small>
      <strong class="valor-grande">{{ priv.mostrar(totalAnimado()) }}</strong>
      @if (renda() > 0) {
        <div class="barra vidro" [class.estourou]="percentual() > 100"><span [style.width.%]="percentualBarra()"></span></div>
        <small>{{ percentual() }}% da renda de {{ priv.mostrar(renda()) }}</small>
      }
      <div class="numeros">
        <div class="vidro">
          <small>{{ sobra() >= 0 ? 'Disponível' : 'Acima da renda' }}</small>
          <strong [class.alerta]="sobra() < 0">{{ renda() > 0 ? priv.mostrar(abs(sobra())) : '—' }}</strong>
        </div>
        <div class="vidro">
          <small>Parcelas a vencer</small>
          <strong>{{ priv.mostrar(totalFuturo()) }}</strong>
        </div>
      </div>
    </section>

    <nav class="atalhos" aria-label="Atalhos">
      <a routerLink="/gasto/novo"><span><app-icone nome="brilho" /></span>Lançar</a>
      <a routerLink="/calendario"><span><app-icone nome="calendario" /></span>Calendário</a>
      <a routerLink="/cadastros" fragment="cartoes"><span><app-icone nome="cartao" /></span>Cartões</a>
      <a routerLink="/cadastros" fragment="backup"><span><app-icone nome="baixar" /></span>Backup</a>
    </nav>

    @if (cartoes().length) {
      <h2 class="secao">Faturas de {{ nomeMes().toLowerCase() }}</h2>
      <div class="carrossel">
        @for (c of cartoes(); track c.id) {
          <div class="cartao-credito" [style.background]="c.fundo">
            <div class="cc-topo"><strong>{{ c.nome }}</strong><app-icone nome="cartao" /></div>
            <span class="cc-chip"></span>
            <div>
              <small>Fatura do mês</small>
              <strong class="cc-valor">{{ priv.mostrar(c.fatura) }}</strong>
            </div>
            <small>{{ c.vencimento ? 'Vence dia ' + c.vencimento : 'Sem vencimento cadastrado' }}</small>
          </div>
        }
      </div>
    }

    </div>

    <div class="col-lateral">
    <section class="cartao">
      <h2>Por categoria</h2>
      @if (porCategoria().length) {
        <div class="rosca-area">
          <div class="rosca-caixa">
            <svg class="rosca" viewBox="0 0 42 42" role="img" [attr.aria-label]="'Gastos por categoria em ' + nomeMes()">
              <circle cx="21" cy="21" r="15.9155" fill="none" class="rosca-fundo" stroke-width="5" />
              @for (f of fatias(); track f.nome) {
                <circle cx="21" cy="21" r="15.9155" fill="none" [attr.stroke]="f.cor" stroke-width="5" stroke-linecap="round"
                        [attr.stroke-dasharray]="f.traco + ' ' + (100 - f.traco)" [attr.stroke-dashoffset]="f.deslocamento" />
              }
            </svg>
            <div class="rosca-centro"><small>{{ porCategoria().length }} categorias</small><strong>{{ priv.mostrar(totalMes()) }}</strong></div>
          </div>
          <ul class="legenda">
            @for (c of porCategoria(); track c.nome) {
              <li>
                <app-icone-categoria [nome]="c.nome" [cor]="c.cor" />
                <span class="nome">{{ c.nome }}<span class="barra fina"><span [style.width.%]="pct(c.total)" [style.background]="c.cor"></span></span></span>
                <span class="direita"><strong>{{ priv.mostrar(c.total) }}</strong><small>{{ pct(c.total) }}%</small></span>
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
          <app-icone-categoria [nome]="l.compra.categoria?.nome" [cor]="l.compra.categoria?.cor" />
          <span class="texto">
            <strong>{{ l.compra.descricao }} @if (l.total_parcelas > 1) { <span class="parcela">{{ l.numero }}/{{ l.total_parcelas }}</span> }</strong>
            <small class="suave">{{ quando(l.data_prevista) }} · {{ l.compra.estabelecimento ?? l.compra.categoria?.nome ?? '' }}</small>
          </span>
          <strong class="valor">{{ priv.mostrar(l.valor) }}</strong>
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
          <div class="coluna" [title]="priv.mostrar(m.total)">
            <span class="valor">{{ m.total && !priv.oculto() ? curto(m.total) : '' }}</span>
            <span class="pilar" [style.height.%]="(m.total / maiorFuturo()) * 100"></span>
            <small>{{ nomeMesCurto(m.competencia).slice(0, 3) }}</small>
          </div>
        }
      </div>
    </section>
    </div>
  `,
})
export class Painel {
  private readonly dados = inject(Dados);
  protected readonly priv = inject(Privacidade);

  protected readonly abs = Math.abs;
  protected readonly nomeMesCurto = nomeMesCurto;
  protected readonly diasProximos = DIAS_PROXIMOS;
  protected readonly saudacao = saudacao();
  protected readonly mes = signal(mesAtual());
  protected readonly config = signal<Configuracao | null>(null);
  protected readonly contas = signal<ContaCartao[]>([]);
  protected readonly doMes = signal<LancamentoDetalhado[]>([]);
  protected readonly aVencer = signal<LancamentoDetalhado[]>([]);
  protected readonly proximos = signal<LancamentoDetalhado[]>([]);
  protected readonly erro = signal('');
  /** Valor exibido no cartão principal: sobe até o total (efeito "contador"). */
  protected readonly totalAnimado = signal(0);
  private pedido = 0;

  protected readonly nomeMes = computed(() => NOMES_MES[this.mes().mes - 1]);
  protected readonly titulo = computed(() => `${this.nomeMes().slice(0, 3)} ${this.mes().ano}`);
  protected readonly renda = computed(() => Number(this.config()?.renda_mensal ?? 0));
  protected readonly totalMes = computed(() => soma(this.doMes()));
  protected readonly totalFuturo = computed(() => soma(this.aVencer()));
  protected readonly totalAnterior = signal(0);
  /** Comparação com o mês anterior (só aparece se os dois meses têm gasto). Subir = gastou mais. */
  protected readonly variacao = computed(() => {
    const antes = this.totalAnterior();
    if (!antes || !this.totalMes()) return null;
    const anterior = navegarMes(this.mes().ano, this.mes().mes, -1);
    return { pct: Math.round(((this.totalMes() - antes) / antes) * 100), mes: NOMES_MES[anterior.mes - 1].slice(0, 3).toLowerCase() };
  });
  protected readonly sobra = computed(() => this.renda() - this.totalMes());
  protected readonly percentual = computed(() => (this.renda() > 0 ? Math.round((this.totalMes() / this.renda()) * 100) : 0));
  protected readonly percentualBarra = computed(() => Math.min(this.percentual(), 100));

  /** Cartões de crédito com a soma das parcelas que caem na fatura do mês escolhido. */
  protected readonly cartoes = computed(() =>
    this.contas()
      .filter((c) => c.tipo === 'credito')
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        vencimento: c.dia_vencimento,
        fundo: gradienteDoCartao(c.id),
        fatura: soma(this.doMes().filter((l) => l.compra.conta_cartao?.id === c.id)),
      })),
  );

  protected readonly porCategoria = computed(() => {
    const grupos = new Map<string, { nome: string; cor: string; total: number }>();
    for (const l of this.doMes()) {
      const nome = l.compra.categoria?.nome ?? 'Sem categoria';
      const g = grupos.get(nome) ?? { nome, cor: l.compra.categoria?.cor ?? '#71717a', total: 0 };
      g.total += l.valor;
      grupos.set(nome, g);
    }
    return [...grupos.values()].sort((a, b) => b.total - a.total);
  });

  /** Rosca: cada fatia é um círculo tracejado (circunferência = 100). Um respiro de 1.5 separa as fatias. */
  protected readonly fatias = computed(() => {
    let acumulado = 0;
    const respiro = this.porCategoria().length > 1 ? 1.5 : 0;
    return this.porCategoria().map((c) => {
      const pct = this.totalMes() ? (c.total / this.totalMes()) * 100 : 0;
      const fatia = { nome: c.nome, cor: c.cor, traco: Math.max(pct - respiro, 0.5), deslocamento: 25 - acumulado };
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
    // Recarrega tudo quando os dados mudam (gravação, ou dados novos de outro aparelho).
    effect(() => {
      this.dados.versao();
      untracked(() => {
        Promise.all([this.dados.configuracao(), this.dados.contas()])
          .then(([c, contas]) => {
            this.config.set(c);
            this.contas.set(contas);
          })
          .catch((e) => this.erro.set(mensagemDeErro(e)));
        this.carregarProximos();
        this.carregar();
      });
    });
    // untracked: a animação lê o valor exibido, e isso não pode virar dependência do efeito (rodaria em loop).
    effect(() => {
      const destino = this.totalMes();
      untracked(() => animarAte(destino, this.totalAnimado));
    });
  }

  protected mudarMes(quantos: number) {
    const { ano, mes } = this.mes();
    this.mes.set(navegarMes(ano, mes, quantos));
    this.carregar();
  }

  protected pct(v: number) {
    return this.totalMes() ? Math.round((v / this.totalMes()) * 100) : 0;
  }

  protected quando(data: string) {
    if (data === hoje()) return 'Hoje';
    const { dia, mes } = lerData(data);
    return `${dia} de ${NOMES_MES[mes - 1].slice(0, 3).toLowerCase()}`;
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
    const antes = navegarMes(ano, mes, -1);
    this.erro.set('');
    const pedido = ++this.pedido;
    try {
      const [doMes, aVencer, anterior] = await Promise.all([
        this.dados.lancamentosPorCompetencia(inicio, inicio),
        this.dados.lancamentosPorCompetencia(primeiroDia(depois.ano, depois.mes), primeiroDia(fim.ano, fim.mes)),
        this.dados.lancamentosPorCompetencia(primeiroDia(antes.ano, antes.mes), primeiroDia(antes.ano, antes.mes)),
      ]);
      // Trocou de mês rápido: a resposta antiga chega depois e não pode sobrescrever a nova.
      if (pedido !== this.pedido) return;
      this.totalAnterior.set(soma(anterior));
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

/** Anima um número do valor atual até o destino em ~0,6 s (respeita quem pediu menos movimento). */
function animarAte(destino: number, alvo: { (): number; set(v: number): void }) {
  const inicio = alvo();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || inicio === destino) return alvo.set(destino);
  const t0 = performance.now();
  const passo = (t: number) => {
    const p = Math.min((t - t0) / 600, 1);
    const suave = 1 - Math.pow(1 - p, 3);
    alvo.set(Math.round((inicio + (destino - inicio) * suave) * 100) / 100);
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
