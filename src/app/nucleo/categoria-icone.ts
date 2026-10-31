// Ícone redondo da categoria (estilo apps de banco): círculo com a cor da categoria clarinha e o desenho por cima.
// O desenho é escolhido pelo NOME da categoria (palavras-chave), então categoria criada pela pessoa também ganha
// ícone quando o nome ajuda; senão aparece a inicial.
import { Component, computed, input } from '@angular/core';
import { Icone, NomeIcone } from './icone';

const PALAVRAS: [RegExp, NomeIcone][] = [
  [/mercad|supermerc|feira|hortifr|padari|açougue|acougue/i, 'carrinho'],
  // "Contas da casa" tem que cair em contas, não em moradia: por isso esta linha vem antes.
  [/conta|luz|energia|água|agua|internet|telefon|celular|\bg[aá]s\b/i, 'raio'],
  [/moradi|aluguel|casa|condom|iptu/i, 'casa'],
  [/transport|uber|carro|combust|gasolin|ônibus|onibus|estacion|pedágio|pedagio/i, 'carro'],
  [/aliment|restaur|lanche|ifood|delivery|comida|bar\b|caf[eé]/i, 'talheres'],
  [/saúde|saude|farmác|farmac|médic|medic|academia|dentist/i, 'coracao'],
  [/educa|escola|curso|faculd|livro/i, 'livro'],
  [/lazer|cinema|show|streaming|jogo|festa|música|musica/i, 'musica'],
  [/eletro|eletrôn|eletron|móve|move/i, 'tomada'],
  [/vestu|roupa|calçad|calcad|moda/i, 'camiseta'],
  [/pet|cachorr|gato|veterin/i, 'pata'],
  [/viage|passage|hotel|turism/i, 'aviao'],
  [/cart[aã]o|fatura/i, 'cartao'],
];

export function iconeDaCategoria(nome: string | null | undefined): NomeIcone | null {
  if (!nome) return 'pacote';
  return PALAVRAS.find(([re]) => re.test(nome))?.[1] ?? null;
}

@Component({
  selector: 'app-icone-categoria',
  imports: [Icone],
  host: { class: 'icone-cat', '[style.--cor]': 'cor() ?? "#71717a"', 'aria-hidden': 'true' },
  template: `
    @if (desenho(); as d) { <app-icone [nome]="d" /> } @else { <span>{{ inicial() }}</span> }
  `,
})
export class IconeCategoria {
  readonly nome = input<string | null | undefined>();
  readonly cor = input<string | null | undefined>();
  protected readonly desenho = computed(() => iconeDaCategoria(this.nome()));
  protected readonly inicial = computed(() => (this.nome() ?? '?').trim().charAt(0).toUpperCase());
}
