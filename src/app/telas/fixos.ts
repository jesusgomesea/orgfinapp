// Fixos e entradas:
//  - Gastos fixos (aluguel, internet, assinaturas): cadastra uma vez, aparecem todo mês no calendário;
//  - Entradas: fixas (todo mês) e avulsas (freela, 13º, reembolso), que somam na renda do mês.
// Cadastro em massa: várias linhas de uma vez, digitadas ou preenchidas pela IA a partir de uma lista colada
// ("aluguel 1800 dia 10, internet 120 dia 15, netflix 55 dia 20").
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { mensagemDeErro } from '../nucleo/api';
import { Avisos } from '../nucleo/avisos';
import { IconeCategoria } from '../nucleo/categoria-icone';
import { Categoria, ContaCartao, Dados, Entrada, Recorrente } from '../nucleo/dados';
import { dataCurta, hoje, reais } from '../nucleo/formato';
import { Ia } from '../nucleo/ia';
import { Icone } from '../nucleo/icone';
import { Privacidade } from '../nucleo/privacidade';

type Aba = 'gastos' | 'entradas';

@Component({
  selector: 'app-fixos',
  host: { class: 'tela tela-fixos', '[class.carregando]': '!dados.pronto()' },
  imports: [FormsModule, Icone, IconeCategoria],
  template: `
    <header class="topo">
      <div><small>Todo mês, sem lançar de novo</small><h1>Fixos e entradas</h1></div>
    </header>

    <div class="segmentos" role="tablist">
      <button type="button" role="tab" [class.ativo]="aba() === 'gastos'" [attr.aria-selected]="aba() === 'gastos'" (click)="aba.set('gastos')">Gastos fixos</button>
      <button type="button" role="tab" [class.ativo]="aba() === 'entradas'" [attr.aria-selected]="aba() === 'entradas'" (click)="aba.set('entradas')">Entradas</button>
    </div>

    @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }

    <div class="col-principal">
      @if (aba() === 'gastos') {
        <section class="cartao lista">
          <div class="linha-texto"><h2>Gastos fixos</h2><strong>{{ priv.mostrar(totalFixos()) }}/mês</strong></div>
          @for (r of gastosFixos(); track r.id) {
            <div class="item-fixo" [class.pausado]="!r.ativo">
              <button type="button" class="item-corpo" (click)="editar(r)" [attr.aria-label]="'Editar ' + r.descricao">
                <app-icone-categoria [nome]="nomeCategoria(r.categoria_id) ?? r.descricao" [cor]="corCategoria(r.categoria_id)" />
                <span class="texto">
                  <strong>{{ r.descricao }}</strong>
                  <small class="suave">dia {{ r.dia }} · {{ nomeCategoria(r.categoria_id) ?? 'Sem categoria' }}{{ nomeConta(r.conta_id) ? ' · ' + nomeConta(r.conta_id) : '' }}{{ r.fim ? ' · até ' + mesCurto(r.fim) : '' }}{{ r.ativo ? '' : ' · pausado' }}</small>
                </span>
                <strong class="valor">{{ priv.mostrar(r.valor) }}</strong>
              </button>
              <button class="icone-botao perigo" type="button" (click)="excluir(r)" [attr.aria-label]="'Excluir ' + r.descricao"><app-icone nome="lixeira" /></button>
            </div>
          } @empty {
            <p class="suave">Nenhum gasto fixo ainda. Cadastre aluguel, internet, assinaturas…</p>
          }
        </section>
      } @else {
        <section class="cartao lista">
          <div class="linha-texto"><h2>Entradas fixas</h2><strong class="positivo">+ {{ priv.mostrar(totalEntradasFixas()) }}/mês</strong></div>
          @for (r of entradasFixas(); track r.id) {
            <div class="item-fixo" [class.pausado]="!r.ativo">
              <button type="button" class="item-corpo" (click)="editar(r)" [attr.aria-label]="'Editar ' + r.descricao">
                <app-icone-categoria nome="Entrada" cor="#cfff04" />
                <span class="texto"><strong>{{ r.descricao }}</strong><small class="suave">dia {{ r.dia }}{{ r.fim ? ' · até ' + mesCurto(r.fim) : '' }}{{ r.ativo ? '' : ' · pausado' }}</small></span>
                <strong class="valor positivo">+ {{ priv.mostrar(r.valor) }}</strong>
              </button>
              <button class="icone-botao perigo" type="button" (click)="excluir(r)" [attr.aria-label]="'Excluir ' + r.descricao"><app-icone nome="lixeira" /></button>
            </div>
          } @empty {
            <p class="suave">Salário extra, aluguel que você recebe, pensão…</p>
          }
        </section>

        <section class="cartao lista">
          <h2>Entradas avulsas</h2>
          @for (e of entradasAvulsas(); track e.id) {
            <div class="item-fixo">
              <button type="button" class="item-corpo" (click)="entrada = { ...e }" [attr.aria-label]="'Editar ' + e.descricao">
                <app-icone-categoria nome="Entrada" cor="#cfff04" />
                <span class="texto"><strong>{{ e.descricao }}</strong><small class="suave">{{ dataCurta(e.data) }}/{{ e.data.slice(0, 4) }}</small></span>
                <strong class="valor positivo">+ {{ priv.mostrar(e.valor) }}</strong>
              </button>
              <button class="icone-botao perigo" type="button" (click)="excluirEntrada(e)" [attr.aria-label]="'Excluir ' + e.descricao"><app-icone nome="lixeira" /></button>
            </div>
          } @empty {
            <p class="suave">Freela, 13º, reembolso, Pix recebido…</p>
          }
          <div class="subform">
            <h3>{{ entrada.id ? 'Editando entrada' : 'Nova entrada avulsa' }}</h3>
            <label>Descrição <input [(ngModel)]="entrada.descricao" placeholder="Freela do site" /></label>
            <div class="linha">
              <label>Valor (R$) <input type="number" inputmode="decimal" step="0.01" min="0.01" [(ngModel)]="entrada.valor" /></label>
              <label>Data <input type="date" [(ngModel)]="entrada.data" /></label>
            </div>
            <div class="linha acoes">
              @if (entrada.id) { <button type="button" class="link" (click)="entrada = entradaVazia()">cancelar</button> }
              <button type="button" class="primario" (click)="salvarEntrada()" [disabled]="!entrada.descricao.trim() || !entrada.valor">Salvar entrada</button>
            </div>
          </div>
        </section>
      }
    </div>

    <div class="col-lateral">
      <section class="cartao">
        <h2><app-icone nome="mais" /> {{ editando() ? 'Editando' : 'Cadastrar' }} {{ aba() === 'gastos' ? 'gastos fixos' : 'entradas fixas' }}</h2>

        @if (!editando()) {
          <div class="compositor">
            <textarea rows="2" [(ngModel)]="lista" class="lista-ia" [placeholder]="aba() === 'gastos' ? 'Ex.: aluguel 1800 dia 10, internet 120 dia 15…' : 'Ex.: aluguel do apto 1200 dia 5…'" aria-label="Lista para a IA"></textarea>
            <button type="button" class="icone-botao enviar" (click)="lerLista()" [disabled]="!lista.trim() || lendo()" aria-label="Preencher com IA"><app-icone nome="brilho" /></button>
          </div>
          @if (lendo()) { <p class="suave">Lendo a lista…</p> }
        }

        @for (l of linhas(); track $index; let i = $index) {
          <div class="linha-massa">
            <div class="linha">
              <label class="largo">Descrição <input [(ngModel)]="l.descricao" placeholder="Aluguel" /></label>
              <label>Valor <input type="number" inputmode="decimal" step="0.01" [(ngModel)]="l.valor" /></label>
              <label class="estreito">Dia <input type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="l.dia" /></label>
            </div>
            @if (aba() === 'gastos') {
              <div class="linha">
                <label>Categoria
                  <select [(ngModel)]="l.categoria_id">
                    <option [ngValue]="null">—</option>
                    @for (c of categorias(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
                  </select>
                </label>
                <label>Pagamento
                  <select [(ngModel)]="l.conta_id">
                    <option [ngValue]="null">—</option>
                    @for (c of contas(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
                  </select>
                </label>
              </div>
            }
            <div class="linha">
              <label>Começa em <input type="month" [(ngModel)]="l.inicio" /></label>
              <label>Termina em (opcional) <input type="month" [(ngModel)]="l.fim" /></label>
            </div>
            <div class="linha acoes">
              @if (editando()) {
                <label class="interruptor"><input type="checkbox" [(ngModel)]="l.ativo" /> ativo</label>
              } @else if (linhas().length > 1) {
                <button type="button" class="link perigo" (click)="removerLinha(i)">remover linha</button>
              }
            </div>
          </div>
        }

        <div class="linha acoes">
          @if (editando()) {
            <button type="button" class="link" (click)="limpar()">cancelar</button>
          } @else {
            <button type="button" (click)="adicionarLinha()"><app-icone nome="mais" /> Linha</button>
          }
          <button type="button" class="primario" (click)="salvarLinhas()" [disabled]="salvando()">
            {{ salvando() ? 'Salvando…' : editando() ? 'Salvar' : linhas().length > 1 ? 'Salvar ' + linhas().length : 'Salvar' }}
          </button>
        </div>
      </section>
    </div>
  `,
})
export class Fixos {
  protected readonly dados = inject(Dados);
  private readonly ia = inject(Ia);
  private readonly avisos = inject(Avisos);
  protected readonly priv = inject(Privacidade);

  protected readonly reais = reais;
  protected readonly dataCurta = dataCurta;
  protected readonly aba = signal<Aba>('gastos');
  protected readonly recorrentes = signal<(Recorrente & { id: number })[]>([]);
  protected readonly entradas = signal<(Entrada & { id: number })[]>([]);
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly contas = signal<ContaCartao[]>([]);
  protected readonly linhas = signal<Recorrente[]>([]);
  protected readonly editando = signal(false);
  protected readonly lendo = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal('');
  protected lista = '';
  protected entrada: Entrada = this.entradaVazia();

  protected readonly gastosFixos = computed(() => this.recorrentes().filter((r) => r.tipo === 'gasto'));
  protected readonly entradasFixas = computed(() => this.recorrentes().filter((r) => r.tipo === 'entrada'));
  protected readonly entradasAvulsas = computed(() => this.entradas().slice(0, 30));
  protected readonly totalFixos = computed(() => this.gastosFixos().filter((r) => r.ativo).reduce((t, r) => t + r.valor, 0));
  protected readonly totalEntradasFixas = computed(() => this.entradasFixas().filter((r) => r.ativo).reduce((t, r) => t + r.valor, 0));

  constructor() {
    effect(() => {
      this.dados.versao();
      untracked(() => this.carregar());
    });
    // Trocou de aba: o formulário passa a ser do outro tipo.
    effect(() => {
      this.aba();
      untracked(() => {
        const pendente = this.edicaoPendente;
        this.edicaoPendente = null;
        if (pendente) this.abrirEdicao(pendente);
        else this.limpar();
      });
    });
  }

  protected nomeCategoria(id: number | null) {
    return this.categorias().find((c) => c.id === id)?.nome ?? null;
  }
  protected corCategoria(id: number | null) {
    return this.categorias().find((c) => c.id === id)?.cor ?? null;
  }
  protected nomeConta(id: number | null) {
    return this.contas().find((c) => c.id === id)?.nome ?? null;
  }
  protected mesCurto(m: string) {
    return `${m.slice(5, 7)}/${m.slice(2, 4)}`;
  }

  protected adicionarLinha() {
    this.linhas.update((l) => [...l, this.linhaVazia()]);
  }
  protected removerLinha(i: number) {
    this.linhas.update((l) => l.filter((_, j) => j !== i));
  }

  protected editar(r: Recorrente & { id: number }) {
    const aba: Aba = r.tipo === 'entrada' ? 'entradas' : 'gastos';
    if (aba === this.aba()) this.abrirEdicao(r);
    else {
      // O efeito da troca de aba abre a edição (em vez de limpar o formulário).
      this.edicaoPendente = r;
      this.aba.set(aba);
    }
  }

  private edicaoPendente: (Recorrente & { id: number }) | null = null;

  private abrirEdicao(r: Recorrente & { id: number }) {
    this.linhas.set([{ ...r }]);
    this.editando.set(true);
    document.querySelector('.tela-fixos .col-lateral')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected limpar() {
    this.linhas.set([this.linhaVazia()]);
    this.editando.set(false);
    this.lista = '';
  }

  protected async lerLista() {
    this.lendo.set(true);
    this.erro.set('');
    try {
      const itens = await this.ia.interpretarLista(this.lista, this.aba() === 'gastos' ? 'gasto' : 'entrada', this.categorias().map((c) => c.nome), this.contas().map((c) => c.nome));
      if (!itens.length) throw new Error('Não encontrei itens nessa lista. Tente "nome valor dia X", um por linha.');
      const porNome = <T extends { nome: string }>(lista: T[], nome: string | null) => lista.find((x) => limpar(x.nome) === limpar(nome ?? ''));
      // Linhas que a pessoa já tinha preenchido continuam; as da IA entram depois.
      const preenchidas = this.linhas().filter((l) => l.descricao.trim());
      this.linhas.set([
        ...preenchidas,
        ...itens.map((i) => ({
          ...this.linhaVazia(),
          descricao: i.descricao ?? '',
          valor: i.valor ?? (null as unknown as number),
          dia: i.dia ?? 1,
          categoria_id: porNome(this.categorias(), i.categoria)?.id ?? null,
          conta_id: porNome(this.contas(), i.conta)?.id ?? null,
        })),
      ]);
      this.lista = '';
      this.avisos.mostrar(`${itens.length} ${itens.length === 1 ? 'item preenchido' : 'itens preenchidos'}: confira e salve`);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.lendo.set(false);
    }
  }

  protected async salvarLinhas() {
    const validas = this.linhas().filter((l) => l.descricao.trim() || l.valor);
    if (!validas.length) return this.erro.set('Preencha pelo menos uma linha.');
    this.salvando.set(true);
    this.erro.set('');
    try {
      await this.dados.salvarRecorrentes(validas.map((l) => ({ ...l, valor: Number(l.valor), dia: Number(l.dia), fim: l.fim || null })));
      this.avisos.mostrar(this.editando() ? 'Fixo atualizado' : `${validas.length} ${validas.length === 1 ? 'fixo salvo' : 'fixos salvos'}`);
      this.limpar();
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async excluir(r: Recorrente & { id: number }) {
    if (!confirm(`Excluir "${r.descricao}"? Ele some de todos os meses. Para só parar a partir de agora, edite e coloque "Termina em".`)) return;
    try {
      await this.dados.excluirRecorrente(r.id);
      const { id: _, ...semId } = r;
      this.avisos.mostrar('Fixo excluído', 'ok', 6000, { rotulo: 'Desfazer', executar: () => this.dados.salvarRecorrentes([semId]) });
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected async salvarEntrada() {
    try {
      await this.dados.salvarEntrada({ ...this.entrada, valor: Number(this.entrada.valor) });
      this.avisos.mostrar('Entrada salva');
      this.entrada = this.entradaVazia();
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected async excluirEntrada(e: Entrada & { id: number }) {
    if (!confirm(`Excluir a entrada "${e.descricao}"?`)) return;
    try {
      await this.dados.excluirEntrada(e.id);
      const { id: _, ...semId } = e;
      this.avisos.mostrar('Entrada excluída', 'ok', 6000, { rotulo: 'Desfazer', executar: () => this.dados.salvarEntrada(semId) });
    } catch (err) {
      this.erro.set(mensagemDeErro(err));
    }
  }

  protected entradaVazia(): Entrada {
    return { descricao: '', valor: null as unknown as number, data: hoje() };
  }

  private linhaVazia(): Recorrente {
    return {
      tipo: this.aba() === 'entradas' ? 'entrada' : 'gasto',
      descricao: '', estabelecimento: '', valor: null as unknown as number, dia: 10,
      inicio: hoje().slice(0, 7), fim: null, categoria_id: null, conta_id: null, ativo: true,
    };
  }

  private async carregar() {
    try {
      const [r, e, cats, contas] = await Promise.all([this.dados.recorrentes(), this.dados.entradas(), this.dados.categorias(), this.dados.contas()]);
      this.recorrentes.set(r);
      this.entradas.set(e);
      this.categorias.set(cats);
      this.contas.set(contas);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}

function limpar(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
