// Chamadas de IA (Netlify Functions → Gemini). A IA só SUGERE: o resultado preenche formulários e a pessoa confere.
//  - interpretar: frase e/ou FOTO de comprovante → campos de um gasto;
//  - interpretarLista: lista colada → vários fixos de uma vez;
//  - perguntar: pergunta livre sobre as finanças (o servidor lê os dados e responde).
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

export interface ItemLista {
  descricao: string | null;
  valor: number | null;
  dia: number | null;
  categoria: string | null;
  conta: string | null;
}

export interface Foto {
  mime: string;
  base64: string;
}

@Injectable({ providedIn: 'root' })
export class Ia {
  interpretar(frase: string, categorias: string[], contas: string[], imagem?: Foto): Promise<SugestaoGasto> {
    return chamar<SugestaoGasto>('interpretar-gasto', { corpo: { frase, hoje: hoje(), categorias, contas, imagem } });
  }

  interpretarLista(texto: string, tipo: 'gasto' | 'entrada', categorias: string[], contas: string[]): Promise<ItemLista[]> {
    return chamar<ItemLista[]>('interpretar-lista', { corpo: { texto, tipo, categorias, contas } });
  }

  async perguntar(pergunta: string, historico: { de: 'voce' | 'app'; texto: string }[]): Promise<string> {
    const r = await chamar<{ resposta: string }>('perguntar', { corpo: { pergunta, hoje: hoje(), historico } });
    return r.resposta;
  }
}

/**
 * Reduz a foto no próprio aparelho antes de enviar (lado maior 1600 px, JPEG): foto de celular tem 3–8 MB,
 * isso derruba para ~200–400 KB, sobe rápido no 4G e a IA lê igual.
 */
export async function prepararFoto(arquivo: File): Promise<Foto> {
  const bitmap = await createImageBitmap(arquivo).catch(() => null);
  if (!bitmap) throw new Error('Não consegui abrir essa imagem. Tente uma foto JPG ou PNG.');
  const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.82);
  return { mime: 'image/jpeg', base64: url.slice(url.indexOf(',') + 1) };
}
