// Regras do "banco" do org-fin: um único documento JSON guardado no Netlify Blobs (ver netlify/functions/dados.mts).
// Aqui só tem código puro — recebe o banco, aplica uma ação e devolve o banco novo — para ser testado sem Netlify
// (operacoes.spec.mts). Tudo que chega do navegador é validado aqui; o servidor é quem calcula as parcelas.
import { gerarParcelas, type TipoConta } from '../../src/app/dominio/parcelamento.ts';

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
export interface Compra {
  id: number;
  descricao: string;
  estabelecimento: string;
  valor_total: number;
  parcelas: number;
  data_compra: string;
  categoria_id: number | null;
  conta_id: number | null;
  origem: 'manual' | 'ia';
  criado_em: string;
}
export interface Lancamento {
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

export type Acao =
  | { acao: 'salvarConfiguracao'; dados: Configuracao }
  | { acao: 'salvarCategoria'; dados: Partial<Categoria> & { nome: string; cor: string } }
  | { acao: 'criarCategorias'; dados: { nome: string; cor: string }[] }
  | { acao: 'excluirCategoria'; id: number }
  | { acao: 'salvarConta'; dados: Omit<ContaCartao, 'id'> & { id?: number } }
  | { acao: 'criarContas'; dados: Omit<ContaCartao, 'id'>[] }
  | { acao: 'excluirConta'; id: number }
  | { acao: 'salvarCompra'; dados: Omit<Compra, 'id' | 'criado_em'> & { id?: number } }
  | { acao: 'excluirCompra'; id: number }
  | { acao: 'restaurarBackup'; dados: Banco };

/** Erro de validação: vira HTTP 400 com a mensagem para a pessoa. */
export class ErroDeRegra extends Error {}

const TIPOS: TipoConta[] = ['dinheiro', 'pix', 'debito', 'credito', 'boleto'];

export function bancoVazio(): Banco {
  return { versao: 1, proximo_id: 1, configuracao: null, categorias: [], contas: [], compras: [], lancamentos: [] };
}

/** Aplica a ação numa CÓPIA do banco (se der erro no meio, nada fica pela metade). */
export function aplicar(atual: Banco, a: Acao, agora = new Date().toISOString()): Banco {
  const b: Banco = structuredClone(atual);
  const novoId = () => b.proximo_id++;

  switch (a.acao) {
    case 'salvarConfiguracao':
      b.configuracao = {
        renda_mensal: numero(a.dados.renda_mensal, 'Renda', 0),
        dia_salario: dia(a.dados.dia_salario),
        saldo_inicial: numero(a.dados.saldo_inicial, 'Saldo'),
      };
      break;

    case 'salvarCategoria': {
      const nome = texto(a.dados.nome, 'Nome da categoria');
      nomeUnico(b.categorias, nome, a.dados.id);
      const cor = /^#[0-9a-f]{6}$/i.test(a.dados.cor) ? a.dados.cor : '#64748b';
      if (a.dados.id) Object.assign(existe(b.categorias, a.dados.id, 'Categoria'), { nome, cor });
      else b.categorias.push({ id: novoId(), nome, cor });
      break;
    }

    case 'criarCategorias':
      // Primeiro acesso: repetir depois de um erro não duplica.
      for (const c of a.dados) {
        const nome = texto(c.nome, 'Nome da categoria');
        if (!b.categorias.some((x) => igual(x.nome, nome))) b.categorias.push({ id: novoId(), nome, cor: c.cor });
      }
      break;

    case 'excluirCategoria':
      // Gastos da categoria continuam, só ficam "sem categoria".
      b.categorias = b.categorias.filter((c) => c.id !== a.id);
      b.compras.forEach((c) => c.categoria_id === a.id && (c.categoria_id = null));
      break;

    case 'salvarConta': {
      const conta = conta_(a.dados);
      nomeUnico(b.contas, conta.nome, a.dados.id);
      if (a.dados.id) Object.assign(existe(b.contas, a.dados.id, 'Forma de pagamento'), conta);
      else b.contas.push({ id: novoId(), ...conta });
      break;
    }

    case 'criarContas':
      for (const c of a.dados) {
        const conta = conta_(c);
        if (!b.contas.some((x) => igual(x.nome, conta.nome))) b.contas.push({ id: novoId(), ...conta });
      }
      break;

    case 'excluirConta':
      b.contas = b.contas.filter((c) => c.id !== a.id);
      b.compras.forEach((c) => c.conta_id === a.id && (c.conta_id = null));
      break;

    case 'salvarCompra': {
      const d = a.dados;
      const categoria_id = d.categoria_id && b.categorias.some((c) => c.id === d.categoria_id) ? d.categoria_id : null;
      const conta_id = d.conta_id && b.contas.some((c) => c.id === d.conta_id) ? d.conta_id : null;
      const dados = {
        descricao: texto(d.descricao, 'Descrição'),
        estabelecimento: (d.estabelecimento ?? '').trim().slice(0, 120),
        valor_total: numero(d.valor_total, 'Valor total', 0.01),
        parcelas: Number(d.parcelas),
        data_compra: data(d.data_compra),
        categoria_id,
        conta_id,
        origem: d.origem === 'ia' ? ('ia' as const) : ('manual' as const),
      };
      let parcelas;
      try {
        parcelas = gerarParcelas(dados.valor_total, dados.parcelas, dados.data_compra, b.contas.find((c) => c.id === conta_id) ?? null);
      } catch (e) {
        throw new ErroDeRegra((e as Error).message);
      }
      let id: number;
      if (d.id) {
        Object.assign(existe(b.compras, d.id, 'Gasto'), dados);
        id = d.id;
        b.lancamentos = b.lancamentos.filter((l) => l.compra_id !== id); // parcelas são refeitas juntas
      } else {
        id = novoId();
        b.compras.push({ id, ...dados, criado_em: agora });
      }
      for (const p of parcelas) b.lancamentos.push({ id: novoId(), compra_id: id, ...p });
      break;
    }

    case 'excluirCompra':
      b.compras = b.compras.filter((c) => c.id !== a.id);
      b.lancamentos = b.lancamentos.filter((l) => l.compra_id !== a.id);
      break;

    case 'restaurarBackup':
      return validarBackup(a.dados);

    default:
      throw new ErroDeRegra('Ação desconhecida.');
  }
  return b;
}

/** Confere o arquivo de backup antes de trocar tudo por ele. */
export function validarBackup(x: unknown): Banco {
  const b = x as Banco;
  const lista = (v: unknown) => Array.isArray(v);
  if (!b || b.versao !== 1 || !lista(b.categorias) || !lista(b.contas) || !lista(b.compras) || !lista(b.lancamentos)) {
    throw new ErroDeRegra('Arquivo de backup inválido.');
  }
  const maiorId = Math.max(0, ...[b.categorias, b.contas, b.compras, b.lancamentos].flat().map((r: { id: number }) => r.id));
  return { ...b, proximo_id: Math.max(b.proximo_id || 1, maiorId + 1) };
}

// --- validações ---

function texto(v: unknown, campo: string): string {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) throw new ErroDeRegra(`${campo}: preencha.`);
  return t.slice(0, 120);
}

function numero(v: unknown, campo: string, minimo?: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || (minimo !== undefined && n < minimo)) throw new ErroDeRegra(`${campo}: valor inválido.`);
  return Math.round(n * 100) / 100;
}

function dia(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === '' || v === undefined || !Number.isInteger(n) || n < 1 || n > 31 ? null : n;
}

function data(v: unknown): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErroDeRegra('Data inválida.');
  return v;
}

function conta_(c: Omit<ContaCartao, 'id'>): Omit<ContaCartao, 'id'> {
  if (!TIPOS.includes(c.tipo)) throw new ErroDeRegra('Tipo de pagamento inválido.');
  const credito = c.tipo === 'credito';
  return {
    nome: texto(c.nome, 'Nome'),
    tipo: c.tipo,
    // Fechamento/vencimento só valem no crédito (regra em src/app/dominio/parcelamento.ts).
    dia_fechamento: credito ? dia(c.dia_fechamento) : null,
    dia_vencimento: credito ? dia(c.dia_vencimento) : null,
  };
}

function igual(a: string, b: string) {
  return a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');
}

function nomeUnico(lista: { id: number; nome: string }[], nome: string, id?: number) {
  if (lista.some((x) => x.id !== id && igual(x.nome, nome))) throw new ErroDeRegra(`Já existe "${nome}".`);
}

function existe<T extends { id: number }>(lista: T[], id: number, oque: string): T {
  const achado = lista.find((x) => x.id === id);
  if (!achado) throw new ErroDeRegra(`${oque} não encontrado.`);
  return achado;
}
