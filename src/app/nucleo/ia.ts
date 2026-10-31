// Interpreta uma frase ("geladeira 3 mil em 10x no Nubank") chamando a Netlify Function, que fala com o Gemini.
// A IA só SUGERE: o resultado preenche o formulário e a pessoa confere antes de gravar.
import { Injectable, inject } from '@angular/core';
import { Auth } from './auth';
import { hoje } from './formato';

export interface SugestaoGasto {
  descricao: string | null;
  estabelecimento: string | null;
  valor_total: number | null;
  parcelas: number | null;
  data_compra: string | null;
  categoria: string | null;
  conta: string | null;
  observacao: string | null;
}

@Injectable({ providedIn: 'root' })
export class Ia {
  private readonly auth = inject(Auth);

  async interpretar(frase: string, categorias: string[], contas: string[]): Promise<SugestaoGasto> {
    const resposta = await fetch('/.netlify/functions/interpretar-gasto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.auth.token() ?? ''}` },
      body: JSON.stringify({ frase, hoje: hoje(), categorias, contas }),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      // Rodando com "ng serve" a função não existe (404): avisa em vez de mostrar erro técnico.
      if (resposta.status === 404) throw new Error('A leitura por IA só funciona no site publicado (ou com "netlify dev").');
      throw new Error(corpo.erro ?? `Falha ao interpretar (HTTP ${resposta.status}).`);
    }
    return corpo as SugestaoGasto;
  }
}
