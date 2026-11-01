// Cofres: poupanças com nome, cor e meta opcional ("Construção da casa": R$ 80.000 até dez/2028).
// A cada mês você registra quanto guardou (ou retirou) e acompanha o saldo, o quanto falta e o ritmo
// necessário para bater a meta. O que entra no cofre no mês sai do "Disponível" do painel.
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { lerData } from '../dominio/parcelamento';
import { mensagemDeErro } from '../nucleo/api';
import { Avisos } from '../nucleo/avisos';
import { Cofre, CofreResumo, Dados, MovimentoCofre } from '../nucleo/dados';
import { dataCurta, hoje } from '../nucleo/formato';
import { comemorar, vibrar } from '../nucleo/efeitos';
import { Icone } from '../nucleo/icone';
import { Privacidade } from '../nucleo/privacidade';

const CORES = ['#cfff04', '#22c55e', '#38bdf8', '#a78bfa', '#f472b6', '#fb923c', '#facc15'];

@Component({
  selector: 'app-cofres',
  host: { class: 'tela tela-cofres', '[class.carregando]': '!dados.pronto()' },
  imports: [FormsModule, Icone],
  template: `
    <header class="topo">
      <div><small>Guardado no total</small><h1>{{ priv.mostrar(total()) }}</h1></div>
      <button type="button" class="primario" (click)="novoCofre()"><app-icone nome="mais" /> Cofre</button>
    </header>

    @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }

    <div class="col-principal">
      @for (c of cofres(); track c.id) {
        <section class="cofre" [style.--cor]="c.cor" [class.aberto]="aberto() === c.id">
          <button type="button" class="cofre-topo" (click)="aberto.set(aberto() === c.id ? null : c.id)" [attr.aria-expanded]="aberto() === c.id">
            <span class="cofre-icone"><app-icone nome="cofre" /></span>
            <span class="texto">
              <strong>{{ c.nome }}</strong>
              <small>{{ c.meta_valor ? metaTexto(c) : c.movimentos.length + ' registro(s)' }}</small>
            </span>
            <strong class="cofre-saldo">{{ priv.mostrar(c.saldo) }}</strong>
          </button>
          @if (c.meta_valor) {
            <div class="barra"><span [style.width.%]="progresso(c)" [style.background]="c.cor"></span></div>
            <div class="cofre-meta suave">
              <span>{{ progresso(c) }}% de {{ priv.mostrar(c.meta_valor) }}</span>
              @if (ritmo(c); as r) { <span>{{ r }}</span> }
            </div>
          }

          <div class="cofre-acoes">
            <input type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="Valor" [(ngModel)]="valores[c.id]" [attr.aria-label]="'Valor para ' + c.nome" />
            <button type="button" class="primario" (click)="movimentar(c, 1)" [disabled]="!valores[c.id]">Guardar</button>
            <button type="button" (click)="movimentar(c, -1)" [disabled]="!valores[c.id] || !c.saldo">Retirar</button>
          </div>

          @if (aberto() === c.id) {
            <div class="cofre-historico">
              <h3>Histórico</h3>
              @for (m of c.movimentos; track m.id) {
                <div class="item">
                  <div><strong [class.positivo]="m.valor > 0" [class.negativo]="m.valor < 0">{{ m.valor > 0 ? '+ ' : '− ' }}{{ priv.mostrar(abs(m.valor)) }}</strong>
                    <small class="suave">{{ dataCurta(m.data) }}/{{ m.data.slice(0, 4) }}{{ m.nota ? ' · ' + m.nota : '' }}</small></div>
                  <button class="icone-botao perigo" type="button" (click)="excluirMovimento(m)" aria-label="Excluir registro"><app-icone nome="lixeira" /></button>
                </div>
              } @empty {
                <p class="suave">Nada guardado ainda.</p>
              }
              <div class="linha acoes">
                <button type="button" class="link" (click)="editarCofre(c)"><app-icone nome="lapis" /> editar cofre</button>
                <button type="button" class="link perigo" (click)="excluirCofre(c)"><app-icone nome="lixeira" /> excluir</button>
              </div>
            </div>
          }
        </section>
      } @empty {
        <div class="cartao vazio">
          <span class="cofre-icone grande"><app-icone nome="cofre" /></span>
          <p>Crie um cofre para cada objetivo: casa, reserva de emergência, viagem, futuro…</p>
          <button type="button" class="primario" (click)="novoCofre()"><app-icone nome="mais" /> Criar cofre</button>
        </div>
      }
    </div>

    <div class="col-lateral">
      @if (form(); as f) {
        <section class="cartao">
          <h2>{{ f.id ? 'Editar cofre' : 'Novo cofre' }}</h2>
          <label>Nome <input [(ngModel)]="f.nome" placeholder="Construção da casa" /></label>
          <div class="fichas cores">
            @for (cor of cores; track cor) {
              <button type="button" class="ficha cor" [class.marcada]="f.cor === cor" [style.background]="cor" (click)="f.cor = cor" [attr.aria-label]="'Cor ' + cor"></button>
            }
          </div>
          <div class="linha">
            <label>Meta (R$, opcional) <input type="number" inputmode="decimal" step="0.01" [(ngModel)]="f.meta_valor" /></label>
            <label>Até (opcional) <input type="date" [(ngModel)]="f.meta_data" /></label>
          </div>
          <div class="linha acoes">
            <button type="button" class="link" (click)="form.set(null)">cancelar</button>
            <button type="button" class="primario" (click)="salvarCofre(f)" [disabled]="!f.nome.trim()">Salvar</button>
          </div>
        </section>
      }
      <section class="cartao dica-cofre">
        <h2><app-icone nome="brilho" /> Como usar</h2>
        <p class="suave">Todo mês, quando separar dinheiro, toque em <strong>Guardar</strong> no cofre. O valor sai do "Disponível" do painel e aparece nos Relatórios, com a evolução de cada cofre.</p>
      </section>
    </div>
  `,
})
export class Cofres {
  protected readonly dados = inject(Dados);
  private readonly avisos = inject(Avisos);
  protected readonly priv = inject(Privacidade);

  protected readonly abs = Math.abs;
  protected readonly dataCurta = dataCurta;
  protected readonly cores = CORES;
  protected readonly cofres = signal<CofreResumo[]>([]);
  protected readonly aberto = signal<number | null>(null);
  protected readonly form = signal<Cofre | null>(null);
  protected readonly erro = signal('');
  protected valores: Record<number, number | null> = {};

  protected readonly total = computed(() => this.cofres().reduce((t, c) => t + c.saldo, 0));

  constructor() {
    effect(() => {
      this.dados.versao();
      untracked(() => this.dados.cofres().then((c) => this.cofres.set(c)).catch((e) => this.erro.set(mensagemDeErro(e))));
    });
  }

  protected progresso(c: CofreResumo) {
    return c.meta_valor ? Math.min(100, Math.round((c.saldo / c.meta_valor) * 100)) : 0;
  }

  protected metaTexto(c: CofreResumo) {
    const falta = Math.max(0, (c.meta_valor ?? 0) - c.saldo);
    if (!falta) return 'Meta atingida! 🎉';
    return `Faltam ${this.priv.mostrar(falta)}${c.meta_data ? ' até ' + dataCurta(c.meta_data) + '/' + c.meta_data.slice(0, 4) : ''}`;
  }

  /** Quanto precisa guardar por mês para chegar na meta na data. */
  protected ritmo(c: CofreResumo): string | null {
    if (!c.meta_valor || !c.meta_data) return null;
    const falta = c.meta_valor - c.saldo;
    if (falta <= 0) return null;
    const h = lerData(hoje());
    const m = lerData(c.meta_data);
    const meses = (m.ano - h.ano) * 12 + (m.mes - h.mes);
    if (meses <= 0) return 'prazo passou';
    return `guarde ${this.priv.mostrar(Math.ceil((falta / meses) * 100) / 100)}/mês`;
  }

  protected novoCofre() {
    this.form.set({ nome: '', cor: CORES[this.cofres().length % CORES.length], meta_valor: null, meta_data: null });
  }

  protected editarCofre(c: CofreResumo) {
    this.form.set({ id: c.id, nome: c.nome, cor: c.cor, meta_valor: c.meta_valor, meta_data: c.meta_data });
  }

  protected async salvarCofre(f: Cofre) {
    try {
      await this.dados.salvarCofre({ ...f, meta_valor: f.meta_valor ? Number(f.meta_valor) : null, meta_data: f.meta_data || null });
      this.avisos.mostrar(f.id ? 'Cofre atualizado' : 'Cofre criado');
      this.form.set(null);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected async movimentar(c: CofreResumo, sinal: 1 | -1) {
    const valor = Number(this.valores[c.id]);
    if (!valor) return;
    try {
      await this.dados.movimentarCofre({ cofre_id: c.id, valor: sinal * Math.abs(valor), data: hoje(), nota: '' });
      this.valores[c.id] = null;
      // Bateu a meta com este depósito: festa!
      const depois = c.saldo + sinal * Math.abs(valor);
      if (sinal > 0 && c.meta_valor && c.saldo < c.meta_valor && depois >= c.meta_valor) {
        comemorar([c.cor, '#ffffff', '#cfff04', '#a78bfa']);
        this.avisos.mostrar(`Meta de "${c.nome}" batida! 🎉`, 'ok', 5000);
        return;
      }
      vibrar(sinal > 0 ? [10, 30, 10] : 10);
      this.avisos.mostrar(sinal > 0 ? `${this.priv.mostrar(valor)} guardados em ${c.nome}` : `${this.priv.mostrar(valor)} retirados de ${c.nome}`);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected async excluirMovimento(m: MovimentoCofre & { id: number }) {
    if (!confirm('Excluir este registro do cofre?')) return;
    try {
      await this.dados.excluirMovimento(m.id);
      const { id: _, ...semId } = m;
      this.avisos.mostrar('Registro excluído', 'ok', 6000, { rotulo: 'Desfazer', executar: () => this.dados.movimentarCofre(semId) });
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected async excluirCofre(c: CofreResumo) {
    if (!confirm(`Excluir o cofre "${c.nome}" e todo o histórico dele?`)) return;
    try {
      await this.dados.excluirCofre(c.id);
      this.avisos.mostrar('Cofre excluído');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}
