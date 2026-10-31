// Calendário do mês: grade com o total de cada dia e, abaixo, os gastos agrupados por dia, com o detalhe de cada
// parcela ("Geladeira 3/10 — R$ 300,00 → Casas Bahia · Eletrodomésticos"). Usa data_prevista (o dia em que cai).
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { diasNoMes, formatar, lerData } from '../dominio/parcelamento';
import { mensagemDeErro } from '../nucleo/api';
import { IconeCategoria } from '../nucleo/categoria-icone';
import { Dados, LancamentoDetalhado } from '../nucleo/dados';
import { NOMES_MES, hoje, mesAtual, navegarMes, reais } from '../nucleo/formato';
import { Icone } from '../nucleo/icone';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface Dia {
  data: string;
  numero: number;
  total: number;
  cores: string[];
}

@Component({
  selector: 'app-calendario',
  imports: [RouterLink, Icone, IconeCategoria],
  template: `
    <header class="topo">
      <h1>Calendário</h1>
      <div class="seletor-mes">
        <button type="button" (click)="mudarMes(-1)" aria-label="Mês anterior"><app-icone nome="esquerda" /></button>
        <span>{{ titulo() }}</span>
        <button type="button" (click)="mudarMes(1)" aria-label="Próximo mês"><app-icone nome="direita" /></button>
      </div>
    </header>

    @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }

    <section class="cartao">
      <div class="grade">
        @for (s of semana; track $index) { <span class="dia-semana">{{ s[0] }}</span> }
        @for (v of vazios(); track $index) { <span></span> }
        @for (d of dias(); track d.data) {
          <button type="button" class="dia" [class.hoje]="d.data === hoje" [class.selecionado]="d.data === selecionado()"
                  [class.com-gasto]="d.total > 0" (click)="selecionar(d.data)"
                  [attr.aria-label]="d.numero + (d.total ? ', ' + reais(d.total) : '')">
            <span class="numero">{{ d.numero }}</span>
            @if (d.total > 0) {
              <span class="pontos">@for (c of d.cores; track $index) { <i [style.background]="c"></i> }</span>
            }
          </button>
        }
      </div>
      <div class="rodape-grade">
        <span class="suave">{{ lancamentos().length }} lançamento(s)</span>
        <span>Total <strong>{{ reais(totalMes()) }}</strong></span>
      </div>
    </section>

    @if (selecionado()) {
      <div class="filtro-dia">
        Mostrando só o dia {{ lerData(selecionado()!).dia }}
        <button class="link" type="button" (click)="selecionado.set(null)">ver o mês todo</button>
      </div>
    }

    @for (g of grupos(); track g.data) {
      <section class="grupo-dia">
        <h3><span>{{ rotuloDia(g.data) }}</span><span>{{ reais(g.total) }}</span></h3>
        <div class="cartao lista">
          @for (l of g.itens; track l.id) {
            <a class="linha-lancamento" [routerLink]="['/gasto', l.compra.id]">
              <app-icone-categoria [nome]="l.compra.categoria?.nome" [cor]="l.compra.categoria?.cor" />
              <span class="texto">
                <strong>{{ l.compra.descricao }} @if (l.total_parcelas > 1) { <span class="parcela">{{ l.numero }}/{{ l.total_parcelas }}</span> }</strong>
                <small class="suave">
                  @if (l.compra.estabelecimento) { → {{ l.compra.estabelecimento }} · }
                  {{ l.compra.categoria?.nome ?? 'Sem categoria' }}
                  @if (l.compra.conta_cartao) { · {{ l.compra.conta_cartao.nome }} }
                </small>
                @if (l.total_parcelas > 1) { <small class="suave">Total da compra {{ reais(l.compra.valor_total) }}</small> }
              </span>
              <strong class="valor">{{ reais(l.valor) }}</strong>
            </a>
          }
        </div>
      </section>
    } @empty {
      <div class="cartao vazio">
        <p>Nada lançado {{ selecionado() ? 'neste dia' : 'neste mês' }}.</p>
        <a class="botao primario" routerLink="/gasto/novo"><app-icone nome="mais" /> Lançar um gasto</a>
      </div>
    }
  `,
})
export class Calendario {
  private readonly dados = inject(Dados);

  protected readonly reais = reais;
  protected readonly lerData = lerData;
  protected readonly hoje = hoje();
  protected readonly semana = DIAS_SEMANA;
  protected readonly mes = signal(mesAtual());
  protected readonly lancamentos = signal<LancamentoDetalhado[]>([]);
  protected readonly selecionado = signal<string | null>(null);
  protected readonly erro = signal('');
  private pedido = 0;

  protected readonly titulo = computed(() => `${NOMES_MES[this.mes().mes - 1].slice(0, 3)} ${this.mes().ano}`);
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

  protected readonly grupos = computed(() => {
    const dia = this.selecionado();
    const lista = dia ? this.lancamentos().filter((l) => l.data_prevista === dia) : this.lancamentos();
    const mapa = new Map<string, LancamentoDetalhado[]>();
    for (const l of lista) mapa.set(l.data_prevista, [...(mapa.get(l.data_prevista) ?? []), l]);
    return [...mapa].map(([data, itens]) => ({ data, itens, total: itens.reduce((t, l) => t + l.valor, 0) }));
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

  protected rotuloDia(data: string) {
    const { ano, mes, dia } = lerData(data);
    const semana = DIAS_SEMANA[new Date(ano, mes - 1, dia).getDay()];
    return data === this.hoje ? `Hoje, ${dia}` : `${semana}, ${dia} de ${NOMES_MES[mes - 1].toLowerCase()}`;
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
