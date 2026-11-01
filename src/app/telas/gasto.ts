// Novo gasto / editar gasto. Duas formas de preencher:
//  1) frase livre (digitada ou falada) → Gemini sugere os campos → a pessoa confere;
//  2) formulário manual (sempre disponível, inclusive se a IA estiver fora).
// Antes de gravar mostra a prévia das parcelas, exatamente como vão aparecer no calendário
// (o servidor recalcula com a mesma regra ao salvar).
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Parcela } from '../dominio/parcelamento';
import { mensagemDeErro } from '../nucleo/api';
import { Categoria, CompraForm, ContaCartao, Dados } from '../nucleo/dados';
import { dataCurta, hoje, nomeMesCurto, reais } from '../nucleo/formato';
import { Avisos } from '../nucleo/avisos';
import { Foto, Ia, SugestaoGasto, prepararFoto } from '../nucleo/ia';
import { vibrar } from '../nucleo/efeitos';
import { Icone } from '../nucleo/icone';

// Reconhecimento de voz do navegador (Chrome/Android e Safari). Onde não existir, o ditado do teclado resolve.
type Reconhecedor = { lang: string; interimResults: boolean; start(): void; onresult: (e: any) => void; onerror: () => void; onend: () => void };
const ReconhecimentoDeVoz: (new () => Reconhecedor) | undefined =
  (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;

const EXEMPLOS = ['mercado 230 no pix', 'geladeira 3 mil em 10x no cartão', 'uber 27 ontem'];
const PARCELAS_RAPIDAS = [1, 2, 3, 6, 10, 12];

@Component({
  selector: 'app-gasto',
  host: { class: 'tela tela-gasto' },
  imports: [FormsModule, Icone],
  template: `
    <header class="topo">
      <button class="icone-botao" type="button" (click)="voltar()" aria-label="Voltar"><app-icone nome="esquerda" /></button>
      <h1>{{ editando() ? 'Editar gasto' : 'Novo gasto' }}</h1>
      <span class="icone-botao"></span>
    </header>

    <div class="col-principal">
    @if (!editando()) {
      <div class="conversa" aria-live="polite">
        @for (m of mensagens(); track $index) {
          <div class="balao" [class.app]="m.de !== 'voce'" [class.voce]="m.de === 'voce'" [class.aviso-ia]="m.de === 'aviso'">
            @if (m.foto) { <img class="balao-foto" [src]="m.foto" alt="Foto do comprovante" /> }
            {{ m.texto }}
          </div>
        }
        @if (lendo()) { <div class="balao app digitando" aria-label="Lendo"><i></i><i></i><i></i></div> }
      </div>

      <div class="compositor">
        <textarea rows="1" [(ngModel)]="frase" name="frase" placeholder="O que você gastou?"
                  (keydown.enter)="enviarFrase($event)" aria-label="Descreva o gasto"></textarea>
        <label class="icone-botao" title="Foto do comprovante" aria-label="Enviar foto do comprovante">
          <app-icone nome="camera" />
          <input type="file" accept="image/*" hidden (change)="enviarFoto($event)" />
        </label>
        @if (temVoz) {
          <button type="button" class="icone-botao" (click)="ouvir()" [class.gravando]="ouvindo()" aria-label="Falar">
            <app-icone nome="microfone" />
          </button>
        }
        <button type="button" class="icone-botao enviar" (click)="interpretar()" [disabled]="!frase.trim() || lendo()" aria-label="Enviar para a IA">
          <app-icone nome="brilho" />
        </button>
      </div>
      @if (mensagens().length === 1) {
        <div class="fichas exemplos">
          @for (e of exemplos; track e) { <button type="button" class="ficha" (click)="frase = e">{{ e }}</button> }
        </div>
      }
    } @else {
      <p class="suave">Editar refaz todas as parcelas desta compra.</p>
    }
    </div>

    <form class="cartao col-lateral" (ngSubmit)="salvar()">
      <label class="campo-valor">
        Valor total
        <span><small>R$</small><input name="valor" type="number" inputmode="decimal" step="0.01" min="0.01" [(ngModel)]="form.valor_total" required placeholder="0,00" /></span>
      </label>

      <label>O que foi <input name="descricao" [(ngModel)]="form.descricao" required placeholder="Geladeira" /></label>
      <label>Para onde (loja, pessoa…) <input name="estabelecimento" [(ngModel)]="form.estabelecimento" placeholder="Casas Bahia" /></label>

      <div class="rotulo">Parcelas</div>
      <div class="fichas">
        @for (p of parcelasRapidas; track p) {
          <button type="button" class="ficha" [class.marcada]="+form.parcelas === p" (click)="form.parcelas = p">{{ p === 1 ? 'À vista' : p + 'x' }}</button>
        }
        <input class="parcelas-outra" name="parcelas" type="number" inputmode="numeric" min="1" max="120" [(ngModel)]="form.parcelas" aria-label="Outro número de parcelas" />
      </div>

      <div class="linha">
        <label>Data <input name="data" type="date" [(ngModel)]="form.data_compra" required /></label>
        <label>Pagamento
          <select name="conta" [(ngModel)]="form.conta_id">
            <option [ngValue]="null">—</option>
            @for (c of contas(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
          </select>
        </label>
      </div>

      <div class="primeira-parcela">
        <label>
          {{ +form.parcelas > 1 ? '1ª parcela vence em' : 'Vence / conta em' }}
          <input name="primeira" type="date" [(ngModel)]="form.primeira_parcela" />
        </label>
        <small class="suave">
          @if (form.primeira_parcela) {
            Data escolhida por você.
            <button type="button" class="link" (click)="form.primeira_parcela = null">usar a automática</button>
          } @else if (automatica(); as a) {
            Automática: {{ dataCurta(a) }} ({{ motivoAutomatica() }}). Mude se a loja ou o boleto disser outra data.
          } @else {
            Vazio = calcula pela forma de pagamento.
          }
        </small>
      </div>

      <div class="rotulo">Categoria</div>
      <div class="fichas">
        @for (c of categorias(); track c.id) {
          <button type="button" class="ficha" [class.marcada]="form.categoria_id === c.id" (click)="form.categoria_id = form.categoria_id === c.id ? null : c.id">
            <span class="bolinha" [style.background]="c.cor"></span>{{ c.nome }}
          </button>
        }
      </div>

      @if (previa(); as p) {
        @if (p.length) {
          <div class="previa">
            <strong>{{ p.length === 1 ? 'Vai aparecer em' : p.length + ' parcelas de ' + reais(p[p.length - 1].valor) }}</strong>
            <ol>
              @for (x of p.slice(0, 6); track x.numero) {
                <li>
                  <span>{{ p.length > 1 ? x.numero + 'ª · ' : '' }}{{ nomeMesCurto(x.competencia) }} <small>({{ dataCurta(x.data_prevista) }})</small></span>
                  <strong>{{ reais(x.valor) }}</strong>
                </li>
              }
              @if (p.length > 6) { <li class="suave">… até {{ nomeMesCurto(p[p.length - 1].competencia) }}</li> }
            </ol>
          </div>
        }
      }

      @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }

      <button class="primario largo" type="submit" [disabled]="salvando()">
        <app-icone nome="check" /> {{ salvando() ? 'Salvando…' : 'Salvar' }}
      </button>
      @if (editando()) {
        <button class="link perigo" type="button" (click)="excluir()"><app-icone nome="lixeira" /> Excluir este gasto e todas as parcelas</button>
      }
    </form>
  `,
})
export class Gasto implements OnInit {
  private readonly dados = inject(Dados);
  private readonly ia = inject(Ia);
  private readonly router = inject(Router);
  private readonly avisos = inject(Avisos);

  /** Vem da rota /gasto/:id ("novo" = criar). */
  readonly id = input<string>();
  /** Vindos do lançamento rápido ("Mais opções"), via ?valor=&descricao=&categoria=&conta=&parcelas= */
  readonly valor = input<string>();
  readonly descricao = input<string>();
  readonly categoria = input<string>();
  readonly conta = input<string>();
  readonly parcelas = input<string>();

  protected readonly reais = reais;
  protected readonly dataCurta = dataCurta;
  protected readonly nomeMesCurto = nomeMesCurto;
  protected readonly exemplos = EXEMPLOS;
  protected readonly parcelasRapidas = PARCELAS_RAPIDAS;
  protected readonly temVoz = !!ReconhecimentoDeVoz;
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly contas = signal<ContaCartao[]>([]);
  protected readonly editando = signal(false);
  protected readonly lendo = signal(false);
  protected readonly ouvindo = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal('');
  /** Conversa com a IA: o app pergunta, a pessoa descreve, o app resume o que entendeu. */
  protected readonly mensagens = signal<{ de: 'app' | 'voce' | 'aviso'; texto: string; foto?: string }[]>([
    { de: 'app', texto: 'Me conta o que você gastou, do seu jeito, ou manda a foto do cupom/comprovante. Eu preencho os detalhes pra você conferir.' },
  ]);
  protected frase = '';
  protected form: CompraForm = {
    descricao: '', estabelecimento: '', valor_total: null as unknown as number, parcelas: 1,
    data_compra: hoje(), categoria_id: null, conta_id: null, origem: 'manual', primeira_parcela: null,
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
      } else {
        this.form = {
          ...this.form,
          valor_total: Number(this.valor()) || this.form.valor_total,
          descricao: this.descricao() ?? this.form.descricao,
          categoria_id: Number(this.categoria()) || this.form.categoria_id,
          conta_id: Number(this.conta()) || this.form.conta_id,
          parcelas: Number(this.parcelas()) || this.form.parcelas,
        };
      }
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  /** Onde a 1ª parcela cairia SEM data escolhida (para mostrar como dica ao lado do campo). */
  protected automatica(): string | null {
    try {
      if (!this.form.valor_total || !this.form.data_compra) return null;
      const base = { ...this.form, valor_total: Number(this.form.valor_total), parcelas: Number(this.form.parcelas), primeira_parcela: null };
      return this.dados.previaParcelas(base, this.contas())[0]?.data_prevista ?? null;
    } catch {
      return null;
    }
  }

  protected motivoAutomatica(): string {
    const conta = this.contas().find((c) => c.id === this.form.conta_id);
    if (conta?.tipo === 'credito') return conta.dia_fechamento ? `fatura do ${conta.nome}, fecha dia ${conta.dia_fechamento}` : `fatura do ${conta.nome}`;
    return +this.form.parcelas > 1 ? 'parcelado: mês seguinte' : 'à vista: dia da compra';
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
    if (!ReconhecimentoDeVoz || this.ouvindo()) return;
    const r = new ReconhecimentoDeVoz();
    r.lang = 'pt-BR';
    r.interimResults = false;
    r.onresult = (e) => (this.frase = (this.frase ? this.frase + ' ' : '') + e.results[0][0].transcript);
    r.onerror = () => this.falar('aviso', 'Não consegui ouvir. Tente de novo ou use o microfone do teclado.');
    r.onend = () => this.ouvindo.set(false);
    this.ouvindo.set(true);
    r.start();
  }

  /** Enter envia; Shift+Enter quebra linha. */
  protected enviarFrase(e: Event) {
    if ((e as KeyboardEvent).shiftKey) return;
    e.preventDefault();
    if (this.frase.trim() && !this.lendo()) this.interpretar();
  }

  /** Foto do comprovante: reduz no aparelho, mostra na conversa e manda para a IA junto com o que estiver escrito. */
  protected async enviarFoto(evento: Event) {
    const campo = evento.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    campo.value = '';
    if (!arquivo || this.lendo()) return;
    try {
      const foto = await prepararFoto(arquivo);
      await this.interpretar(foto);
    } catch (e) {
      this.falar('aviso', mensagemDeErro(e));
    }
  }

  protected async interpretar(foto?: Foto) {
    const frase = this.frase.trim();
    this.mensagens.update((l) => [...l, { de: 'voce', texto: frase || (foto ? 'Lê esse comprovante pra mim' : ''), foto: foto ? 'data:' + foto.mime + ';base64,' + foto.base64 : undefined }]);
    this.frase = '';
    this.lendo.set(true);
    try {
      const s = await this.ia.interpretar(frase, this.categorias().map((c) => c.nome), this.contas().map((c) => c.nome), foto);
      this.aplicar(s);
    } catch (e) {
      this.falar('aviso', mensagemDeErro(e));
    } finally {
      this.lendo.set(false);
    }
  }

  private falar(de: 'app' | 'voce' | 'aviso', texto: string) {
    this.mensagens.update((l) => [...l, { de, texto }]);
  }

  protected async salvar() {
    this.erro.set('');
    const compra: CompraForm = { ...this.form, valor_total: Number(this.form.valor_total), parcelas: Number(this.form.parcelas) };
    if (!(compra.valor_total > 0)) return this.erro.set('Informe o valor total.');
    if (!compra.descricao?.trim()) return this.erro.set('Diga o que foi comprado.');
    this.salvando.set(true);
    try {
      const primeira = this.previa()[0];
      await this.dados.salvarCompra(compra);
      vibrar([10, 30, 10]);
      this.avisos.mostrar(compra.parcelas > 1 ? `Gasto salvo em ${compra.parcelas} parcelas` : 'Gasto salvo');
      // Abre o calendário no mês em que a 1ª parcela caiu (pode ser mês que vem, ou depois, no cartão).
      await this.router.navigate(['/calendario'], { queryParams: primeira ? { m: primeira.competencia.slice(0, 7) } : {} });
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async excluir() {
    if (!this.form.id || !confirm('Excluir este gasto e todas as parcelas dele?')) return;
    try {
      const antes = await this.dados.excluirCompra(this.form.id);
      // "Desfazer" recria a compra com os mesmos dados (as parcelas são recalculadas iguais).
      this.avisos.mostrar('Gasto excluído', 'ok', 6000, antes ? {
        rotulo: 'Desfazer',
        executar: async () => {
          const { id: _, ...semId } = antes;
          await this.dados.salvarCompra(semId);
          this.avisos.mostrar('Gasto restaurado');
        },
      } : undefined);
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
      primeira_parcela: s.primeira_parcela ?? this.form.primeira_parcela ?? null,
      origem: 'ia',
    };
    const f = this.form;
    const partes = [
      f.descricao,
      f.valor_total ? reais(Number(f.valor_total)) + (f.parcelas > 1 ? ` em ${f.parcelas}x` : ' à vista') : null,
      f.primeira_parcela ? `1ª em ${dataCurta(f.primeira_parcela)}` : null,
      conta?.nome,
      categoria?.nome,
    ].filter(Boolean);
    this.falar('app', `Entendi: ${partes.join(' · ')}. Confira abaixo e toque em Salvar.`);
    const avisos: string[] = [];
    if (s.categoria && !categoria) avisos.push(`A categoria "${s.categoria}" não está cadastrada.`);
    if (s.conta && !conta) avisos.push(`A forma de pagamento "${s.conta}" não está cadastrada.`);
    if (s.observacao) avisos.push(s.observacao);
    if (avisos.length) this.falar('aviso', avisos.join(' '));
  }
}

function acharPorNome<T extends { nome: string }>(lista: T[], nome: string | null): T | undefined {
  if (!nome) return undefined;
  const limpar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return lista.find((x) => limpar(x.nome) === limpar(nome));
}
