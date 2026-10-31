// Cadastros: renda/dados iniciais, categorias e cartões/formas de pagamento.
// Excluir categoria ou cartão NÃO apaga gastos: eles ficam "sem categoria"/"sem cartão" (on delete set null).
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Categoria, Configuracao, ContaCartao, Dados, TIPOS_CONTA } from '../nucleo/dados';
import { mensagemDeErro } from '../nucleo/supabase';

type ContaEdicao = Omit<ContaCartao, 'id'> & { id?: number };

@Component({
  selector: 'app-cadastros',
  imports: [FormsModule],
  template: `
    <header class="topo"><h1>Cadastros</h1></header>
    @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }
    @if (ok()) { <p class="aviso ok">{{ ok() }}</p> }

    <section class="cartao">
      <h2>Renda</h2>
      <label>Renda mensal (R$) <input type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="config.renda_mensal" /></label>
      <div class="linha">
        <label>Dia do salário <input type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="config.dia_salario" /></label>
        <label>Saldo inicial (R$) <input type="number" inputmode="decimal" step="0.01" [(ngModel)]="config.saldo_inicial" /></label>
      </div>
      <button type="button" (click)="salvarConfig()">Salvar renda</button>
    </section>

    <section class="cartao">
      <h2>Cartões e formas de pagamento</h2>
      @for (c of contas(); track c.id) {
        <div class="item">
          <div>
            <strong>{{ c.nome }}</strong>
            <small class="suave">
              {{ rotuloTipo(c.tipo) }}
              @if (c.dia_fechamento) { · fecha dia {{ c.dia_fechamento }} }
              @if (c.dia_vencimento) { · vence dia {{ c.dia_vencimento }} }
            </small>
          </div>
          <span>
            <button class="link" type="button" (click)="conta = { ...c }">editar</button>
            <button class="link perigo" type="button" (click)="excluirConta(c)">excluir</button>
          </span>
        </div>
      }
      <h3>{{ conta.id ? 'Editando ' + conta.nome : 'Adicionar' }}</h3>
      <div class="linha">
        <label>Nome <input [(ngModel)]="conta.nome" /></label>
        <label>Tipo
          <select [(ngModel)]="conta.tipo">
            @for (t of tipos; track t.valor) { <option [value]="t.valor">{{ t.rotulo }}</option> }
          </select>
        </label>
      </div>
      @if (conta.tipo === 'credito') {
        <div class="linha">
          <label>Dia de fechamento <input type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="conta.dia_fechamento" /></label>
          <label>Dia de vencimento <input type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="conta.dia_vencimento" /></label>
        </div>
        <p class="suave dica">Mudar o fechamento vale para gastos novos ou editados; os já lançados não mudam sozinhos.</p>
      }
      <div class="linha acoes">
        @if (conta.id) { <button type="button" class="link" (click)="conta = contaVazia()">cancelar</button> }
        <button type="button" (click)="salvarConta()" [disabled]="!conta.nome.trim()">Salvar</button>
      </div>
    </section>

    <section class="cartao">
      <h2>Categorias</h2>
      @for (c of categorias(); track c.id) {
        <div class="item">
          <span><span class="bolinha" [style.background]="c.cor"></span>{{ c.nome }}</span>
          <span>
            <button class="link" type="button" (click)="categoria = { ...c }">editar</button>
            <button class="link perigo" type="button" (click)="excluirCategoria(c)">excluir</button>
          </span>
        </div>
      }
      <h3>{{ categoria.id ? 'Editando ' + categoria.nome : 'Adicionar' }}</h3>
      <div class="linha">
        <label>Nome <input [(ngModel)]="categoria.nome" /></label>
        <label class="cor">Cor <input type="color" [(ngModel)]="categoria.cor" /></label>
      </div>
      <div class="linha acoes">
        @if (categoria.id) { <button type="button" class="link" (click)="categoria = categoriaVazia()">cancelar</button> }
        <button type="button" (click)="salvarCategoria()" [disabled]="!categoria.nome.trim()">Salvar</button>
      </div>
    </section>
  `,
})
export class Cadastros implements OnInit {
  private readonly dados = inject(Dados);

  protected readonly tipos = TIPOS_CONTA;
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly contas = signal<ContaCartao[]>([]);
  protected readonly erro = signal('');
  protected readonly ok = signal('');
  protected config: Configuracao = { renda_mensal: 0, dia_salario: null, saldo_inicial: 0 };
  protected conta: ContaEdicao = this.contaVazia();
  protected categoria: Partial<Categoria> & { nome: string; cor: string } = this.categoriaVazia();

  async ngOnInit() {
    await this.tentar(async () => {
      this.config = (await this.dados.configuracao()) ?? this.config;
      await this.recarregar();
    });
  }

  protected rotuloTipo(tipo: string) {
    return TIPOS_CONTA.find((t) => t.valor === tipo)?.rotulo ?? tipo;
  }

  protected salvarConfig() {
    return this.tentar(async () => {
      await this.dados.salvarConfiguracao({
        renda_mensal: Number(this.config.renda_mensal) || 0,
        dia_salario: this.config.dia_salario || null,
        saldo_inicial: Number(this.config.saldo_inicial) || 0,
      });
    }, 'Renda salva.');
  }

  protected salvarConta() {
    return this.tentar(async () => {
      await this.dados.salvarConta({ ...this.conta, nome: this.conta.nome.trim() });
      this.conta = this.contaVazia();
      await this.recarregar();
    }, 'Forma de pagamento salva.');
  }

  protected excluirConta(c: ContaCartao) {
    if (!confirm(`Excluir "${c.nome}"? Os gastos feitos com ele continuam, só ficam sem forma de pagamento.`)) return;
    return this.tentar(async () => {
      await this.dados.excluirConta(c.id);
      await this.recarregar();
    });
  }

  protected salvarCategoria() {
    return this.tentar(async () => {
      await this.dados.salvarCategoria({ ...this.categoria, nome: this.categoria.nome.trim() });
      this.categoria = this.categoriaVazia();
      await this.recarregar();
    }, 'Categoria salva.');
  }

  protected excluirCategoria(c: Categoria) {
    if (!confirm(`Excluir "${c.nome}"? Os gastos dela continuam, só ficam sem categoria.`)) return;
    return this.tentar(async () => {
      await this.dados.excluirCategoria(c.id);
      await this.recarregar();
    });
  }

  protected contaVazia(): ContaEdicao {
    return { nome: '', tipo: 'credito', dia_fechamento: null, dia_vencimento: null };
  }

  protected categoriaVazia() {
    return { nome: '', cor: '#64748b' };
  }

  private async recarregar() {
    const [cats, contas] = await Promise.all([this.dados.categorias(), this.dados.contas()]);
    this.categorias.set(cats);
    this.contas.set(contas);
  }

  private async tentar(acao: () => Promise<void>, sucesso = '') {
    this.erro.set('');
    this.ok.set('');
    try {
      await acao();
      this.ok.set(sucesso);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}
