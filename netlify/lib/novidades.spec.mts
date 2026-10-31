// Testes das funções novas do banco: fixos, entradas, cofres, pago e limite. Rodar: npm test
import { describe, expect, it } from 'vitest';
import { ocorrencias } from '../../src/app/dominio/recorrencia.ts';
import { aplicar, bancoVazio, ErroDeRegra, validarBackup, type Banco } from './operacoes.mts';

const base = (): Banco => aplicar(bancoVazio(), { acao: 'criarCategorias', dados: [{ nome: 'Moradia', cor: '#2563eb' }] });

describe('recorrência', () => {
  const regra = { id: 7, dia: 31, inicio: '2026-11', fim: '2027-02', ativo: true };
  it('gera um por mês, respeita início/fim e o último dia do mês', () => {
    const o = ocorrencias(regra, '2026-10-01', '2027-12-01');
    expect(o.map((x) => x.data_prevista)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
    expect(o[0].chave).toBe('r:7:2026-11');
  });
  it('inativa não gera nada', () => {
    expect(ocorrencias({ ...regra, ativo: false }, '2026-01-01', '2027-12-01')).toEqual([]);
  });
});

describe('fixos e entradas', () => {
  it('cadastra vários fixos de uma vez e valida', () => {
    let b = base();
    b = aplicar(b, {
      acao: 'salvarRecorrentes',
      dados: [
        { tipo: 'gasto', descricao: 'Aluguel', estabelecimento: '', valor: 1800, dia: 10, inicio: '2026-11', fim: null, categoria_id: b.categorias[0].id, conta_id: null, ativo: true },
        { tipo: 'entrada', descricao: 'Freela fixo', estabelecimento: '', valor: 900, dia: 20, inicio: '2026-11', fim: '2027-04', categoria_id: 99, conta_id: null, ativo: true },
      ],
    });
    expect(b.recorrentes).toHaveLength(2);
    expect(b.recorrentes[1].categoria_id).toBeNull(); // entrada não tem categoria
    expect(() => aplicar(b, { acao: 'salvarRecorrentes', dados: [{ ...b.recorrentes[0], id: undefined, dia: 40 }] })).toThrow(ErroDeRegra);
    expect(() => aplicar(b, { acao: 'salvarRecorrentes', dados: [{ ...b.recorrentes[0], id: undefined, fim: '2026-01' }] })).toThrow(ErroDeRegra);
  });

  it('entrada avulsa', () => {
    const b = aplicar(base(), { acao: 'salvarEntrada', dados: { descricao: '13º', valor: 3200, data: '2026-12-20' } });
    expect(b.entradas[0]).toMatchObject({ descricao: '13º', valor: 3200 });
  });
});

describe('cofres', () => {
  it('guarda, retira e não deixa ficar negativo', () => {
    let b = aplicar(base(), { acao: 'salvarCofre', dados: { nome: 'Casa', cor: '#22c55e', meta_valor: 50000, meta_data: '2028-12-31' } });
    const cofre_id = b.cofres[0].id;
    b = aplicar(b, { acao: 'movimentarCofre', dados: { cofre_id, valor: 1000, data: '2026-10-05', nota: 'outubro' } });
    b = aplicar(b, { acao: 'movimentarCofre', dados: { cofre_id, valor: -300, data: '2026-10-20', nota: '' } });
    expect(b.movimentos_cofre.reduce((t, m) => t + m.valor, 0)).toBe(700);
    expect(() => aplicar(b, { acao: 'movimentarCofre', dados: { cofre_id, valor: -800, data: '2026-10-21', nota: '' } })).toThrow(ErroDeRegra);
    b = aplicar(b, { acao: 'excluirCofre', id: cofre_id });
    expect(b.movimentos_cofre).toHaveLength(0);
  });
});

describe('lembretes e resumo da IA', () => {
  function cenario(): Banco {
    let b = base();
    b = aplicar(b, { acao: 'criarContas', dados: [{ nome: 'Nubank', tipo: 'credito', dia_fechamento: 3, dia_vencimento: 10 }] });
    const nubank = b.contas[0].id;
    b = aplicar(b, { acao: 'salvarCompra', dados: { descricao: 'Geladeira', estabelecimento: '', valor_total: 600, parcelas: 2, data_compra: '2026-10-20', categoria_id: null, conta_id: nubank, origem: 'manual' } });
    b = aplicar(b, { acao: 'salvarCompra', dados: { descricao: 'Fone', estabelecimento: '', valor_total: 100, parcelas: 1, data_compra: '2026-10-21', categoria_id: null, conta_id: nubank, origem: 'manual' } });
    b = aplicar(b, { acao: 'salvarRecorrentes', dados: [{ tipo: 'gasto', descricao: 'Aluguel', estabelecimento: '', valor: 1800, dia: 10, inicio: '2026-01', fim: null, categoria_id: b.categorias[0].id, conta_id: null, ativo: true }] });
    return b;
  }

  // Compras dias 20 e 21 depois do fechamento (dia 3) caem na fatura de dezembro, vencendo dia 10.
  it('vencimentos do dia: fatura agrupada + fixo; pago não aparece', async () => {
    const { vencimentosDoDia } = await import('./vencimentos.mts');
    let b = cenario();
    expect(vencimentosDoDia(b, '2026-12-10')).toEqual([
      { descricao: 'Fatura Nubank', valor: 400 },
      { descricao: 'Aluguel', valor: 1800 },
    ]);
    b = aplicar(b, { acao: 'marcarPago', chaves: ['r:' + b.recorrentes[0].id + ':2026-12'], pago: true });
    expect(vencimentosDoDia(b, '2026-12-10').map((v) => v.descricao)).toEqual(['Fatura Nubank']);
  });

  it('resumo para a IA tem renda, meses, fixos e compras', async () => {
    const { resumoParaIa } = await import('./resumo.mts');
    const texto = resumoParaIa(cenario(), '2026-11-15');
    expect(texto).toContain('nov/2026');
    expect(texto).toContain('Aluguel');
    expect(texto).toContain('Geladeira');
  });
});

describe('pago e limite', () => {
  it('marca e desmarca; recusa chave estranha', () => {
    let b = aplicar(base(), { acao: 'marcarPago', chaves: ['r:3:2026-11', 'l:9'], pago: true, data: '2026-11-10' });
    expect(b.pagamentos).toEqual({ 'r:3:2026-11': '2026-11-10', 'l:9': '2026-11-10' });
    b = aplicar(b, { acao: 'marcarPago', chaves: ['l:9'], pago: false });
    expect(Object.keys(b.pagamentos)).toEqual(['r:3:2026-11']);
    expect(() => aplicar(b, { acao: 'marcarPago', chaves: ['qualquer'], pago: true })).toThrow(ErroDeRegra);
  });

  it('limite por categoria', () => {
    const b0 = base();
    const b = aplicar(b0, { acao: 'salvarCategoria', dados: { ...b0.categorias[0], limite: 1200 } });
    expect(b.categorias[0].limite).toBe(1200);
  });

  it('backup antigo (sem as listas novas) continua valendo', () => {
    const antigo = { versao: 1, proximo_id: 1, configuracao: null, categorias: [], contas: [], compras: [], lancamentos: [] };
    const b = validarBackup(antigo);
    expect(b.cofres).toEqual([]);
    expect(b.pagamentos).toEqual({});
  });
});
