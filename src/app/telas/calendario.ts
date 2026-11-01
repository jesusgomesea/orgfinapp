// Calendário do mês: grade com o total de cada dia e, abaixo, os gastos agrupados por dia, com o detalhe de cada
// parcela ("Geladeira 3/10 — R$ 300,00 → Casas Bahia · Eletrodomésticos"), fixos e entradas, com o botão de pago.
// Usa data_prevista (o dia em que cai). Entradas aparecem na lista mas não somam nos gastos.
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { diasNoMes, formatar, lerData } from '../dominio/parcelamento';
import { mensagemDeErro } from '../nucleo/api';
import { Dados, LancamentoDetalhado, ehEntrada, ehGasto } from '../nucleo/dados';
import { NOMES_MES, hoje, mesAtual, navegarMes, reais } from '../nucleo/formato';
import { Icone } from '../nucleo/icone';
import { ItemLancamento } from '../nucleo/item-lancamento';
import { DeslizarMes } from '../nucleo/deslizar-mes';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface Dia {
  data: string;
  numero: number;
  total: number;
  cores: string[];
}

@Component({
  selector: 'app-calendario',
  host: { class: 'tela tela-calendario', '[class.carregando]': '!dados.pronto()' },
  imports: [RouterLink, Icone, ItemLancamento, DeslizarMes],
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

    <div class="col-principal">
    <section class="cartao" appDeslizarMes (anterior)="mudarMes(-1)" (proximo)="mudarMes(1)">
      <div class="grade">
        @for (s of semana; track $index) { <span class="dia-semana">{{ s[0] }}</span> }
        @for (v of vazios(); track $index) { <span></span> }
        @for (d of dias(); track d.data) {
          <button type="button" class="dia" [class.hoje]="d.data === hoje" [class.selecionado]="d.data === selecionado()"
                  [class.com-gasto]="d.cores.length > 0" (click)="selecionar(d.data)" [attr.aria-pressed]="d.data === selecionado()"
                  [attr.aria-label]="d.numero + (d.total ? ', ' + reais(d.total) : '')">
            <span class="numero">{{ d.numero }}</span>
            @if (d.cores.length) {
              <span class="pontos">@for (c of d.cores; track $index) { <i [style.background]="c"></i> }</span>
            }
          </button>
        }
      </div>
      <div class="rodape-grade">
        <span class="suave">{{ lancamentos().length }} lançamento(s)</span>
        <span>
          @if (entradasMes() > 0) { <span class="positivo">+ {{ reais(entradasMes()) }}</span> · }
          Gastos <strong>{{ reais(totalMes()) }}</strong>
        </span>
      </div>
    </section>
    </div>

    <div class="col-lateral">
    <label class="busca campo-icone">
      <app-icone nome="busca" />
      <input type="search" [value]="busca()" (input)="busca.set($any($event.target).value)" placeholder="Buscar no mês" aria-label="Buscar no mês" />
    </label>

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
          @for (l of g.itens; track l.chave) { <app-item [item]="l" /> }
        </div>
      </section>
    } @empty {
      <div class="cartao vazio">
        <p>{{ busca() ? 'Nada encontrado para "' + busca() + '".' : 'Nada lançado ' + (selecionado() ? 'neste dia' : 'neste mês') + '.' }}</p>
        @if (!busca()) { <a class="botao primario" routerLink="/gasto/novo"><app-icone nome="mais" /> Lançar um gasto</a> }
      </div>
    }
    </div>
  `,
})
export class Calendario {
  protected readonly dados = inject(Dados);

  /** ?m=AAAA-MM abre direto nesse mês (usado ao salvar um gasto: mostra onde a 1ª parcela caiu). */
  readonly m = input<string>();
  protected readonly busca = signal('');

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
  protected readonly totalMes = computed(() => this.lancamentos().filter(ehGasto).reduce((t, l) => t + l.valor, 0));
  protected readonly entradasMes = computed(() => this.lancamentos().filter(ehEntrada).reduce((t, l) => t + l.valor, 0));

  protected readonly dias = computed<Dia[]>(() => {
    const { ano, mes } = this.mes();
    return Array.from({ length: diasNoMes(ano, mes) }, (_, i) => {
      const data = formatar(ano, mes, i + 1);
      const doDia = this.lancamentos().filter((l) => l.data_prevista === data);
      const cores = [...new Set(doDia.map((l) => l.compra.categoria?.cor ?? '#94a3b8'))].slice(0, 3);
      return { data, numero: i + 1, total: doDia.filter(ehGasto).reduce((t, l) => t + l.valor, 0), cores };
    });
  });

  protected readonly grupos = computed(() => {
    const dia = this.selecionado();
    const termo = semAcento(this.busca());
    const lista = this.lancamentos()
      .filter((l) => !dia || l.data_prevista === dia)
      .filter((l) => !termo || semAcento(`${l.compra.descricao} ${l.compra.estabelecimento ?? ''} ${l.compra.categoria?.nome ?? ''} ${l.compra.conta_cartao?.nome ?? ''}`).includes(termo));
    const mapa = new Map<string, LancamentoDetalhado[]>();
    for (const l of lista) mapa.set(l.data_prevista, [...(mapa.get(l.data_prevista) ?? []), l]);
    return [...mapa].map(([data, itens]) => ({ data, itens, total: itens.filter(ehGasto).reduce((t, l) => t + l.valor, 0) }));
  });

  constructor() {
    effect(() => {
      const m = /^(\d{4})-(\d{2})$/.exec(this.m() ?? '');
      if (m) untracked(() => this.mes.set({ ano: +m[1], mes: +m[2] }));
    });
    // Recarrega quando o mês muda ou os dados mudam (gravação, ou dados novos de outro aparelho).
    effect(() => {
      this.mes();
      this.dados.versao();
      untracked(() => this.carregar());
    });
  }

  protected mudarMes(quantos: number) {
    const { ano, mes } = this.mes();
    this.mes.set(navegarMes(ano, mes, quantos));
    this.selecionado.set(null);
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

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
