// Retrospectiva do mês em "stories" (como a do Nubank / Spotify Wrapped): tela cheia, barrinhas de progresso
// em cima, toque à direita avança, à esquerda volta, segurar pausa. Passa sozinho a cada ~5 s.
// /retrospectiva?m=AAAA-MM (sem m = mês passado). O painel oferece no começo de cada mês.
import { Component, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { lerData } from '../dominio/parcelamento';
import { chaveRetrospectivaVista } from '../nucleo/atalhos';
import { CofreResumo, Categoria, Dados, LancamentoDetalhado, ehEntrada, ehGasto } from '../nucleo/dados';
import { comemorar } from '../nucleo/efeitos';
import { NOMES_MES, mesAtual, navegarMes, primeiroDia, reais } from '../nucleo/formato';
import { Icone } from '../nucleo/icone';

const DURACAO = 5500;
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

interface Slide {
  fundo: string;
  sobre: string;
  grande: string;
  texto: string;
  detalhe?: string;
  festa?: boolean;
}

@Component({
  selector: 'app-retrospectiva',
  imports: [Icone],
  host: { class: 'retrospectiva' },
  template: `
    <div class="retro-barras">
      @for (s of slides(); track $index; let i = $index) {
        <span><i [style.width.%]="i < atual() ? 100 : i === atual() ? progresso() : 0"></i></span>
      }
    </div>
    <button type="button" class="retro-fechar icone-botao" (click)="fechar()" aria-label="Fechar"><app-icone nome="fechar" /></button>

    @if (slide(); as s) {
      <div class="retro-slide" [style.background]="s.fundo" (pointerdown)="pausar(true)" (pointerup)="toque($event)" (pointercancel)="pausar(false)">
        <small class="retro-sobre">{{ s.sobre }}</small>
        <strong class="retro-grande">{{ s.grande }}</strong>
        <p class="retro-texto">{{ s.texto }}</p>
        @if (s.detalhe) { <p class="retro-detalhe">{{ s.detalhe }}</p> }
      </div>
    } @else {
      <div class="retro-slide"><p class="retro-texto">Carregando…</p></div>
    }
  `,
})
export class Retrospectiva implements OnDestroy {
  private readonly dados = inject(Dados);
  private readonly router = inject(Router);

  readonly m = input<string>();

  protected readonly atual = signal(0);
  protected readonly progresso = signal(0);
  protected readonly slides = signal<Slide[]>([]);
  protected readonly slide = computed(() => this.slides()[this.atual()]);
  private pausado = false;
  private inicioToque = 0;
  private timer = 0;
  private ultimo = 0;

  constructor() {
    effect(() => {
      const m = /^(\d{4})-(\d{2})$/.exec(this.m() ?? '');
      const alvo = m ? { ano: +m[1], mes: +m[2] } : navegarMes(mesAtual().ano, mesAtual().mes, -1);
      untracked(() => this.montar(alvo.ano, alvo.mes));
    });
    // Comemora no slide de conquista.
    effect(() => {
      if (this.slide()?.festa) untracked(() => comemorar());
    });
    this.ultimo = performance.now();
    const passo = (t: number) => {
      if (!this.pausado && this.slides().length) {
        this.progresso.update((p) => p + ((t - this.ultimo) / DURACAO) * 100);
        if (this.progresso() >= 100) this.avancar();
      }
      this.ultimo = t;
      this.timer = requestAnimationFrame(passo);
    };
    this.timer = requestAnimationFrame(passo);
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.timer);
  }

  protected pausar(v: boolean) {
    this.pausado = v;
    if (v) this.inicioToque = performance.now();
  }

  /** Toque curto: lado direito avança, esquerdo volta. Toque longo (segurar) só pausava. */
  protected toque(e: PointerEvent) {
    const longo = performance.now() - this.inicioToque > 350;
    this.pausado = false;
    if (longo) return;
    if (e.clientX < innerWidth / 3) this.voltar();
    else this.avancar();
  }

  protected fechar() {
    this.router.navigateByUrl('/painel');
  }

  private avancar() {
    if (this.atual() >= this.slides().length - 1) return this.fechar();
    this.atual.update((i) => i + 1);
    this.progresso.set(0);
  }

  private voltar() {
    this.atual.update((i) => Math.max(0, i - 1));
    this.progresso.set(0);
  }

  private async montar(ano: number, mes: number) {
    const comp = primeiroDia(ano, mes);
    const ant = navegarMes(ano, mes, -1);
    const compAnt = primeiroDia(ant.ano, ant.mes);
    const [itens, anteriores, cofres, categorias] = await Promise.all([
      this.dados.lancamentosPorCompetencia(comp, comp),
      this.dados.lancamentosPorCompetencia(compAnt, compAnt),
      this.dados.cofres(),
      this.dados.categorias(),
    ]);
    try {
      localStorage.setItem(chaveRetrospectivaVista(comp.slice(0, 7)), '1');
    } catch {
      /* aba anônima */
    }
    this.slides.set(montarSlides(NOMES_MES[mes - 1], NOMES_MES[ant.mes - 1], comp.slice(0, 7), itens, anteriores, cofres, categorias));
    this.atual.set(0);
    this.progresso.set(0);
  }
}

function montarSlides(
  nomeMes: string, nomeAnterior: string, chaveMes: string,
  itens: LancamentoDetalhado[], anteriores: LancamentoDetalhado[], cofres: CofreResumo[], categorias: Categoria[],
): Slide[] {
  const gastos = itens.filter(ehGasto);
  const total = soma(gastos);
  const totalAnt = soma(anteriores.filter(ehGasto));
  const entradas = soma(itens.filter(ehEntrada));
  const slides: Slide[] = [
    {
      fundo: 'radial-gradient(120% 80% at 80% 0%, #cfff04 0%, #3f6212 40%, #09090b 80%)',
      sobre: 'Retrospectiva', grande: nomeMes, texto: 'Bora ver como foi o seu mês?', detalhe: 'Toque para avançar · segure para pausar',
    },
  ];
  if (!gastos.length) {
    slides.push({ fundo: 'linear-gradient(160deg, #27272a, #09090b)', sobre: nomeMes, grande: 'Mês tranquilo', texto: 'Nenhum gasto registrado neste mês.' });
    return slides;
  }

  const variacao = totalAnt ? Math.round(((total - totalAnt) / totalAnt) * 100) : null;
  slides.push({
    fundo: 'radial-gradient(120% 90% at 0% 100%, #7c3aed 0%, #2e1065 45%, #09090b 85%)',
    sobre: 'Você gastou', grande: reais(total),
    texto: variacao === null ? `em ${gastos.length} lançamentos.` : variacao > 0 ? `${variacao}% a mais que em ${nomeAnterior}.` : variacao < 0 ? `${-variacao}% a menos que em ${nomeAnterior}. Mandou bem!` : `o mesmo que em ${nomeAnterior}.`,
    detalhe: entradas ? `Entraram ${reais(entradas)} além do salário.` : undefined,
  });

  const porCat = new Map<string, number>();
  for (const l of gastos) porCat.set(l.compra.categoria?.nome ?? 'Sem categoria', (porCat.get(l.compra.categoria?.nome ?? 'Sem categoria') ?? 0) + l.valor);
  const [campea, valorCampea] = [...porCat].sort((a, b) => b[1] - a[1])[0];
  slides.push({
    fundo: 'radial-gradient(120% 90% at 100% 0%, #0ea5e9 0%, #0c4a6e 45%, #09090b 85%)',
    sobre: 'Categoria campeã', grande: campea,
    texto: `${reais(valorCampea)} — ${Math.round((valorCampea / total) * 100)}% de tudo que saiu.`,
  });

  const maior = [...gastos].sort((a, b) => b.valor - a.valor)[0];
  slides.push({
    fundo: 'radial-gradient(120% 90% at 0% 0%, #f97316 0%, #7c2d12 45%, #09090b 85%)',
    sobre: 'Maior gasto do mês', grande: reais(maior.valor),
    texto: maior.compra.descricao + (maior.total_parcelas > 1 ? ` (parcela ${maior.numero}/${maior.total_parcelas})` : '') + (maior.compra.estabelecimento ? ` · ${maior.compra.estabelecimento}` : ''),
  });

  const porDia = new Map<string, number>();
  for (const l of gastos) porDia.set(l.data_prevista, (porDia.get(l.data_prevista) ?? 0) + l.valor);
  const [diaTop, valorDia] = [...porDia].sort((a, b) => b[1] - a[1])[0];
  const { ano, mes, dia } = lerData(diaTop);
  slides.push({
    fundo: 'radial-gradient(120% 90% at 100% 100%, #ec4899 0%, #831843 45%, #09090b 85%)',
    sobre: 'O dia mais caro', grande: `${dia} de ${nomeMes.toLowerCase()}`,
    // sábado e domingo são masculinos: "Um sábado", "Uma segunda"
    texto: `Um${[0, 6].includes(new Date(ano, mes - 1, dia).getDay()) ? '' : 'a'} ${DIAS_SEMANA[new Date(ano, mes - 1, dia).getDay()]} de ${reais(valorDia)}.`,
  });

  const comLimite = categorias.filter((c) => c.limite);
  if (comLimite.length) {
    const cumpridos = comLimite.filter((c) => (porCat.get(c.nome) ?? 0) <= c.limite!);
    const estourados = comLimite.filter((c) => (porCat.get(c.nome) ?? 0) > c.limite!);
    slides.push({
      fundo: 'radial-gradient(120% 90% at 50% 0%, #22c55e 0%, #14532d 45%, #09090b 85%)',
      sobre: 'Limites', grande: `${cumpridos.length} de ${comLimite.length}`,
      texto: estourados.length ? `Passou do limite em: ${estourados.map((c) => c.nome).join(', ')}.` : 'Todos os limites respeitados!',
      festa: !estourados.length,
    });
  }

  const guardado = cofres.flatMap((c) => c.movimentos).filter((m) => m.data.startsWith(chaveMes)).reduce((t, m) => t + m.valor, 0);
  const metaBatida = cofres.find((c) => c.meta_valor && c.saldo >= c.meta_valor && c.movimentos.some((m) => m.data.startsWith(chaveMes)));
  if (guardado || cofres.length) {
    slides.push({
      fundo: 'radial-gradient(120% 90% at 0% 100%, #cfff04 0%, #365314 45%, #09090b 85%)',
      sobre: 'Nos cofres', grande: reais(Math.max(0, guardado)),
      texto: guardado > 0 ? `guardados em ${nomeMes.toLowerCase()}. Total nos cofres: ${reais(cofres.reduce((t, c) => t + c.saldo, 0))}.` : 'Nada guardado este mês. Que tal começar no próximo?',
      detalhe: metaBatida ? `Meta de "${metaBatida.nome}" batida! 🎉` : undefined,
      festa: !!metaBatida,
    });
  }

  slides.push({
    fundo: 'radial-gradient(120% 80% at 50% 100%, #a78bfa 0%, #3b0764 45%, #09090b 85%)',
    sobre: 'Fechou!', grande: 'Próximo mês 💪', texto: 'Seus números estão no painel e nos relatórios. Toque para sair.',
  });
  return slides;
}

function soma(l: LancamentoDetalhado[]) {
  return Math.round(l.reduce((t, x) => t + x.valor, 0) * 100) / 100;
}
