// Acesso aos dados. O servidor (netlify/functions/dados.mts) guarda tudo num documento só; aqui o app baixa esse
// documento uma vez, guarda em memória e monta as listas que as telas pedem. Toda alteração vai para o servidor,
// que valida, calcula as parcelas e devolve o documento atualizado.
// Os tipos espelham netlify/lib/operacoes.mts — mudou lá, mude aqui.
//
// "Itens" do mês (LancamentoDetalhado) juntam três origens numa lista só, para calendário/painel/relatórios:
//   - parcelas de compras ('compra'), - ocorrências de fixos ('fixo', gasto ou entrada), - entradas avulsas ('entrada').
// Use ehGasto()/ehEntrada() para somar certo.
import { Injectable, signal } from '@angular/core';
import { Parcela, TipoConta, gerarParcelas } from '../dominio/parcelamento';
import { ocorrencias } from '../dominio/recorrencia';
import { chamar } from './api';

export interface Configuracao {
  nome?: string | null;
  renda_mensal: number;
  dia_salario: number | null;
  saldo_inicial: number;
}

export interface Categoria {
  id: number;
  nome: string;
  cor: string;
  limite?: number | null;
}

export interface ContaCartao {
  id: number;
  nome: string;
  tipo: TipoConta;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}

export interface CompraForm {
  id?: number;
  descricao: string;
  estabelecimento: string;
  valor_total: number;
  parcelas: number;
  data_compra: string;
  categoria_id: number | null;
  conta_id: number | null;
  origem: 'manual' | 'ia';
  /** Data em que a 1ª parcela vence, se a pessoa informou; vazio = regra do cartão. */
  primeira_parcela?: string | null;
}

interface Compra extends CompraForm {
  id: number;
  criado_em: string;
}

interface Lancamento {
  id: number;
  compra_id: number;
  numero: number;
  total_parcelas: number;
  valor: number;
  competencia: string;
  data_prevista: string;
}

export interface Recorrente {
  id?: number;
  tipo: 'gasto' | 'entrada';
  descricao: string;
  estabelecimento: string;
  valor: number;
  dia: number;
  inicio: string;
  fim: string | null;
  categoria_id: number | null;
  conta_id: number | null;
  ativo: boolean;
}

export interface Entrada {
  id?: number;
  descricao: string;
  valor: number;
  data: string;
}

export interface Cofre {
  id?: number;
  nome: string;
  cor: string;
  meta_valor: number | null;
  meta_data: string | null;
}

export interface MovimentoCofre {
  id?: number;
  cofre_id: number;
  valor: number;
  data: string;
  nota: string;
}

/** Cofre com o saldo e o histórico já calculados. */
export interface CofreResumo extends Cofre {
  id: number;
  saldo: number;
  movimentos: (MovimentoCofre & { id: number })[];
}

export interface Banco {
  versao: 1;
  proximo_id: number;
  configuracao: Configuracao | null;
  categorias: Categoria[];
  contas: ContaCartao[];
  compras: Compra[];
  lancamentos: Lancamento[];
  recorrentes: (Recorrente & { id: number })[];
  entradas: (Entrada & { id: number })[];
  cofres: (Cofre & { id: number })[];
  movimentos_cofre: (MovimentoCofre & { id: number })[];
  pagamentos: Record<string, string>;
}

/** Um item do mês: parcela de compra, ocorrência de fixo ou entrada. */
export interface LancamentoDetalhado {
  /** Única e estável: 'l:<parcela>', 'r:<fixo>:AAAA-MM', 'e:<entrada>'. Também é a chave do "pago". */
  chave: string;
  tipo: 'compra' | 'fixo' | 'entrada';
  /** Entrada de dinheiro (entrada avulsa ou fixo do tipo entrada). */
  entra: boolean;
  id: number;
  numero: number;
  total_parcelas: number;
  valor: number;
  competencia: string;
  data_prevista: string;
  /** Data em que foi marcado como pago/recebido, ou null. */
  pago: string | null;
  /** Para onde ir ao tocar no item. */
  rota: (string | number)[];
  compra: {
    id: number;
    descricao: string;
    estabelecimento: string | null;
    valor_total: number;
    categoria: { nome: string; cor: string } | null;
    conta_cartao: { id: number; nome: string } | null;
  };
}

export const ehGasto = (l: LancamentoDetalhado) => !l.entra;
export const ehEntrada = (l: LancamentoDetalhado) => l.entra;

export const TIPOS_CONTA: { valor: TipoConta; rotulo: string }[] = [
  { valor: 'credito', rotulo: 'Cartão de crédito' },
  { valor: 'debito', rotulo: 'Débito' },
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'boleto', rotulo: 'Boleto / carnê' },
];

export const CATEGORIAS_SUGERIDAS: { nome: string; cor: string }[] = [
  { nome: 'Mercado', cor: '#16a34a' },
  { nome: 'Moradia', cor: '#2563eb' },
  { nome: 'Contas da casa', cor: '#0891b2' },
  { nome: 'Transporte', cor: '#ea580c' },
  { nome: 'Alimentação fora', cor: '#dc2626' },
  { nome: 'Saúde', cor: '#db2777' },
  { nome: 'Educação', cor: '#7c3aed' },
  { nome: 'Lazer', cor: '#ca8a04' },
  { nome: 'Eletrodomésticos', cor: '#475569' },
  { nome: 'Eletrônicos', cor: '#0ea5e9' },
  { nome: 'Vestuário', cor: '#9333ea' },
  { nome: 'Assinaturas', cor: '#e11d48' },
  { nome: 'Outros', cor: '#64748b' },
];

const COR_ENTRADA = '#cfff04';

@Injectable({ providedIn: 'root' })
export class Dados {
  private cache: Promise<Banco> | null = null;
  private baixadoEm = 0;
  /** Muda sempre que os dados mudam (gravação aqui ou dados novos do servidor): as telas recarregam ao ver isso. */
  readonly versao = signal(0);
  /** Vira true quando o documento chega pela primeira vez: até lá as telas mostram o "esqueleto" brilhando. */
  readonly pronto = signal(false);

  /** Documento inteiro (baixa na primeira vez; depois usa a cópia em memória). */
  banco(): Promise<Banco> {
    this.cache ??= chamar<Banco>('dados').then(
      (b) => {
        this.baixadoEm = Date.now();
        this.pronto.set(true);
        return b;
      },
      (e) => {
        this.cache = null; // erro de rede não pode ficar guardado
        throw e;
      },
    );
    return this.cache;
  }

  /** Força baixar de novo (ex.: outro aparelho pode ter lançado algo). */
  async recarregar(): Promise<Banco> {
    this.cache = null;
    const b = await this.banco();
    this.versao.update((v) => v + 1);
    return b;
  }

  /** Ao voltar para o app: se a cópia em memória tem mais de 1 minuto, busca de novo (celular + computador). */
  async atualizarSeAntigo(): Promise<void> {
    if (this.cache && Date.now() - this.baixadoEm > 60_000) await this.recarregar().catch(() => {});
  }

  private async enviar(acao: object): Promise<Banco> {
    const novo = await chamar<Banco>('dados', { corpo: acao });
    this.cache = Promise.resolve(novo);
    this.baixadoEm = Date.now();
    this.versao.update((v) => v + 1);
    return novo;
  }

  // ---------- configuração ----------
  async configuracao(): Promise<Configuracao | null> {
    return (await this.banco()).configuracao;
  }

  async salvarConfiguracao(dados: Configuracao): Promise<void> {
    await this.enviar({ acao: 'salvarConfiguracao', dados });
  }

  // ---------- categorias ----------
  async categorias(): Promise<Categoria[]> {
    return [...(await this.banco()).categorias].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async salvarCategoria(dados: Partial<Categoria> & { nome: string; cor: string }): Promise<void> {
    await this.enviar({ acao: 'salvarCategoria', dados });
  }

  async criarCategorias(dados: { nome: string; cor: string }[]): Promise<void> {
    if (dados.length) await this.enviar({ acao: 'criarCategorias', dados });
  }

  async excluirCategoria(id: number): Promise<void> {
    await this.enviar({ acao: 'excluirCategoria', id });
  }

  // ---------- contas e cartões ----------
  async contas(): Promise<ContaCartao[]> {
    return [...(await this.banco()).contas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async salvarConta(dados: Omit<ContaCartao, 'id'> & { id?: number }): Promise<void> {
    await this.enviar({ acao: 'salvarConta', dados });
  }

  /** Primeiro acesso: repetir depois de um erro não duplica (o servidor ignora nomes já existentes). */
  async criarContas(dados: Omit<ContaCartao, 'id'>[]): Promise<void> {
    if (dados.length) await this.enviar({ acao: 'criarContas', dados });
  }

  async excluirConta(id: number): Promise<void> {
    await this.enviar({ acao: 'excluirConta', id });
  }

  // ---------- compras e parcelas ----------
  async compra(id: number): Promise<CompraForm | null> {
    const c = (await this.banco()).compras.find((x) => x.id === id);
    return c ? { ...c } : null;
  }

  /** O servidor recalcula as parcelas com a mesma regra; a prévia é só para mostrar antes de salvar. */
  async salvarCompra(dados: CompraForm): Promise<void> {
    await this.enviar({ acao: 'salvarCompra', dados });
  }

  previaParcelas(
    compra: Pick<CompraForm, 'valor_total' | 'parcelas' | 'data_compra' | 'conta_id' | 'primeira_parcela'>,
    contas: ContaCartao[],
  ): Parcela[] {
    const conta = contas.find((c) => c.id === compra.conta_id) ?? null;
    return gerarParcelas(compra.valor_total, compra.parcelas, compra.data_compra, conta, compra.primeira_parcela || null);
  }

  /** Exclui e devolve os dados da compra, para o "Desfazer" poder recriar. */
  async excluirCompra(id: number): Promise<CompraForm | null> {
    const antes = await this.compra(id);
    await this.enviar({ acao: 'excluirCompra', id });
    return antes;
  }

  // ---------- fixos (recorrentes) e entradas ----------
  async recorrentes(): Promise<(Recorrente & { id: number })[]> {
    return [...(await this.banco()).recorrentes].sort((a, b) => a.dia - b.dia || a.descricao.localeCompare(b.descricao, 'pt-BR'));
  }

  /** Um ou vários de uma vez (cadastro em massa). */
  async salvarRecorrentes(dados: Recorrente[]): Promise<void> {
    await this.enviar({ acao: 'salvarRecorrentes', dados });
  }

  async excluirRecorrente(id: number): Promise<void> {
    await this.enviar({ acao: 'excluirRecorrente', id });
  }

  async entradas(): Promise<(Entrada & { id: number })[]> {
    return [...(await this.banco()).entradas].sort((a, b) => b.data.localeCompare(a.data));
  }

  async salvarEntrada(dados: Entrada): Promise<void> {
    await this.enviar({ acao: 'salvarEntrada', dados });
  }

  async excluirEntrada(id: number): Promise<void> {
    await this.enviar({ acao: 'excluirEntrada', id });
  }

  // ---------- cofres ----------
  async cofres(): Promise<CofreResumo[]> {
    const b = await this.banco();
    return b.cofres.map((c) => {
      const movimentos = b.movimentos_cofre.filter((m) => m.cofre_id === c.id).sort((x, y) => y.data.localeCompare(x.data) || y.id - x.id);
      return { ...c, movimentos, saldo: arred(movimentos.reduce((t, m) => t + m.valor, 0)) };
    });
  }

  async salvarCofre(dados: Cofre): Promise<void> {
    await this.enviar({ acao: 'salvarCofre', dados });
  }

  async excluirCofre(id: number): Promise<void> {
    await this.enviar({ acao: 'excluirCofre', id });
  }

  async movimentarCofre(dados: MovimentoCofre): Promise<void> {
    await this.enviar({ acao: 'movimentarCofre', dados });
  }

  async excluirMovimento(id: number): Promise<void> {
    await this.enviar({ acao: 'excluirMovimento', id });
  }

  // ---------- pago ----------
  async marcarPago(chaves: string[], pago: boolean): Promise<void> {
    if (chaves.length) await this.enviar({ acao: 'marcarPago', chaves, pago });
  }

  // ---------- itens do mês ----------
  /** Tudo que cai no calendário entre duas datas (inclusive): parcelas, fixos e entradas. */
  async lancamentosPorData(de: string, ate: string): Promise<LancamentoDetalhado[]> {
    const itens = this.itens(await this.banco(), `${de.slice(0, 7)}-01`, `${ate.slice(0, 7)}-01`);
    return itens.filter((l) => l.data_prevista >= de && l.data_prevista <= ate);
  }

  /** Por mês de competência (painel/relatórios), de 'AAAA-MM-01' até 'AAAA-MM-01'. */
  async lancamentosPorCompetencia(de: string, ate: string): Promise<LancamentoDetalhado[]> {
    return this.itens(await this.banco(), de, ate);
  }

  // ---------- backup ----------
  async backup(): Promise<Banco> {
    return this.recarregar();
  }

  async restaurar(dados: unknown): Promise<void> {
    await this.enviar({ acao: 'restaurarBackup', dados });
  }

  /** Junta as três origens do mês, com categoria/cartão/pago, ordenado por dia. */
  private itens(b: Banco, de: string, ate: string): LancamentoDetalhado[] {
    const compras = new Map(b.compras.map((c) => [c.id, c]));
    const categorias = new Map(b.categorias.map((c) => [c.id, c]));
    const contas = new Map(b.contas.map((c) => [c.id, c]));
    const pagos = b.pagamentos ?? {};
    const cat = (id: number | null) => {
      const c = id ? categorias.get(id) : undefined;
      return c ? { nome: c.nome, cor: c.cor } : null;
    };
    const conta = (id: number | null) => {
      const c = id ? contas.get(id) : undefined;
      return c ? { id: c.id, nome: c.nome } : null;
    };
    const saida: LancamentoDetalhado[] = [];

    for (const l of b.lancamentos) {
      if (l.competencia < de || l.competencia > ate) continue;
      const c = compras.get(l.compra_id);
      if (!c) continue;
      const chave = `l:${l.id}`;
      saida.push({
        chave, tipo: 'compra', entra: false, id: l.id, numero: l.numero, total_parcelas: l.total_parcelas, valor: l.valor,
        competencia: l.competencia, data_prevista: l.data_prevista, pago: pagos[chave] ?? null, rota: ['/gasto', c.id],
        compra: {
          id: c.id, descricao: c.descricao, estabelecimento: c.estabelecimento || null, valor_total: c.valor_total,
          categoria: cat(c.categoria_id), conta_cartao: conta(c.conta_id),
        },
      });
    }

    for (const r of b.recorrentes ?? []) {
      for (const o of ocorrencias(r, de, ate)) {
        const entra = r.tipo === 'entrada';
        saida.push({
          chave: o.chave, tipo: 'fixo', entra, id: r.id, numero: 1, total_parcelas: 1, valor: r.valor,
          competencia: o.competencia, data_prevista: o.data_prevista, pago: pagos[o.chave] ?? null, rota: ['/fixos'],
          compra: {
            id: r.id, descricao: r.descricao, estabelecimento: r.estabelecimento || null, valor_total: r.valor,
            categoria: entra ? { nome: 'Entrada fixa', cor: COR_ENTRADA } : cat(r.categoria_id), conta_cartao: conta(r.conta_id),
          },
        });
      }
    }

    for (const e of b.entradas ?? []) {
      const competencia = `${e.data.slice(0, 7)}-01`;
      if (competencia < de || competencia > ate) continue;
      const chave = `e:${e.id}`;
      saida.push({
        chave, tipo: 'entrada', entra: true, id: e.id, numero: 1, total_parcelas: 1, valor: e.valor,
        competencia, data_prevista: e.data, pago: pagos[chave] ?? null, rota: ['/fixos'],
        compra: { id: e.id, descricao: e.descricao, estabelecimento: null, valor_total: e.valor, categoria: { nome: 'Entrada', cor: COR_ENTRADA }, conta_cartao: null },
      });
    }

    return saida.sort((a, b) => a.data_prevista.localeCompare(b.data_prevista) || a.chave.localeCompare(b.chave));
  }
}

function arred(v: number) {
  return Math.round(v * 100) / 100;
}
