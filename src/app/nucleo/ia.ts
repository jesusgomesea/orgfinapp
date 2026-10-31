// Interpreta uma frase ("geladeira 3 mil em 10x no Nubank") chamando a Netlify Function, que fala com o Gemini.
// A IA só SUGERE: o resultado preenche o formulário e a pessoa confere antes de gravar.
import { Injectable } from '@angular/core';
import { chamar } from './api';
import { hoje } from './formato';

export interface SugestaoGasto {
  descricao: string | null;
  estabelecimento: string | null;
  valor_total: number | null;
  parcelas: number | null;
  data_compra: string | null;
  primeira_parcela: string | null;
  categoria: string | null;
  conta: string | null;
  observacao: string | null;
}

@Injectable({ providedIn: 'root' })
export class Ia {
  interpretar(frase: string, categorias: string[], contas: string[]): Promise<SugestaoGasto> {
    return chamar<SugestaoGasto>('interpretar-gasto', { corpo: { frase, hoje: hoje(), categorias, contas } });
  }
}
