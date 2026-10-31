// Acesso aos dados. O servidor (netlify/functions/dados.mts) guarda tudo num documento só; aqui o app baixa esse
// documento uma vez, guarda em memória e monta as listas que as telas pedem. Toda alteração vai para o servidor,
// que valida, calcula as parcelas e devolve o documento atualizado.
// Os tipos espelham netlify/lib/operacoes.mts — mudou lá, mude aqui.
import { Injectable } from '@angular/core';
import { Parcela, TipoConta, gerarParcelas } from '../dominio/parcelamento';
import { chamar } from './api';

export interface Configuracao {
  renda_mensal: number;
  dia_salario: number | null;
  saldo_inicial: number;
}

export interface Categoria {
  id: number;
  nome: string;
  cor: string;
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

export interface Banco {
  versao: 1;
  proximo_id: number;
  configuracao: Configuracao | null;
  categorias: Categoria[];
  contas: ContaCartao[];
  compras: Compra[];
  lancamentos: Lancamento[];
}

/** Parcela já com os dados da compra, pronta para o calendário e o painel. */
export interface LancamentoDetalhado {
  id: number;
  numero: number;
  total_parcelas: number;
  valor: number;
  competencia: string;
  data_prevista: string;
  compra: {
    id: number;
    descricao: string;
    estabelecimento: string | null;
    valor_total: number;
    categoria: { nome: string; cor: string } | null;
    conta_cartao: { id: number; nome: string } | null;
  };
}

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
  { nome: 'Vestuário', cor: '#9333ea' },
  { nome: 'Outros', cor: '#64748b' },
];

@Injectable({ providedIn: 'root' })
export class Dados {
  private cache: Promise<Banco> | null = null;

  /** Documento inteiro (baixa na primeira vez; depois usa a cópia em memória). */
  banco(): Promise<Banco> {
    this.cache ??= chamar<Banco>('dados').catch((e) => {
      this.cache = null; // erro de rede não pode ficar guardado
      throw e;
    });
    return this.cache;
  }

  /** Força baixar de novo (ex.: outro aparelho pode ter lançado algo). */
  recarregar(): Promise<Banco> {
    this.cache = null;
    return this.banco();
  }

  private async enviar(acao: object): Promise<Banco> {
    const novo = await chamar<Banco>('dados', { corpo: acao });
    this.cache = Promise.resolve(novo);
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

  previaParcelas(compra: Pick<CompraForm, 'valor_total' | 'parcelas' | 'data_compra' | 'conta_id'>, contas: ContaCartao[]): Parcela[] {
    const conta = contas.find((c) => c.id === compra.conta_id) ?? null;
    return gerarParcelas(compra.valor_total, compra.parcelas, compra.data_compra, conta);
  }

  async excluirCompra(id: number): Promise<void> {
    await this.enviar({ acao: 'excluirCompra', id });
  }

  /** Parcelas que caem no calendário entre duas datas (inclusive). */
  async lancamentosPorData(de: string, ate: string): Promise<LancamentoDetalhado[]> {
    return this.detalhar(await this.banco(), (l) => l.data_prevista >= de && l.data_prevista <= ate);
  }

  /** Parcelas por mês de competência (painel), de 'AAAA-MM-01' até 'AAAA-MM-01'. */
  async lancamentosPorCompetencia(de: string, ate: string): Promise<LancamentoDetalhado[]> {
    return this.detalhar(await this.banco(), (l) => l.competencia >= de && l.competencia <= ate);
  }

  // ---------- backup ----------
  async backup(): Promise<Banco> {
    return this.recarregar();
  }

  async restaurar(dados: unknown): Promise<void> {
    await this.enviar({ acao: 'restaurarBackup', dados });
  }

  /** Junta parcela + compra + categoria + cartão, ordenado por dia. */
  private detalhar(b: Banco, filtro: (l: Lancamento) => boolean): LancamentoDetalhado[] {
    const compras = new Map(b.compras.map((c) => [c.id, c]));
    const categorias = new Map(b.categorias.map((c) => [c.id, c]));
    const contas = new Map(b.contas.map((c) => [c.id, c]));
    return b.lancamentos
      .filter(filtro)
      .flatMap((l) => {
        const c = compras.get(l.compra_id);
        if (!c) return [];
        const cat = c.categoria_id ? categorias.get(c.categoria_id) : undefined;
        const conta = c.conta_id ? contas.get(c.conta_id) : undefined;
        return [{
          id: l.id, numero: l.numero, total_parcelas: l.total_parcelas, valor: l.valor,
          competencia: l.competencia, data_prevista: l.data_prevista,
          compra: {
            id: c.id, descricao: c.descricao, estabelecimento: c.estabelecimento || null, valor_total: c.valor_total,
            categoria: cat ? { nome: cat.nome, cor: cat.cor } : null,
            conta_cartao: conta ? { id: conta.id, nome: conta.nome } : null,
          },
        }];
      })
      .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista) || a.id - b.id);
  }
}
