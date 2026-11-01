// Aparência DESTE aparelho (fica no navegador, não no servidor): tema (escuro, claro ou automático pelo sistema)
// e cor de destaque. Aplica direto nas variáveis CSS do <html> (tokens de styles.scss), então todo o app muda junto.
import { Injectable, signal } from '@angular/core';

export type Tema = 'escuro' | 'claro' | 'auto';

export interface CorDestaque {
  nome: string;
  /** Cor do destaque (botões, barras, gráficos). */
  cor: string;
  /** Texto/ícone em cima do destaque. */
  sobre: string;
  /** Versão mais escura para TEXTO no tema claro (destaque claro em fundo branco não dá para ler). */
  textoClaro: string;
}

export const CORES_DESTAQUE: CorDestaque[] = [
  { nome: 'Limão', cor: '#cfff04', sobre: '#0a0a0a', textoClaro: '#4d7c0f' },
  { nome: 'Roxo', cor: '#a78bfa', sobre: '#0a0a0a', textoClaro: '#6d28d9' },
  { nome: 'Azul', cor: '#38bdf8', sobre: '#0a0a0a', textoClaro: '#0369a1' },
  { nome: 'Rosa', cor: '#f472b6', sobre: '#0a0a0a', textoClaro: '#be185d' },
  { nome: 'Laranja', cor: '#fb923c', sobre: '#0a0a0a', textoClaro: '#c2410c' },
  { nome: 'Verde', cor: '#4ade80', sobre: '#0a0a0a', textoClaro: '#15803d' },
];

const CHAVE = 'orgfin.aparencia';

@Injectable({ providedIn: 'root' })
export class Aparencia {
  readonly tema = signal<Tema>('escuro');
  readonly destaque = signal<CorDestaque>(CORES_DESTAQUE[0]);
  private readonly sistemaClaro = matchMedia('(prefers-color-scheme: light)');

  constructor() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as { tema?: Tema; destaque?: string } | null;
      if (salvo?.tema) this.tema.set(salvo.tema);
      const cor = CORES_DESTAQUE.find((c) => c.nome === salvo?.destaque);
      if (cor) this.destaque.set(cor);
    } catch {
      /* sem preferências salvas */
    }
    this.sistemaClaro.addEventListener('change', () => this.aplicar());
    this.aplicar();
  }

  mudarTema(t: Tema) {
    this.tema.set(t);
    this.salvar();
  }

  mudarDestaque(c: CorDestaque) {
    this.destaque.set(c);
    this.salvar();
  }

  private salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ tema: this.tema(), destaque: this.destaque().nome }));
    } catch {
      /* aba anônima */
    }
    this.aplicar();
  }

  private aplicar() {
    const raiz = document.documentElement;
    const claro = this.tema() === 'claro' || (this.tema() === 'auto' && this.sistemaClaro.matches);
    const d = this.destaque();
    raiz.dataset['tema'] = claro ? 'claro' : 'escuro';
    raiz.style.setProperty('--destaque', d.cor);
    raiz.style.setProperty('--sobre-destaque', d.sobre);
    raiz.style.setProperty('--destaque-texto', claro ? d.textoClaro : d.cor);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', claro ? '#f4f4f5' : '#09090b');
  }
}
