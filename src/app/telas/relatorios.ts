// Relatórios do ano: gastos × renda mês a mês, categorias do ano, evolução dos cofres (quanto tinha guardado ao
// fim de cada mês), maiores gastos e exportação para Excel (CSV com ; e vírgula decimal, que o Excel em português
// abre direto). Tudo calculado no app a partir dos mesmos itens do calendário.
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { mensagemDeErro } from '../nucleo/api';
import { IconeCategoria } from '../nucleo/categoria-icone';
import { CofreResumo, Configuracao, Dados, LancamentoDetalhado, ehEntrada, ehGasto } from '../nucleo/dados';
import { NOMES_MES, dataCurta, hoje, mesAtual, reais } from '../nucleo/formato';
import { Icone } from '../nucleo/icone';
import { Privacidade } from '../nucleo/privacidade';

const LARG = 320;
const ALT = 140;

@Component({
  selector: 'app-relatorios',
  host: { class: 'tela tela-relatorios' },
  imports: [Icone, IconeCategoria],
  template: `
    <header class="topo">
      <div><small>Visão do ano</small><h1>Relatórios</h1></div>
      <div class="seletor-mes">
        <button type="button" (click)="ano.set(ano() - 1)" aria-label="Ano anterior"><app-icone nome="esquerda" /></button>
        <span>{{ ano() }}</span>
        <button type="button" (click)="ano.set(ano() + 1)" aria-label="Próximo ano"><app-icone nome="direita" /></button>
      </div>
    </header>

    @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }

    <div class="col-principal">
      <div class="numeros-ano">
        <div class="cartao"><small class="suave">Gasto no ano</small><strong>{{ priv.mostrar(totalGastos()) }}</strong><small class="suave">média {{ priv.mostrar(mediaMensal()) }}/mês{{ ano() >= anoAtual ? ' · inclui o previsto' : '' }}</small></div>
        <div class="cartao"><small class="suave">Renda + entradas</small><strong class="positivo">{{ priv.mostrar(totalRenda()) }}</strong><small class="suave">{{ priv.mostrar(totalEntradas()) }} de entradas extras</small></div>
        <div class="cartao"><small class="suave">Guardado no ano</small><strong>{{ priv.mostrar(guardadoAno()) }}</strong><small class="suave">{{ priv.mostrar(totalCofres()) }} nos cofres hoje</small></div>
        <div class="cartao"><small class="suave">Sobrou no ano</small><strong [class.negativo]="sobra() < 0">{{ priv.mostrar(sobra()) }}</strong><small class="suave">renda − gastos − guardado</small></div>
      </div>

      <section class="cartao">
        <div class="linha-texto"><h2>Mês a mês</h2><span class="legenda-mini"><i class="lg-gasto"></i>gastos <i class="lg-renda"></i>renda</span></div>
        <svg class="grafico-barras" [attr.viewBox]="'0 0 ' + larg + ' ' + (alt + 18)" role="img" [attr.aria-label]="'Gastos e renda por mês em ' + ano()">
          @for (m of meses(); track m.indice; let i = $index) {
            <rect class="b-renda" [attr.x]="i * passo + 3" [attr.y]="alt - altura(m.renda)" [attr.width]="passo / 2 - 3" [attr.height]="altura(m.renda)" rx="3"><title>{{ m.nome }}: renda {{ reais(m.renda) }}</title></rect>
            <rect class="b-gasto" [class.acima]="m.gastos > m.renda && m.renda > 0" [attr.x]="i * passo + passo / 2" [attr.y]="alt - altura(m.gastos)" [attr.width]="passo / 2 - 3" [attr.height]="altura(m.gastos)" rx="3"><title>{{ m.nome }}: gastos {{ reais(m.gastos) }}</title></rect>
            <text [attr.x]="i * passo + passo / 2" [attr.y]="alt + 14" text-anchor="middle">{{ m.nome.slice(0, 1) }}</text>
          }
        </svg>
      </section>

      <section class="cartao">
        <h2><app-icone nome="cofre" /> Cofres no ano</h2>
        @if (cofres().length) {
          <svg class="grafico-linhas" [attr.viewBox]="'0 0 ' + larg + ' ' + (alt + 18)" role="img" aria-label="Evolução dos cofres">
            @for (c of linhasCofres(); track c.id) {
              <polyline [attr.points]="c.pontos" fill="none" [attr.stroke]="c.cor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
            }
            @for (m of meses(); track m.indice; let i = $index) {
              <text [attr.x]="i * passo + passo / 2" [attr.y]="alt + 14" text-anchor="middle">{{ m.nome.slice(0, 1) }}</text>
            }
          </svg>
          @for (c of cofres(); track c.id) {
            <div class="cofre-mini">
              <span class="nome"><span class="bolinha" [style.background]="c.cor"></span>{{ c.nome }}</span>
              <span>{{ priv.mostrar(c.saldo) }}@if (c.meta_valor) { <small class="suave"> / {{ priv.mostrar(c.meta_valor) }}</small> }</span>
              @if (c.meta_valor) { <span class="barra fina"><span [style.width.%]="min(100, (c.saldo / c.meta_valor) * 100)" [style.background]="c.cor"></span></span> }
              <small class="suave">+ {{ priv.mostrar(guardadoNoAno(c)) }} guardados em {{ ano() }}</small>
            </div>
          }
        } @else {
          <p class="suave">Crie um cofre em Cofres para acompanhar sua poupança aqui.</p>
        }
      </section>
    </div>

    <div class="col-lateral">
      <section class="cartao">
        <h2>Categorias em {{ ano() }}</h2>
        @for (c of categorias(); track c.nome) {
          <div class="barra-categoria">
            <app-icone-categoria [nome]="c.nome" [cor]="c.cor" />
            <span class="nome">{{ c.nome }}<span class="barra fina"><span [style.width.%]="(c.total / maiorCategoria()) * 100" [style.background]="c.cor"></span></span></span>
            <span class="direita"><strong>{{ priv.mostrar(c.total) }}</strong><small class="suave">{{ pct(c.total) }}%</small></span>
          </div>
        } @empty { <p class="suave">Sem gastos em {{ ano() }}.</p> }
      </section>

      <section class="cartao">
        <h2>Maiores gastos</h2>
        @for (g of maiores(); track g.chave) {
          <div class="item">
            <div><strong>{{ g.descricao }}</strong><small class="suave">{{ g.quando }} · {{ g.categoria }}</small></div>
            <strong>{{ priv.mostrar(g.valor) }}</strong>
          </div>
        } @empty { <p class="suave">Nada ainda.</p> }
      </section>

      <section class="cartao">
        <h2><app-icone nome="baixar" /> Exportar</h2>
        <p class="suave">Arquivo que abre no Excel ou no Google Planilhas.</p>
        <div class="linha">
          <button type="button" (click)="exportarItens()"><app-icone nome="baixar" /> Lançamentos {{ ano() }}</button>
          <button type="button" (click)="exportarCofres()" [disabled]="!cofres().length"><app-icone nome="baixar" /> Cofres</button>
        </div>
      </section>
    </div>
  `,
})
export class Relatorios {
  private readonly dados = inject(Dados);
  protected readonly priv = inject(Privacidade);

  protected readonly reais = reais;
  protected readonly min = Math.min;
  protected readonly larg = LARG;
  protected readonly alt = ALT;
  protected readonly passo = LARG / 12;
  protected readonly ano = signal(mesAtual().ano);
  protected readonly itens = signal<LancamentoDetalhado[]>([]);
  protected readonly cofres = signal<CofreResumo[]>([]);
  protected readonly config = signal<Configuracao | null>(null);
  protected readonly erro = signal('');

  /** O ano inteiro, incluindo o que já está previsto (parcelas, fixos) até dezembro — por isso o salário conta 12 vezes. */
  private readonly mesesComSalario = computed(() => 12);
  protected readonly anoAtual = mesAtual().ano;

  protected readonly meses = computed(() => {
    const salario = Number(this.config()?.renda_mensal ?? 0);
    return NOMES_MES.map((nome, i) => {
      const comp = `${this.ano()}-${String(i + 1).padStart(2, '0')}-01`;
      const doMes = this.itens().filter((l) => l.competencia === comp);
      const gastos = soma(doMes.filter(ehGasto));
      const entradas = soma(doMes.filter(ehEntrada));
      return { indice: i, nome, gastos, entradas, renda: salario + entradas };
    });
  });
  private readonly maiorValor = computed(() => Math.max(1, ...this.meses().flatMap((m) => [m.gastos, m.renda])));
  protected readonly totalGastos = computed(() => soma(this.itens().filter(ehGasto)));
  protected readonly totalEntradas = computed(() => soma(this.itens().filter(ehEntrada)));
  protected readonly totalRenda = computed(() => Number(this.config()?.renda_mensal ?? 0) * this.mesesComSalario() + this.totalEntradas());
  protected readonly mediaMensal = computed(() => {
    const comGasto = this.meses().filter((m) => m.gastos > 0).length;
    return comGasto ? this.totalGastos() / comGasto : 0;
  });
  protected readonly totalCofres = computed(() => this.cofres().reduce((t, c) => t + c.saldo, 0));
  protected readonly guardadoAno = computed(() => this.cofres().reduce((t, c) => t + this.guardadoNoAno(c), 0));
  protected readonly sobra = computed(() => this.totalRenda() - this.totalGastos() - this.guardadoAno());

  protected readonly categorias = computed(() => {
    const grupos = new Map<string, { nome: string; cor: string; total: number }>();
    for (const l of this.itens().filter(ehGasto)) {
      const nome = l.compra.categoria?.nome ?? 'Sem categoria';
      const g = grupos.get(nome) ?? { nome, cor: l.compra.categoria?.cor ?? '#71717a', total: 0 };
      g.total += l.valor;
      grupos.set(nome, g);
    }
    return [...grupos.values()].sort((a, b) => b.total - a.total);
  });
  protected readonly maiorCategoria = computed(() => Math.max(1, ...this.categorias().map((c) => c.total)));

  /** Maiores compras do ano pelo valor total (não pela parcela) e fixos pelo total do ano. */
  protected readonly maiores = computed(() => {
    const porCompra = new Map<string, { chave: string; descricao: string; valor: number; quando: string; categoria: string }>();
    for (const l of this.itens().filter(ehGasto)) {
      const chave = l.tipo === 'compra' ? `c${l.compra.id}` : `f${l.id}`;
      const atual = porCompra.get(chave);
      if (atual) {
        if (l.tipo === 'fixo') atual.valor += l.valor;
        continue;
      }
      porCompra.set(chave, {
        chave,
        descricao: l.compra.descricao + (l.total_parcelas > 1 ? ` (${l.total_parcelas}x)` : l.tipo === 'fixo' ? ' (fixo, no ano)' : ''),
        valor: l.tipo === 'compra' ? l.compra.valor_total : l.valor,
        quando: dataCurta(l.data_prevista),
        categoria: l.compra.categoria?.nome ?? 'Sem categoria',
      });
    }
    return [...porCompra.values()].sort((a, b) => b.valor - a.valor).slice(0, 8);
  });

  /** Saldo de cada cofre ao fim de cada mês do ano, como pontos de uma linha. */
  protected readonly linhasCofres = computed(() => {
    const maximo = Math.max(1, ...this.cofres().flatMap((c) => this.saldosMensais(c)));
    return this.cofres().map((c) => ({
      id: c.id,
      cor: c.cor,
      pontos: this.saldosMensais(c).map((s, i) => `${i * this.passo + this.passo / 2},${ALT - (s / maximo) * (ALT - 8)}`).join(' '),
    }));
  });

  constructor() {
    effect(() => {
      this.ano();
      this.dados.versao();
      untracked(() => this.carregar());
    });
  }

  protected altura(v: number) {
    return (v / this.maiorValor()) * (ALT - 6);
  }

  protected pct(v: number) {
    return this.totalGastos() ? Math.round((v / this.totalGastos()) * 100) : 0;
  }

  protected guardadoNoAno(c: CofreResumo) {
    return c.movimentos.filter((m) => m.data.startsWith(String(this.ano()))).reduce((t, m) => t + m.valor, 0);
  }

  private saldosMensais(c: CofreResumo): number[] {
    return Array.from({ length: 12 }, (_, i) => {
      const ate = `${this.ano()}-${String(i + 1).padStart(2, '0')}-31`;
      return c.movimentos.filter((m) => m.data <= ate).reduce((t, m) => t + m.valor, 0);
    });
  }

  protected exportarItens() {
    const linhas = [['Data', 'Mês', 'Tipo', 'Descrição', 'Para onde', 'Categoria', 'Pagamento', 'Parcela', 'Valor', 'Pago em']];
    for (const l of this.itens()) {
      linhas.push([
        dataBr(l.data_prevista), l.competencia.slice(0, 7), l.entra ? 'Entrada' : l.tipo === 'fixo' ? 'Gasto fixo' : 'Gasto',
        l.compra.descricao, l.compra.estabelecimento ?? '', l.entra ? '' : l.compra.categoria?.nome ?? '', l.compra.conta_cartao?.nome ?? '',
        l.total_parcelas > 1 ? `${l.numero}/${l.total_parcelas}` : '', numeroBr(l.entra ? l.valor : -l.valor), l.pago ? dataBr(l.pago) : '',
      ]);
    }
    baixarCsv(`orgfin-${this.ano()}.csv`, linhas);
  }

  protected exportarCofres() {
    const linhas = [['Cofre', 'Data', 'Valor', 'Observação']];
    for (const c of this.cofres()) for (const m of [...c.movimentos].reverse()) linhas.push([c.nome, dataBr(m.data), numeroBr(m.valor), m.nota]);
    baixarCsv(`orgfin-cofres-${hoje()}.csv`, linhas);
  }

  private async carregar() {
    const ano = this.ano();
    try {
      const [itens, cofres, config] = await Promise.all([
        this.dados.lancamentosPorCompetencia(`${ano}-01-01`, `${ano}-12-01`),
        this.dados.cofres(),
        this.dados.configuracao(),
      ]);
      if (ano !== this.ano()) return;
      this.itens.set(itens);
      this.cofres.set(cofres);
      this.config.set(config);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}

function soma(l: LancamentoDetalhado[]) {
  return Math.round(l.reduce((t, x) => t + x.valor, 0) * 100) / 100;
}

function dataBr(d: string) {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

function numeroBr(v: number) {
  return v.toFixed(2).replace('.', ',');
}

/** CSV no formato do Excel brasileiro: ; separa colunas, BOM para os acentos aparecerem certos. */
function baixarCsv(nome: string, linhas: string[][]) {
  const texto = linhas.map((l) => l.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
