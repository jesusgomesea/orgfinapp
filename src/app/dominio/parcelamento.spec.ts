// Testes da regra de parcelamento. Rodar: npm run test:regras
import { describe, expect, it } from 'vitest';
import { dividirEmCentavos, gerarParcelas } from './parcelamento';

const nubank = { tipo: 'credito' as const, dia_fechamento: 3, dia_vencimento: 10 };

describe('dividirEmCentavos', () => {
  it('sobra de centavos vai para a 1ª parcela', () => {
    expect(dividirEmCentavos(10000, 3)).toEqual([3334, 3333, 3333]);
  });
  it('soma sempre fecha', () => {
    for (const n of [1, 2, 7, 12, 13, 120]) {
      expect(dividirEmCentavos(123457, n).reduce((a, b) => a + b, 0)).toBe(123457);
    }
  });
});

describe('gerarParcelas', () => {
  it('geladeira 3000 em 10x no cartão sem fechamento: começa no mês seguinte', () => {
    const p = gerarParcelas(3000, 10, '2026-10-20', { tipo: 'credito', dia_fechamento: null, dia_vencimento: null });
    expect(p).toHaveLength(10);
    expect(p[0]).toEqual({ numero: 1, total_parcelas: 10, valor: 300, competencia: '2026-11-01', data_prevista: '2026-11-20' });
    expect(p[9].competencia).toBe('2027-08-01');
  });

  it('cartão: compra até o fechamento cai no mês seguinte, no dia do vencimento', () => {
    const p = gerarParcelas(100, 1, '2026-10-03', nubank);
    expect(p[0].competencia).toBe('2026-11-01');
    expect(p[0].data_prevista).toBe('2026-11-10');
  });

  it('cartão: compra depois do fechamento pula um mês', () => {
    const p = gerarParcelas(100, 1, '2026-10-04', nubank);
    expect(p[0].competencia).toBe('2026-12-01');
  });

  it('à vista no Pix conta no próprio mês e no próprio dia', () => {
    const p = gerarParcelas(50, 1, '2026-10-31', { tipo: 'pix', dia_fechamento: null, dia_vencimento: null });
    expect(p[0]).toMatchObject({ competencia: '2026-10-01', data_prevista: '2026-10-31' });
  });

  it('dia 31 em mês curto vira o último dia do mês', () => {
    const p = gerarParcelas(200, 2, '2027-01-31', null);
    expect(p.map((x) => x.data_prevista)).toEqual(['2027-02-28', '2027-03-31']);
  });

  it('virada de ano', () => {
    const p = gerarParcelas(90, 3, '2026-12-15', null);
    expect(p.map((x) => x.competencia)).toEqual(['2027-01-01', '2027-02-01', '2027-03-01']);
  });

  it('data da 1ª parcela informada manda: carnê de loja que vence dia 10 do mês atual', () => {
    const p = gerarParcelas(600, 3, '2026-10-31', { tipo: 'boleto', dia_fechamento: null, dia_vencimento: null }, '2026-11-10');
    expect(p.map((x) => [x.competencia, x.data_prevista])).toEqual([
      ['2026-11-01', '2026-11-10'], ['2026-12-01', '2026-12-10'], ['2027-01-01', '2027-01-10'],
    ]);
  });

  it('data da 1ª parcela também vence a regra do cartão (inclusive no mesmo mês da compra)', () => {
    const p = gerarParcelas(100, 2, '2026-10-20', nubank, '2026-10-25');
    expect(p.map((x) => x.data_prevista)).toEqual(['2026-10-25', '2026-11-25']);
  });

  it('recusa valor zero e parcelas inválidas', () => {
    expect(() => gerarParcelas(0, 1, '2026-10-01', null)).toThrow();
    expect(() => gerarParcelas(10, 0, '2026-10-01', null)).toThrow();
  });
});
