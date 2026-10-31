// Acesso às tabelas do Supabase (ver supabase/schema.sql). As telas não falam com o banco direto: passam por aqui.
// usuario_id não é enviado — o banco preenche com auth.uid() e a RLS impede mexer em dados de outra pessoa.
import { Injectable } from '@angular/core';
import { Parcela, TipoConta, gerarParcelas } from '../dominio/parcelamento';
import { supabase } from './supabase';

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
    conta_cartao: { nome: string } | null;
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

const SELECT_LANCAMENTO =
  'id, numero, total_parcelas, valor, competencia, data_prevista, ' +
  'compra(id, descricao, estabelecimento, valor_total, categoria(nome, cor), conta_cartao(nome))';

@Injectable({ providedIn: 'root' })
export class Dados {
  // ---------- configuração ----------
  async configuracao(): Promise<Configuracao | null> {
    const { data, error } = await supabase.from('configuracao').select('renda_mensal, dia_salario, saldo_inicial').maybeSingle();
    if (error) throw error;
    return data;
  }

  async salvarConfiguracao(c: Configuracao): Promise<void> {
    const { error } = await supabase.from('configuracao').upsert(c);
    if (error) throw error;
  }

  // ---------- categorias ----------
  async categorias(): Promise<Categoria[]> {
    const { data, error } = await supabase.from('categoria').select('id, nome, cor').order('nome');
    if (error) throw error;
    return data;
  }

  async salvarCategoria(c: Partial<Categoria> & { nome: string; cor: string }): Promise<void> {
    const { error } = c.id
      ? await supabase.from('categoria').update({ nome: c.nome, cor: c.cor }).eq('id', c.id)
      : await supabase.from('categoria').insert({ nome: c.nome, cor: c.cor });
    if (error) throw error;
  }

  async criarCategorias(lista: { nome: string; cor: string }[]): Promise<void> {
    if (!lista.length) return;
    const { error } = await supabase.from('categoria').upsert(lista, { onConflict: 'usuario_id,nome', ignoreDuplicates: true });
    if (error) throw error;
  }

  async excluirCategoria(id: number): Promise<void> {
    const { error } = await supabase.from('categoria').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- contas e cartões ----------
  async contas(): Promise<ContaCartao[]> {
    const { data, error } = await supabase
      .from('conta_cartao')
      .select('id, nome, tipo, dia_fechamento, dia_vencimento')
      .order('nome');
    if (error) throw error;
    return data as ContaCartao[];
  }

  async salvarConta(c: Omit<ContaCartao, 'id'> & { id?: number }): Promise<void> {
    // Fechamento/vencimento só fazem sentido no crédito (regra em dominio/parcelamento.ts).
    const registro = {
      nome: c.nome,
      tipo: c.tipo,
      dia_fechamento: c.tipo === 'credito' ? c.dia_fechamento || null : null,
      dia_vencimento: c.tipo === 'credito' ? c.dia_vencimento || null : null,
    };
    const { error } = c.id
      ? await supabase.from('conta_cartao').update(registro).eq('id', c.id)
      : await supabase.from('conta_cartao').insert(registro);
    if (error) throw error;
  }

  /** Usado no primeiro acesso: se a pessoa tentar de novo depois de um erro, não duplica nem falha. */
  async criarContas(lista: Omit<ContaCartao, 'id'>[]): Promise<void> {
    if (!lista.length) return;
    const registros = lista.map((c) => ({
      nome: c.nome,
      tipo: c.tipo,
      dia_fechamento: c.tipo === 'credito' ? c.dia_fechamento || null : null,
      dia_vencimento: c.tipo === 'credito' ? c.dia_vencimento || null : null,
    }));
    const { error } = await supabase.from('conta_cartao').upsert(registros, { onConflict: 'usuario_id,nome', ignoreDuplicates: true });
    if (error) throw error;
  }

  async excluirConta(id: number): Promise<void> {
    const { error } = await supabase.from('conta_cartao').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- compras e parcelas ----------
  async compra(id: number): Promise<CompraForm | null> {
    const { data, error } = await supabase
      .from('compra')
      .select('id, descricao, estabelecimento, valor_total, parcelas, data_compra, categoria_id, conta_id, origem')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? { ...data, estabelecimento: data.estabelecimento ?? '', valor_total: Number(data.valor_total) } : null;
  }

  /** Calcula as parcelas e grava tudo de uma vez (função salvar_compra no banco). */
  async salvarCompra(compra: CompraForm, contas: ContaCartao[]): Promise<number> {
    const parcelas = this.previaParcelas(compra, contas);
    const { data, error } = await supabase.rpc('salvar_compra', { p_compra: compra, p_lancamentos: parcelas });
    if (error) throw error;
    return data as number;
  }

  previaParcelas(compra: Pick<CompraForm, 'valor_total' | 'parcelas' | 'data_compra' | 'conta_id'>, contas: ContaCartao[]): Parcela[] {
    const conta = contas.find((c) => c.id === compra.conta_id) ?? null;
    return gerarParcelas(compra.valor_total, compra.parcelas, compra.data_compra, conta);
  }

  async excluirCompra(id: number): Promise<void> {
    // As parcelas vão junto (on delete cascade).
    const { error } = await supabase.from('compra').delete().eq('id', id);
    if (error) throw error;
  }

  /** Parcelas que caem no calendário entre duas datas (inclusive). */
  async lancamentosPorData(de: string, ate: string): Promise<LancamentoDetalhado[]> {
    const { data, error } = await supabase
      .from('lancamento')
      .select(SELECT_LANCAMENTO)
      .gte('data_prevista', de)
      .lte('data_prevista', ate)
      .order('data_prevista');
    if (error) throw error;
    return normalizar(data);
  }

  /** Parcelas por mês de competência (painel), de 'AAAA-MM-01' até 'AAAA-MM-01'. */
  async lancamentosPorCompetencia(de: string, ate: string): Promise<LancamentoDetalhado[]> {
    const { data, error } = await supabase
      .from('lancamento')
      .select(SELECT_LANCAMENTO)
      .gte('competencia', de)
      .lte('competencia', ate)
      .order('competencia');
    if (error) throw error;
    return normalizar(data);
  }
}

// numeric do Postgres chega como texto em alguns casos; normaliza para número.
function normalizar(linhas: unknown): LancamentoDetalhado[] {
  return (linhas as LancamentoDetalhado[]).map((l) => ({
    ...l,
    valor: Number(l.valor),
    compra: { ...l.compra, valor_total: Number(l.compra.valor_total) },
  }));
}
