// Cadastro inicial: renda, dia do salário, saldo, categorias e cartões. Gravar a "configuracao" libera o app
// (guard exigeCadastroInicial). Categorias e cartões podem ser mudados depois em Cadastros.
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CATEGORIAS_SUGERIDAS, ContaCartao, Dados, TIPOS_CONTA } from '../nucleo/dados';
import { mensagemDeErro } from '../nucleo/supabase';

type ContaNova = Omit<ContaCartao, 'id'>;

@Component({
  selector: 'app-primeiro-acesso',
  imports: [FormsModule],
  template: `
    <main class="pagina">
      <h1>Vamos começar</h1>
      <p class="suave">Esses dados montam seu painel. Dá para mudar tudo depois.</p>

      <section class="cartao">
        <h2>Sua renda</h2>
        <label>Renda mensal (R$) <input type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="renda" /></label>
        <div class="linha">
          <label>Dia do salário <input type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="diaSalario" /></label>
          <label>Saldo atual (R$) <input type="number" inputmode="decimal" step="0.01" [(ngModel)]="saldo" /></label>
        </div>
      </section>

      <section class="cartao">
        <h2>Categorias</h2>
        <p class="suave">Para onde vai o seu dinheiro. Desmarque o que não usa.</p>
        <div class="fichas">
          @for (c of sugeridas; track c.nome) {
            <label class="ficha" [class.marcada]="marcadas.has(c.nome)">
              <input type="checkbox" [checked]="marcadas.has(c.nome)" (change)="alternar(c.nome)" />
              <span class="bolinha" [style.background]="c.cor"></span>{{ c.nome }}
            </label>
          }
        </div>
      </section>

      <section class="cartao">
        <h2>Cartões e formas de pagamento</h2>
        @for (c of contas(); track $index) {
          <div class="item">
            <div>
              <strong>{{ c.nome }}</strong>
              <small class="suave">
                {{ rotuloTipo(c.tipo) }}
                @if (c.dia_fechamento) { · fecha dia {{ c.dia_fechamento }} }
                @if (c.dia_vencimento) { · vence dia {{ c.dia_vencimento }} }
              </small>
            </div>
            <button class="link perigo" type="button" (click)="removerConta($index)">remover</button>
          </div>
        }
        <div class="linha">
          <label>Nome <input [(ngModel)]="nova.nome" placeholder="Nubank, Pix, Dinheiro…" /></label>
          <label>Tipo
            <select [(ngModel)]="nova.tipo">
              @for (t of tipos; track t.valor) { <option [value]="t.valor">{{ t.rotulo }}</option> }
            </select>
          </label>
        </div>
        @if (nova.tipo === 'credito') {
          <div class="linha">
            <label>Dia de fechamento <input type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="nova.dia_fechamento" /></label>
            <label>Dia de vencimento <input type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="nova.dia_vencimento" /></label>
          </div>
          <p class="suave dica">Compra depois do fechamento cai na fatura de dois meses à frente.</p>
        }
        <button type="button" (click)="adicionarConta()" [disabled]="!nova.nome.trim()">+ Adicionar</button>
      </section>

      @if (erro()) { <p class="aviso erro">{{ erro() }}</p> }
      <button class="primario largo" (click)="concluir()" [disabled]="ocupado()">
        {{ ocupado() ? 'Salvando…' : 'Concluir' }}
      </button>
    </main>
  `,
})
export class PrimeiroAcesso {
  private readonly dados = inject(Dados);
  private readonly router = inject(Router);

  protected readonly sugeridas = CATEGORIAS_SUGERIDAS;
  protected readonly tipos = TIPOS_CONTA;
  protected readonly marcadas = new Set(CATEGORIAS_SUGERIDAS.map((c) => c.nome));
  protected renda: number | null = null;
  protected diaSalario: number | null = 5;
  protected saldo: number | null = 0;
  protected readonly contas = signal<ContaNova[]>([
    { nome: 'Pix', tipo: 'pix', dia_fechamento: null, dia_vencimento: null },
    { nome: 'Dinheiro', tipo: 'dinheiro', dia_fechamento: null, dia_vencimento: null },
  ]);
  protected nova: ContaNova = this.contaVazia();
  protected readonly ocupado = signal(false);
  protected readonly erro = signal('');

  protected alternar(nome: string) {
    if (this.marcadas.has(nome)) this.marcadas.delete(nome);
    else this.marcadas.add(nome);
  }

  protected rotuloTipo(tipo: string) {
    return TIPOS_CONTA.find((t) => t.valor === tipo)?.rotulo ?? tipo;
  }

  protected adicionarConta() {
    this.contas.update((l) => [...l, { ...this.nova, nome: this.nova.nome.trim() }]);
    this.nova = this.contaVazia();
  }

  protected removerConta(i: number) {
    this.contas.update((l) => l.filter((_, j) => j !== i));
  }

  protected async concluir() {
    this.erro.set('');
    this.ocupado.set(true);
    try {
      await this.dados.criarCategorias(this.sugeridas.filter((c) => this.marcadas.has(c.nome)));
      await this.dados.criarContas(this.contas());
      // Por último: é a configuração que marca o cadastro inicial como feito.
      await this.dados.salvarConfiguracao({
        renda_mensal: this.renda ?? 0,
        dia_salario: this.diaSalario || null,
        saldo_inicial: this.saldo ?? 0,
      });
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  private contaVazia(): ContaNova {
    return { nome: '', tipo: 'credito', dia_fechamento: null, dia_vencimento: null };
  }
}
