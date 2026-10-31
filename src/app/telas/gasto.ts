// Novo gasto / editar gasto. Duas formas de preencher:
//  1) frase livre (digitada ou falada) → Gemini sugere os campos → a pessoa confere;
//  2) formulário manual (sempre disponível, inclusive sem internet para a IA).
// Antes de gravar mostra a prévia das parcelas, exatamente como vão aparecer no calendário.
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Parcela } from '../dominio/parcelamento';
import { Categoria, CompraForm, ContaCartao, Dados } from '../nucleo/dados';
import { dataCurta, hoje, nomeMesCurto, reais } from '../nucleo/formato';
import { Ia, SugestaoGasto } from '../nucleo/ia';
import { mensagemDeErro } from '../nucleo/supabase';

// Reconhecimento de voz do navegador (Chrome/Android e Safari). Onde não existir, o ditado do teclado resolve.
type Reconhecedor = { lang: string; interimResults: boolean; start(): void; onresult: (e: any) => void; onerror: () => void; onend: () => void };
const ReconhecimentoDeVoz: (new () => Reconhecedor) | undefined =
  (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;

@Component({
  selector: 'app-gasto',
  imports: [FormsModule],
  template: `
    <header class="topo">
      <button class="seta" (click)="voltar()" aria-label="Voltar">‹</button>
      <h1>{{ editando() ? 'Editar gasto' : 'Novo gasto' }}</h1>
      <span class="seta"></span>
    </header>

    @if (!editando()) {
      <section class="cartao destaque">
        <label>
          Conte o gasto do seu jeito
          <textarea rows="2" [(ngModel)]="frase" name="frase"
                    placeholder="Ex.: geladeira 3 mil em 10x no Nubank, Casas Bahia"></textarea>
        </label>
        <div class="linha acoes">
          @if (temVoz) {
            <button type="button" (click)="ouvir()" [disabled]="ouvindo()">{{ ouvindo() ? 'Ouvindo…' : '🎤 Falar' }}</button>
          }
          <button type="button" class="primario" (click)="interpretar()" [disabled]="!frase.trim() || lendo()">
            {{ lendo() ? 'Lendo…' : '✨ Preencher com IA' }}
          </button>
        </div>
        @if (avisoIa()) { <p class="aviso">{{ avisoIa() }}</p> }
      </section>
    }

    <form class="cartao" (ngSubmit)="salvar()">
      <label>O que foi <input name="descricao" [(ngModel)]="form.descricao" required placeholder="Geladeira" /></label>
      <label>Para onde (loja, pessoa…) <input name="estabelecimento" [(ngModel)]="form.estabelecimento" placeholder="Casas Bahia" /></label>
      <div class="linha">
        <label>Valor total (R$) <input name="valor" type="number" inputmode="decimal" step="0.01" min="0.01" [(ngModel)]="form.valor_total" required /></label>
        <label>Parcelas <input name="parcelas" type="number" inputmode="numeric" min="1" max="120" [(ngModel)]="form.parcelas" required /></label>
      </div>
      <div class="linha">
        <label>Data da compra <input name="data" type="date" [(ngModel)]="form.data_compra" required /></label>
        <label>Pagamento
          <select name="conta" [(ngModel)]="form.conta_id">
            <option [ngValue]="null">—</option>
            @for (c of contas(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
          </select>
        </label>
      </div>
      <label>Categoria
        <select name="categoria" [(ngModel)]="form.categoria_id">
          <option [ngValue]="null">Sem categoria</option>
          @for (c of categorias(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
        </select>
      </label>

      @if (previa(); as p) {
        @if (p.length) {
          <div class="previa">
            <strong>{{ p.length === 1 ? 'Vai aparecer em' : p.length + ' parcelas' }}</strong>
            <ul>
              @for (x of p.slice(0, 6); track x.numero) {
                <li>
                  <span>{{ p.length > 1 ? x.numero + '/' + p.length + ' · ' : '' }}{{ nomeMesCurto(x.competencia) }} ({{ dataCurta(x.data_prevista) }})</span>
                  <strong>{{ reais(x.valor) }}</strong>
                </li>
              }
              @if (p.length > 6) { <li class="suave">… até {{ nomeMesCurto(p[p.length - 1].competencia) }}</li> }
            </ul>
          </div>
        }
      }

      @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }

      <button class="primario largo" type="submit" [disabled]="salvando()">{{ salvando() ? 'Salvando…' : 'Salvar' }}</button>
      @if (editando()) {
        <button class="link perigo" type="button" (click)="excluir()">Excluir este gasto (e todas as parcelas)</button>
      }
    </form>
  `,
})
export class Gasto implements OnInit {
  private readonly dados = inject(Dados);
  private readonly ia = inject(Ia);
  private readonly router = inject(Router);

  /** Vem da rota /gasto/:id ("novo" = criar). */
  readonly id = input<string>();

  protected readonly reais = reais;
  protected readonly dataCurta = dataCurta;
  protected readonly nomeMesCurto = nomeMesCurto;
  protected readonly temVoz = !!ReconhecimentoDeVoz;
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly contas = signal<ContaCartao[]>([]);
  protected readonly editando = signal(false);
  protected readonly lendo = signal(false);
  protected readonly ouvindo = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal('');
  protected readonly avisoIa = signal('');
  protected frase = '';
  protected form: CompraForm = {
    descricao: '', estabelecimento: '', valor_total: null as unknown as number, parcelas: 1,
    data_compra: hoje(), categoria_id: null, conta_id: null, origem: 'manual',
  };

  async ngOnInit() {
    try {
      const [cats, contas] = await Promise.all([this.dados.categorias(), this.dados.contas()]);
      this.categorias.set(cats);
      this.contas.set(contas);
      const id = Number(this.id());
      if (id) {
        const compra = await this.dados.compra(id);
        if (compra) {
          this.form = compra;
          this.editando.set(true);
        }
      }
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  /** Recalculada a cada mudança do formulário; vazia enquanto os campos não fecham. */
  protected previa(): Parcela[] {
    try {
      if (!this.form.valor_total || !this.form.data_compra) return [];
      return this.dados.previaParcelas({ ...this.form, valor_total: Number(this.form.valor_total), parcelas: Number(this.form.parcelas) }, this.contas());
    } catch {
      return [];
    }
  }

  protected ouvir() {
    if (!ReconhecimentoDeVoz) return;
    const r = new ReconhecimentoDeVoz();
    r.lang = 'pt-BR';
    r.interimResults = false;
    r.onresult = (e) => (this.frase = (this.frase ? this.frase + ' ' : '') + e.results[0][0].transcript);
    r.onerror = () => this.avisoIa.set('Não consegui ouvir. Tente de novo ou use o microfone do teclado.');
    r.onend = () => this.ouvindo.set(false);
    this.ouvindo.set(true);
    r.start();
  }

  protected async interpretar() {
    this.avisoIa.set('');
    this.lendo.set(true);
    try {
      const s = await this.ia.interpretar(this.frase, this.categorias().map((c) => c.nome), this.contas().map((c) => c.nome));
      this.aplicar(s);
    } catch (e) {
      this.avisoIa.set(mensagemDeErro(e));
    } finally {
      this.lendo.set(false);
    }
  }

  protected async salvar() {
    this.erro.set('');
    const compra: CompraForm = { ...this.form, valor_total: Number(this.form.valor_total), parcelas: Number(this.form.parcelas) };
    if (!compra.descricao?.trim()) return this.erro.set('Diga o que foi comprado.');
    if (!(compra.valor_total > 0)) return this.erro.set('Informe o valor total.');
    this.salvando.set(true);
    try {
      await this.dados.salvarCompra(compra, this.contas());
      await this.router.navigateByUrl('/calendario');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async excluir() {
    if (!this.form.id || !confirm('Excluir este gasto e todas as parcelas dele?')) return;
    try {
      await this.dados.excluirCompra(this.form.id);
      await this.router.navigateByUrl('/calendario');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected voltar() {
    history.length > 1 ? history.back() : this.router.navigateByUrl('/painel');
  }

  /** Copia a sugestão da IA para o formulário. Nome de categoria/cartão é casado sem acento e sem maiúscula. */
  private aplicar(s: SugestaoGasto) {
    const categoria = acharPorNome(this.categorias(), s.categoria);
    const conta = acharPorNome(this.contas(), s.conta);
    this.form = {
      ...this.form,
      descricao: s.descricao ?? this.form.descricao,
      estabelecimento: s.estabelecimento ?? this.form.estabelecimento,
      valor_total: s.valor_total ?? this.form.valor_total,
      parcelas: s.parcelas ?? 1,
      data_compra: s.data_compra ?? this.form.data_compra,
      categoria_id: categoria?.id ?? this.form.categoria_id,
      conta_id: conta?.id ?? this.form.conta_id,
      origem: 'ia',
    };
    const avisos = ['Confira os campos abaixo antes de salvar.'];
    if (s.categoria && !categoria) avisos.push(`Categoria "${s.categoria}" não está cadastrada.`);
    if (s.conta && !conta) avisos.push(`Forma de pagamento "${s.conta}" não está cadastrada.`);
    if (s.observacao) avisos.push(s.observacao);
    this.avisoIa.set(avisos.join(' '));
  }
}

function acharPorNome<T extends { nome: string }>(lista: T[], nome: string | null): T | undefined {
  if (!nome) return undefined;
  const limpar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return lista.find((x) => limpar(x.nome) === limpar(nome));
}
