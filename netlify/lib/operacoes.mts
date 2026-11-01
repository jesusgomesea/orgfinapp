// Regras do "banco" do org-fin: um único documento JSON guardado no Netlify Blobs (ver netlify/functions/dados.mts).
// Aqui só tem código puro — recebe o banco, aplica uma ação e devolve o banco novo — para ser testado sem Netlify
// (operacoes.spec.mts). Tudo que chega do navegador é validado aqui; o servidor é quem calcula as parcelas.
//
// Conteúdo do banco:
//  - compras + lancamentos: gastos avulsos/parcelados (as parcelas são gravadas);
//  - recorrentes: gastos e entradas FIXOS, guardados como regra (ver src/app/dominio/recorrencia.ts);
//  - entradas: dinheiro que entrou uma vez (freela, reembolso, 13º);
//  - cofres + movimentos_cofre: poupanças com meta opcional ("Casa", "Futuro") e o histórico de quanto foi guardado;
//  - pagamentos: o que já foi pago/recebido, pela chave da ocorrência ('l:<lancamento>', 'r:<regra>:AAAA-MM', 'e:<entrada>').
// Bancos antigos não têm as listas novas: normalizar() completa com listas vazias.
import { gerarParcelas, type TipoConta } from '../../src/app/dominio/parcelamento.ts';

export interface Configuracao {
  /** Como o app chama a pessoa na saudação ("Boa noite, Eluan"). */
  nome?: string | null;
  renda_mensal: number;
  dia_salario: number | null;
  saldo_inicial: number;
}
export interface Categoria {
  id: number;
  nome: string;
  cor: string;
  /** Limite de gasto por mês nesta categoria (alerta a partir de 80%). null = sem limite. */
  limite?: number | null;
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
  /** Quando a 1ª parcela vence, se a pessoa informou (carnê, boleto). null = regra do cartão. */
  primeira_parcela?: string | null;
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
export interface Recorrente {
  id: number;
  tipo: 'gasto' | 'entrada';
  descricao: string;
  estabelecimento: string;
  valor: number;
  dia: number;
  inicio: string; // AAAA-MM
  fim: string | null; // AAAA-MM
  categoria_id: number | null;
  conta_id: number | null;
  ativo: boolean;
}
export interface Entrada {
  id: number;
  descricao: string;
  valor: number;
  data: string;
}
export interface Cofre {
  id: number;
  nome: string;
  cor: string;
  meta_valor: number | null;
  meta_data: string | null; // AAAA-MM-DD
}
export interface MovimentoCofre {
  id: number;
  cofre_id: number;
  /** Positivo = guardou; negativo = retirou. */
  valor: number;
  data: string;
  nota: string;
}
export interface Banco {
  versao: 1;
  proximo_id: number;
  configuracao: Configuracao | null;
  categorias: Categoria[];
  contas: ContaCartao[];
  compras: Compra[];
  lancamentos: Lancamento[];
  recorrentes: Recorrente[];
  entradas: Entrada[];
  cofres: Cofre[];
  movimentos_cofre: MovimentoCofre[];
  pagamentos: Record<string, string>;
}

type SemId<T> = Omit<T, 'id'> & { id?: number };

export type Acao =
  | { acao: 'salvarConfiguracao'; dados: Configuracao }
  | { acao: 'salvarCategoria'; dados: Partial<Categoria> & { nome: string; cor: string } }
  | { acao: 'criarCategorias'; dados: { nome: string; cor: string }[] }
  | { acao: 'excluirCategoria'; id: number }
  | { acao: 'salvarConta'; dados: SemId<ContaCartao> }
  | { acao: 'criarContas'; dados: Omit<ContaCartao, 'id'>[] }
  | { acao: 'excluirConta'; id: number }
  | { acao: 'salvarCompra'; dados: Omit<Compra, 'id' | 'criado_em'> & { id?: number } }
  | { acao: 'excluirCompra'; id: number }
  | { acao: 'salvarRecorrentes'; dados: SemId<Recorrente>[] }
  | { acao: 'excluirRecorrente'; id: number }
  | { acao: 'salvarEntrada'; dados: SemId<Entrada> }
  | { acao: 'excluirEntrada'; id: number }
  | { acao: 'salvarCofre'; dados: SemId<Cofre> }
  | { acao: 'excluirCofre'; id: number }
  | { acao: 'movimentarCofre'; dados: SemId<MovimentoCofre> }
  | { acao: 'excluirMovimento'; id: number }
  | { acao: 'marcarPago'; chaves: string[]; pago: boolean; data?: string }
  | { acao: 'restaurarBackup'; dados: Banco };

/** Erro de validação: vira HTTP 400 com a mensagem para a pessoa. */
export class ErroDeRegra extends Error {}

const TIPOS: TipoConta[] = ['dinheiro', 'pix', 'debito', 'credito', 'boleto'];

export function bancoVazio(): Banco {
  return normalizar({ versao: 1, proximo_id: 1, configuracao: null } as Banco);
}

/** Completa listas que bancos/backups antigos não têm. */
export function normalizar(b: Banco): Banco {
  b.categorias ??= [];
  b.contas ??= [];
  b.compras ??= [];
  b.lancamentos ??= [];
  b.recorrentes ??= [];
  b.entradas ??= [];
  b.cofres ??= [];
  b.movimentos_cofre ??= [];
  b.pagamentos ??= {};
  return b;
}

/** Aplica a ação numa CÓPIA do banco (se der erro no meio, nada fica pela metade). */
export function aplicar(atual: Banco, a: Acao, agora = new Date().toISOString()): Banco {
  const b: Banco = normalizar(structuredClone(atual));
  const novoId = () => b.proximo_id++;
  const categoriaValida = (id: unknown) => (typeof id === 'number' && b.categorias.some((c) => c.id === id) ? id : null);
  const contaValida = (id: unknown) => (typeof id === 'number' && b.contas.some((c) => c.id === id) ? id : null);

  switch (a.acao) {
    case 'salvarConfiguracao':
      b.configuracao = {
        nome: typeof a.dados.nome === 'string' && a.dados.nome.trim() ? a.dados.nome.trim().slice(0, 40) : null,
        renda_mensal: numero(a.dados.renda_mensal, 'Renda', 0),
        dia_salario: dia(a.dados.dia_salario),
        saldo_inicial: numero(a.dados.saldo_inicial, 'Saldo'),
      };
      break;

    case 'salvarCategoria': {
      const nome = texto(a.dados.nome, 'Nome da categoria');
      nomeUnico(b.categorias, nome, a.dados.id);
      const cor = cor_(a.dados.cor);
      const limite = a.dados.limite ? numero(a.dados.limite, 'Limite', 0.01) : null;
      if (a.dados.id) Object.assign(existe(b.categorias, a.dados.id, 'Categoria'), { nome, cor, limite });
      else b.categorias.push({ id: novoId(), nome, cor, limite });
      break;
    }

    case 'criarCategorias':
      // Primeiro acesso: repetir depois de um erro não duplica.
      for (const c of a.dados) {
        const nome = texto(c.nome, 'Nome da categoria');
        if (!b.categorias.some((x) => igual(x.nome, nome))) b.categorias.push({ id: novoId(), nome, cor: cor_(c.cor), limite: null });
      }
      break;

    case 'excluirCategoria':
      // Gastos da categoria continuam, só ficam "sem categoria".
      b.categorias = b.categorias.filter((c) => c.id !== a.id);
      b.compras.forEach((c) => c.categoria_id === a.id && (c.categoria_id = null));
      b.recorrentes.forEach((r) => r.categoria_id === a.id && (r.categoria_id = null));
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
      b.recorrentes.forEach((r) => r.conta_id === a.id && (r.conta_id = null));
      break;

    case 'salvarCompra': {
      const d = a.dados;
      const conta_id = contaValida(d.conta_id);
      const dados = {
        descricao: texto(d.descricao, 'Descrição'),
        estabelecimento: (d.estabelecimento ?? '').trim().slice(0, 120),
        valor_total: numero(d.valor_total, 'Valor total', 0.01),
        parcelas: Number(d.parcelas),
        data_compra: data(d.data_compra),
        categoria_id: categoriaValida(d.categoria_id),
        conta_id,
        origem: d.origem === 'ia' ? ('ia' as const) : ('manual' as const),
        primeira_parcela: d.primeira_parcela ? data(d.primeira_parcela) : null,
      };
      let parcelas;
      try {
        parcelas = gerarParcelas(
          dados.valor_total, dados.parcelas, dados.data_compra, b.contas.find((c) => c.id === conta_id) ?? null, dados.primeira_parcela,
        );
      } catch (e) {
        throw new ErroDeRegra((e as Error).message);
      }
      let id: number;
      if (d.id) {
        Object.assign(existe(b.compras, d.id, 'Gasto'), dados);
        id = d.id;
        // parcelas são refeitas juntas; o "pago" das antigas some junto (as datas podem ter mudado)
        for (const l of b.lancamentos.filter((l) => l.compra_id === id)) delete b.pagamentos[`l:${l.id}`];
        b.lancamentos = b.lancamentos.filter((l) => l.compra_id !== id);
      } else {
        id = novoId();
        b.compras.push({ id, ...dados, criado_em: agora });
      }
      for (const p of parcelas) b.lancamentos.push({ id: novoId(), compra_id: id, ...p });
      break;
    }

    case 'excluirCompra':
      for (const l of b.lancamentos.filter((l) => l.compra_id === a.id)) delete b.pagamentos[`l:${l.id}`];
      b.compras = b.compras.filter((c) => c.id !== a.id);
      b.lancamentos = b.lancamentos.filter((l) => l.compra_id !== a.id);
      break;

    case 'salvarRecorrentes':
      // Uma ou várias de uma vez (cadastro em massa). Com id = editar; sem id = criar.
      if (!a.dados.length) throw new ErroDeRegra('Nada para salvar.');
      for (const r of a.dados) {
        const dados: Omit<Recorrente, 'id'> = {
          tipo: r.tipo === 'entrada' ? 'entrada' : 'gasto',
          descricao: texto(r.descricao, 'Descrição'),
          estabelecimento: (r.estabelecimento ?? '').trim().slice(0, 120),
          valor: numero(r.valor, 'Valor', 0.01),
          dia: dia(r.dia) ?? erro('Dia do mês: entre 1 e 31.'),
          inicio: mes(r.inicio, 'Início'),
          fim: r.fim ? mes(r.fim, 'Fim') : null,
          categoria_id: r.tipo === 'entrada' ? null : categoriaValida(r.categoria_id),
          conta_id: r.tipo === 'entrada' ? null : contaValida(r.conta_id),
          ativo: r.ativo !== false,
        };
        if (dados.fim && dados.fim < dados.inicio) throw new ErroDeRegra(`"${dados.descricao}": o fim vem antes do início.`);
        if (r.id) Object.assign(existe(b.recorrentes, r.id, 'Fixo'), dados);
        else b.recorrentes.push({ id: novoId(), ...dados });
      }
      break;

    case 'excluirRecorrente':
      b.recorrentes = b.recorrentes.filter((r) => r.id !== a.id);
      for (const k of Object.keys(b.pagamentos)) if (k.startsWith(`r:${a.id}:`)) delete b.pagamentos[k];
      break;

    case 'salvarEntrada': {
      const dados = { descricao: texto(a.dados.descricao, 'Descrição'), valor: numero(a.dados.valor, 'Valor', 0.01), data: data(a.dados.data) };
      if (a.dados.id) Object.assign(existe(b.entradas, a.dados.id, 'Entrada'), dados);
      else b.entradas.push({ id: novoId(), ...dados });
      break;
    }

    case 'excluirEntrada':
      b.entradas = b.entradas.filter((e) => e.id !== a.id);
      delete b.pagamentos[`e:${a.id}`];
      break;

    case 'salvarCofre': {
      const nome = texto(a.dados.nome, 'Nome do cofre');
      nomeUnico(b.cofres, nome, a.dados.id);
      const dados = {
        nome,
        cor: cor_(a.dados.cor),
        meta_valor: a.dados.meta_valor ? numero(a.dados.meta_valor, 'Meta', 0.01) : null,
        meta_data: a.dados.meta_data ? data(a.dados.meta_data) : null,
      };
      if (a.dados.id) Object.assign(existe(b.cofres, a.dados.id, 'Cofre'), dados);
      else b.cofres.push({ id: novoId(), ...dados });
      break;
    }

    case 'excluirCofre':
      b.cofres = b.cofres.filter((c) => c.id !== a.id);
      b.movimentos_cofre = b.movimentos_cofre.filter((m) => m.cofre_id !== a.id);
      break;

    case 'movimentarCofre': {
      const cofre = existe(b.cofres, a.dados.cofre_id, 'Cofre');
      const valor = numero(a.dados.valor, 'Valor');
      if (!valor) throw new ErroDeRegra('Valor: informe quanto guardou ou retirou.');
      const saldo = b.movimentos_cofre.filter((m) => m.cofre_id === cofre.id && m.id !== a.dados.id).reduce((t, m) => t + m.valor, 0);
      if (saldo + valor < -0.001) throw new ErroDeRegra(`O cofre "${cofre.nome}" não tem esse valor para retirar.`);
      const dados = { cofre_id: cofre.id, valor, data: data(a.dados.data), nota: (a.dados.nota ?? '').trim().slice(0, 120) };
      if (a.dados.id) Object.assign(existe(b.movimentos_cofre, a.dados.id, 'Movimento'), dados);
      else b.movimentos_cofre.push({ id: novoId(), ...dados });
      break;
    }

    case 'excluirMovimento':
      b.movimentos_cofre = b.movimentos_cofre.filter((m) => m.id !== a.id);
      break;

    case 'marcarPago':
      for (const chave of a.chaves ?? []) {
        if (!/^(l:\d+|e:\d+|r:\d+:\d{4}-\d{2})$/.test(chave)) throw new ErroDeRegra('Item inválido.');
        if (a.pago) b.pagamentos[chave] = a.data ? data(a.data) : agora.slice(0, 10);
        else delete b.pagamentos[chave];
      }
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
  const n = normalizar(structuredClone(b));
  const todos = [n.categorias, n.contas, n.compras, n.lancamentos, n.recorrentes, n.entradas, n.cofres, n.movimentos_cofre].flat();
  const maiorId = Math.max(0, ...todos.map((r: { id: number }) => r.id));
  return { ...n, proximo_id: Math.max(n.proximo_id || 1, maiorId + 1) };
}

// --- validações ---

function erro(msg: string): never {
  throw new ErroDeRegra(msg);
}

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

function mes(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw new ErroDeRegra(`${campo}: mês inválido.`);
  return v;
}

function cor_(v: unknown): string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#64748b';
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
