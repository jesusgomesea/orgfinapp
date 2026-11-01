// Painel do mês, no estilo de app de banco:
//  - cartão principal: gasto do mês × renda (salário + entradas do mês), número animado, "Disponível" e "Falta pagar";
//  - atalhos; alertas de limite por categoria; faturas dos cartões (tocar abre a fatura); resumo dos cofres;
//  - gastos por categoria (rosca + limite), próximos vencimentos (com "pago") e o que já está comprometido.
// Totais usam "competencia" (o mês em que o gasto conta). Entradas NÃO entram no total de gastos.
// O olhinho esconde os valores (Privacidade).
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { diasNoMes, formatar, lerData } from '../dominio/parcelamento';
import { mensagemDeErro } from '../nucleo/api';
import { IconeCategoria } from '../nucleo/categoria-icone';
import { Categoria, CofreResumo, Configuracao, ContaCartao, Dados, LancamentoDetalhado, ehEntrada, ehGasto } from '../nucleo/dados';
import { NOMES_MES, gradienteDoCartao, hoje, mesAtual, navegarMes, nomeMesCurto, primeiroDia } from '../nucleo/formato';
import { Atalhos, chaveRetrospectivaVista } from '../nucleo/atalhos';
import { DeslizarMes } from '../nucleo/deslizar-mes';
import { Icone } from '../nucleo/icone';
import { ItemLancamento } from '../nucleo/item-lancamento';
import { Privacidade } from '../nucleo/privacidade';

const MESES_A_FRENTE = 12;
const DIAS_PROXIMOS = 30;
const ALERTA_LIMITE = 0.8;

@Component({
  selector: 'app-painel',
  host: { class: 'tela tela-painel', '[class.carregando]': '!dados.pronto()' },
  imports: [RouterLink, Icone, IconeCategoria, ItemLancamento, DeslizarMes],
  template: `
    <header class="topo">
      <div>
        <small>{{ saudacao }}{{ config()?.nome ? ', ' + config()!.nome : '' }}</small>
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
    <section class="heroi" appDeslizarMes (anterior)="mudarMes(-1)" (proximo)="mudarMes(1)">
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
        <small>
          {{ percentual() }}% da renda de {{ priv.mostrar(renda()) }}
          @if (entradasMes() > 0) { (com {{ priv.mostrar(entradasMes()) }} de entradas) }
        </small>
      }
      <div class="numeros">
        <div class="vidro">
          <small>{{ sobra() >= 0 ? 'Disponível' : 'Acima da renda' }}</small>
          <strong [class.alerta]="sobra() < 0">{{ renda() > 0 ? priv.mostrar(abs(sobra())) : '—' }}</strong>
          @if (guardadoMes() > 0) { <small>já tirando {{ priv.mostrar(guardadoMes()) }} guardados</small> }
        </div>
        <div class="vidro">
          <small>Falta pagar no mês</small>
          <strong>{{ priv.mostrar(faltaPagar()) }}</strong>
          <small>{{ priv.mostrar(pagoMes()) }} já pagos</small>
        </div>
      </div>
    </section>

    @if (retroPendente(); as r) {
      <a class="retro-convite" routerLink="/retrospectiva" [queryParams]="{ m: r.chave }">
        <span class="retro-convite-icone"><app-icone nome="brilho" /></span>
        <span><strong>Sua retrospectiva de {{ r.nome }} está pronta</strong><small>Toque para ver como foi o mês</small></span>
        <app-icone nome="direita" />
      </a>
    }

    <nav class="atalhos" aria-label="Atalhos">
      <a href="/gasto/novo" (click)="atalhos.abrirLancamento($event)"><span><app-icone nome="mais" /></span>Lançar</a>
      <a routerLink="/fixos"><span><app-icone nome="repetir" /></span>Fixos</a>
      <a routerLink="/cofres"><span><app-icone nome="cofre" /></span>Cofres</a>
      <a routerLink="/assistente"><span><app-icone nome="conversa" /></span>Perguntar</a>
    </nav>

    @for (a of alertas(); track a.nome) {
      <a class="alerta-limite" [class.estourou]="a.pct >= 100" routerLink="/calendario">
        <app-icone-categoria [nome]="a.nome" [cor]="a.cor" />
        <span>
          <strong>{{ a.nome }}: {{ a.pct }}% do limite</strong>
          <small>{{ priv.mostrar(a.total) }} de {{ priv.mostrar(a.limite) }}{{ a.pct >= 100 ? ' — passou do limite' : '' }}</small>
        </span>
        <app-icone nome="alerta" />
      </a>
    }

    @if (cartoes().length) {
      <h2 class="secao">Faturas de {{ nomeMes().toLowerCase() }}</h2>
      <div class="carrossel">
        @for (c of cartoes(); track c.id) {
          <a class="cartao-credito" [style.background]="c.fundo" [routerLink]="['/fatura', c.id]" [queryParams]="{ m: mesChave() }">
            <div class="cc-topo"><strong>{{ c.nome }}</strong>@if (c.paga) { <span class="selo-pago"><app-icone nome="check" /> paga</span> } @else { <app-icone nome="cartao" /> }</div>
            <span class="cc-chip"></span>
            <div>
              <small>Fatura do mês</small>
              <strong class="cc-valor">{{ priv.mostrar(c.fatura) }}</strong>
            </div>
            <small>{{ c.vencimento ? 'Vence dia ' + c.vencimento : 'Sem vencimento cadastrado' }} · ver fatura</small>
          </a>
        }
      </div>
    }

    @if (cofres().length) {
      <a class="cartao cofres-resumo" routerLink="/cofres">
        <div class="linha-texto"><h2><app-icone nome="cofre" /> Cofres</h2><strong>{{ priv.mostrar(totalCofres()) }}</strong></div>
        @for (c of cofres().slice(0, 3); track c.id) {
          <div class="cofre-mini">
            <span class="nome"><span class="bolinha" [style.background]="c.cor"></span>{{ c.nome }}</span>
            <span>{{ priv.mostrar(c.saldo) }}@if (c.meta_valor) { <small class="suave"> / {{ priv.mostrar(c.meta_valor) }}</small> }</span>
            @if (c.meta_valor) { <span class="barra fina"><span [style.width.%]="min(100, (c.saldo / c.meta_valor) * 100)" [style.background]="c.cor"></span></span> }
          </div>
        }
      </a>
    }
    </div>

    <div class="col-lateral">
    <section class="cartao ritmo">
      <div class="linha-texto">
        <h2>Ritmo do mês</h2>
        <span class="legenda-mini"><i class="lg-atual"></i>{{ nomeMes().slice(0, 3).toLowerCase() }} <i class="lg-anterior"></i>{{ ritmo().nomeAnterior }}</span>
      </div>
      @if (ritmo().mensagem; as m) { <p class="ritmo-msg" [class.ruim]="ritmo().pior">{{ m }}</p> }
      <svg viewBox="0 0 320 120" class="grafico-ritmo" role="img" [attr.aria-label]="ritmo().mensagem || 'Gasto acumulado no mês'">
        <polyline class="r-anterior" [attr.points]="ritmo().anterior" fill="none" />
        <polygon class="r-area" [attr.points]="ritmo().area" />
        <polyline class="r-atual" [attr.points]="ritmo().atual" fill="none" />
        @if (ritmo().ponto; as p) { <circle class="r-hoje" [attr.cx]="p.x" [attr.cy]="p.y" r="4" /> }
        <text x="0" y="118">1</text><text x="320" y="118" text-anchor="end">{{ ritmo().dias }}</text>
      </svg>
    </section>
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
                <span class="nome">
                  {{ c.nome }}
                  @if (c.limite) {
                    <span class="barra fina" [class.estourou]="c.total > c.limite"><span [style.width.%]="min(100, (c.total / c.limite) * 100)" [style.background]="c.total > c.limite ? null : c.cor"></span></span>
                    <small class="suave">limite {{ priv.mostrar(c.limite) }}</small>
                  } @else {
                    <span class="barra fina"><span [style.width.%]="pct(c.total)" [style.background]="c.cor"></span></span>
                  }
                </span>
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

    <section class="cartao lista">
      <h2>Próximos {{ diasProximos }} dias</h2>
      @for (l of proximos(); track l.chave) {
        <app-item [item]="l" [comData]="true" [completo]="false" />
      } @empty {
        <p class="suave">Nada previsto.</p>
      }
    </section>

    <section class="cartao">
      <h2>Já comprometido</h2>
      <p class="suave">Parcelas e fixos que vão cair nos próximos meses.</p>
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
  protected readonly dados = inject(Dados);
  protected readonly priv = inject(Privacidade);
  protected readonly atalhos = inject(Atalhos);

  protected readonly abs = Math.abs;
  protected readonly min = Math.min;
  protected readonly nomeMesCurto = nomeMesCurto;
  protected readonly diasProximos = DIAS_PROXIMOS;
  protected readonly saudacao = saudacao();
  protected readonly mes = signal(mesAtual());
  protected readonly config = signal<Configuracao | null>(null);
  protected readonly contas = signal<ContaCartao[]>([]);
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly cofres = signal<CofreResumo[]>([]);
  /** Tudo do mês (gastos e entradas). */
  protected readonly itensMes = signal<LancamentoDetalhado[]>([]);
  protected readonly aVencer = signal<LancamentoDetalhado[]>([]);
  protected readonly proximos = signal<LancamentoDetalhado[]>([]);
  protected readonly erro = signal('');
  protected readonly totalAnimado = signal(0);
  protected readonly totalAnterior = signal(0);
  private pedido = 0;

  /** Itens de gasto do mês anterior (para o "Ritmo do mês"). */
  protected readonly anteriorItens = signal<LancamentoDetalhado[]>([]);

  /**
   * Ritmo do mês: gasto ACUMULADO dia a dia (pelo dia em que o dinheiro sai) neste mês × no mês anterior.
   * No mês atual a linha para em hoje e compara "até hoje" com "até o mesmo dia do mês passado".
   */
  protected readonly ritmo = computed(() => {
    const { ano, mes } = this.mes();
    const dias = diasNoMes(ano, mes);
    const ant = navegarMes(ano, mes, -1);
    const diasAnt = diasNoMes(ant.ano, ant.mes);
    const acumular = (itens: LancamentoDetalhado[], n: number) => {
      const porDia = Array(n + 1).fill(0);
      for (const l of itens) porDia[lerData(l.data_prevista).dia] += l.valor;
      for (let d = 1; d <= n; d++) porDia[d] += porDia[d - 1];
      return porDia;
    };
    const atual = acumular(this.doMes(), dias);
    const anterior = acumular(this.anteriorItens(), diasAnt);
    const h = lerData(hoje());
    const ehAtual = h.ano === ano && h.mes === mes;
    const ate = ehAtual ? h.dia : dias;
    const maximo = Math.max(1, atual[dias], anterior[diasAnt]);
    const x = (d: number, n: number) => ((d - 1) / Math.max(1, n - 1)) * 320;
    const y = (v: number) => 108 - (v / maximo) * 100;
    const pontos = (acc: number[], n: number, limite: number) =>
      Array.from({ length: limite }, (_, i) => `${x(i + 1, n).toFixed(1)},${y(acc[i + 1]).toFixed(1)}`).join(' ');
    const linhaAtual = pontos(atual, dias, ate);
    let mensagem = '';
    let pior = false;
    const base = anterior[Math.min(ate, diasAnt)];
    if (base > 0 && atual[ate] > 0) {
      const pct = Math.round(((atual[ate] - base) / base) * 100);
      pior = pct > 5;
      const quando = ehAtual ? 'até hoje' : 'no mês';
      mensagem = Math.abs(pct) <= 5 ? `Mesmo ritmo do mês passado ${quando}.` : pct > 0 ? `${pct}% mais rápido que o mês passado ${quando}.` : `${-pct}% mais devagar que o mês passado ${quando}. 👏`;
    }
    return {
      dias,
      nomeAnterior: NOMES_MES[ant.mes - 1].slice(0, 3).toLowerCase(),
      atual: linhaAtual,
      area: `0,108 ${linhaAtual} ${x(ate, dias).toFixed(1)},108`,
      anterior: pontos(anterior, diasAnt, diasAnt),
      ponto: ehAtual ? { x: x(ate, dias), y: y(atual[ate]) } : null,
      mensagem,
      pior,
    };
  });

  /** Nos 10 primeiros dias do mês, convida para a retrospectiva do mês passado (se teve gasto e ainda não foi vista). */
  protected readonly retroPendente = computed(() => {
    const h = lerData(hoje());
    const vendoAtual = this.mes().ano === h.ano && this.mes().mes === h.mes;
    if (!vendoAtual || h.dia > 10 || !this.totalAnterior()) return null;
    const ant = navegarMes(h.ano, h.mes, -1);
    const chave = primeiroDia(ant.ano, ant.mes).slice(0, 7);
    try {
      if (localStorage.getItem(chaveRetrospectivaVista(chave))) return null;
    } catch {
      /* aba anônima: mostra */
    }
    return { chave, nome: NOMES_MES[ant.mes - 1].toLowerCase() };
  });

  protected readonly doMes = computed(() => this.itensMes().filter(ehGasto));
  protected readonly nomeMes = computed(() => NOMES_MES[this.mes().mes - 1]);
  protected readonly mesChave = computed(() => primeiroDia(this.mes().ano, this.mes().mes).slice(0, 7));
  protected readonly titulo = computed(() => `${this.nomeMes().slice(0, 3)} ${this.mes().ano}`);
  protected readonly entradasMes = computed(() => soma(this.itensMes().filter(ehEntrada)));
  protected readonly renda = computed(() => Number(this.config()?.renda_mensal ?? 0) + this.entradasMes());
  protected readonly totalMes = computed(() => soma(this.doMes()));
  protected readonly pagoMes = computed(() => soma(this.doMes().filter((l) => l.pago)));
  protected readonly faltaPagar = computed(() => Math.max(0, this.totalMes() - this.pagoMes()));
  protected readonly totalFuturo = computed(() => soma(this.aVencer()));
  /** Quanto foi para os cofres neste mês (depósitos menos retiradas): sai do "Disponível". */
  protected readonly guardadoMes = computed(() => {
    const chave = this.mesChave();
    const v = this.cofres().flatMap((c) => c.movimentos).filter((m) => m.data.startsWith(chave)).reduce((t, m) => t + m.valor, 0);
    return Math.round(v * 100) / 100;
  });
  protected readonly sobra = computed(() => this.renda() - this.totalMes() - this.guardadoMes());
  protected readonly totalCofres = computed(() => this.cofres().reduce((t, c) => t + c.saldo, 0));
  protected readonly percentual = computed(() => (this.renda() > 0 ? Math.round((this.totalMes() / this.renda()) * 100) : 0));
  protected readonly percentualBarra = computed(() => Math.min(this.percentual(), 100));

  /** Comparação com o mês anterior (só aparece se os dois meses têm gasto). Subir = gastou mais. */
  protected readonly variacao = computed(() => {
    const antes = this.totalAnterior();
    if (!antes || !this.totalMes()) return null;
    const anterior = navegarMes(this.mes().ano, this.mes().mes, -1);
    return { pct: Math.round(((this.totalMes() - antes) / antes) * 100), mes: NOMES_MES[anterior.mes - 1].slice(0, 3).toLowerCase() };
  });

  /** Cartões de crédito com a fatura do mês escolhido e se ela já está toda paga. */
  protected readonly cartoes = computed(() =>
    this.contas()
      .filter((c) => c.tipo === 'credito')
      .map((c) => {
        const itens = this.doMes().filter((l) => l.compra.conta_cartao?.id === c.id);
        return {
          id: c.id, nome: c.nome, vencimento: c.dia_vencimento, fundo: gradienteDoCartao(c.id),
          fatura: soma(itens), paga: itens.length > 0 && itens.every((l) => l.pago),
        };
      }),
  );

  protected readonly porCategoria = computed(() => {
    const limites = new Map(this.categorias().map((c) => [c.nome, c.limite ?? null]));
    const grupos = new Map<string, { nome: string; cor: string; total: number; limite: number | null }>();
    for (const l of this.doMes()) {
      const nome = l.compra.categoria?.nome ?? 'Sem categoria';
      const g = grupos.get(nome) ?? { nome, cor: l.compra.categoria?.cor ?? '#71717a', total: 0, limite: limites.get(nome) ?? null };
      g.total += l.valor;
      grupos.set(nome, g);
    }
    return [...grupos.values()].sort((a, b) => b.total - a.total);
  });

  /** Categorias com limite que já passaram de 80% no mês. */
  protected readonly alertas = computed(() =>
    this.porCategoria()
      .filter((c) => c.limite && c.total >= c.limite * ALERTA_LIMITE)
      .map((c) => ({ ...c, limite: c.limite!, pct: Math.round((c.total / c.limite!) * 100) })),
  );

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
        Promise.all([this.dados.configuracao(), this.dados.contas(), this.dados.categorias(), this.dados.cofres()])
          .then(([c, contas, categorias, cofres]) => {
            this.config.set(c);
            this.contas.set(contas);
            this.categorias.set(categorias);
            this.cofres.set(cofres);
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

  protected curto(v: number) {
    return v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : Math.round(v).toString();
  }

  private async carregarProximos() {
    const h = lerData(hoje());
    const fim = new Date(h.ano, h.mes - 1, h.dia + DIAS_PROXIMOS);
    try {
      const lista = await this.dados.lancamentosPorData(hoje(), formatar(fim.getFullYear(), fim.getMonth() + 1, fim.getDate()));
      this.proximos.set(lista.filter((l) => !l.pago).slice(0, 6));
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
      this.totalAnterior.set(soma(anterior.filter(ehGasto)));
      this.anteriorItens.set(anterior.filter(ehGasto));
      this.itensMes.set(doMes);
      this.aVencer.set(aVencer.filter(ehGasto));
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
