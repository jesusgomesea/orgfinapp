// Testes do "banco" (ações) e do token de login. Rodar: npm test
import { beforeAll, describe, expect, it } from 'vitest';
import { aplicar, bancoVazio, ErroDeRegra, validarBackup, type Banco } from './operacoes.mts';
import { emitirToken, senhaConfere, tokenValido } from './sessao.mts';

function comCadastros(): Banco {
  let b = bancoVazio();
  b = aplicar(b, { acao: 'criarCategorias', dados: [{ nome: 'Eletrodomésticos', cor: '#475569' }, { nome: 'Mercado', cor: '#16a34a' }] });
  b = aplicar(b, { acao: 'criarContas', dados: [{ nome: 'Nubank', tipo: 'credito', dia_fechamento: 3, dia_vencimento: 10 }] });
  return b;
}

const geladeira = (b: Banco) => ({
  descricao: 'Geladeira', estabelecimento: 'Casas Bahia', valor_total: 3000, parcelas: 10, data_compra: '2026-10-20',
  categoria_id: b.categorias[0].id, conta_id: b.contas[0].id, origem: 'ia' as const,
});

describe('ações do banco', () => {
  it('compra parcelada gera as parcelas no servidor', () => {
    let b = comCadastros();
    b = aplicar(b, { acao: 'salvarCompra', dados: geladeira(b) });
    expect(b.compras).toHaveLength(1);
    expect(b.lancamentos).toHaveLength(10);
    // depois do fechamento (dia 3) → pula para dezembro, no vencimento (dia 10)
    expect(b.lancamentos[0]).toMatchObject({ numero: 1, valor: 300, competencia: '2026-12-01', data_prevista: '2026-12-10' });
    expect(b.lancamentos.reduce((t, l) => t + l.valor, 0)).toBe(3000);
  });

  it('editar refaz as parcelas; excluir leva todas', () => {
    let b = comCadastros();
    b = aplicar(b, { acao: 'salvarCompra', dados: geladeira(b) });
    const id = b.compras[0].id;
    b = aplicar(b, { acao: 'salvarCompra', dados: { ...geladeira(b), id, parcelas: 3, valor_total: 100 } });
    expect(b.lancamentos.map((l) => l.valor)).toEqual([33.34, 33.33, 33.33]);
    b = aplicar(b, { acao: 'excluirCompra', id });
    expect(b.compras).toHaveLength(0);
    expect(b.lancamentos).toHaveLength(0);
  });

  it('data da 1ª parcela informada é gravada e usada', () => {
    let b = comCadastros();
    b = aplicar(b, { acao: 'salvarCompra', dados: { ...geladeira(b), data_compra: '2026-10-31', primeira_parcela: '2026-11-10' } });
    expect(b.compras[0].primeira_parcela).toBe('2026-11-10');
    expect(b.lancamentos[0]).toMatchObject({ competencia: '2026-11-01', data_prevista: '2026-11-10' });
    expect(() => aplicar(b, { acao: 'salvarCompra', dados: { ...geladeira(b), primeira_parcela: '10/11' } })).toThrow(ErroDeRegra);
  });

  it('excluir categoria deixa o gasto sem categoria', () => {
    let b = comCadastros();
    b = aplicar(b, { acao: 'salvarCompra', dados: geladeira(b) });
    b = aplicar(b, { acao: 'excluirCategoria', id: b.categorias[0].id });
    expect(b.compras[0].categoria_id).toBeNull();
  });

  it('não aceita nome repetido, valor zero nem categoria inexistente', () => {
    const b = comCadastros();
    expect(() => aplicar(b, { acao: 'salvarCategoria', dados: { nome: 'mercado', cor: '#000000' } })).toThrow(ErroDeRegra);
    expect(() => aplicar(b, { acao: 'salvarCompra', dados: { ...geladeira(b), valor_total: 0 } })).toThrow(ErroDeRegra);
    const semCat = aplicar(b, { acao: 'salvarCompra', dados: { ...geladeira(b), categoria_id: 999 } });
    expect(semCat.compras[0].categoria_id).toBeNull();
  });

  it('primeiro acesso repetido não duplica', () => {
    let b = comCadastros();
    b = aplicar(b, { acao: 'criarCategorias', dados: [{ nome: 'Mercado', cor: '#16a34a' }] });
    expect(b.categorias).toHaveLength(2);
  });

  it('erro no meio não altera o banco original', () => {
    const b = comCadastros();
    const antes = JSON.stringify(b);
    expect(() => aplicar(b, { acao: 'salvarCompra', dados: { ...geladeira(b), data_compra: 'ontem' } })).toThrow();
    expect(JSON.stringify(b)).toBe(antes);
  });

  it('backup: recusa arquivo estranho e corrige proximo_id', () => {
    expect(() => validarBackup({ qualquer: 1 })).toThrow(ErroDeRegra);
    const b = aplicar(comCadastros(), { acao: 'salvarCompra', dados: geladeira(comCadastros()) });
    expect(validarBackup({ ...b, proximo_id: 1 }).proximo_id).toBeGreaterThan(Math.max(...b.lancamentos.map((l) => l.id)));
  });
});

describe('sessão', () => {
  beforeAll(() => {
    process.env['APP_SENHA'] = 'minha senha';
    process.env['APP_SEGREDO'] = 'segredo-de-teste-com-tamanho';
  });

  it('senha', () => {
    expect(senhaConfere('minha senha')).toBe(true);
    expect(senhaConfere('minha senhA')).toBe(false);
    expect(senhaConfere('')).toBe(false);
  });

  it('token válido, adulterado e vencido', () => {
    const t = emitirToken();
    expect(tokenValido(t)).toBe(true);
    expect(tokenValido(t.slice(0, -2) + 'xx')).toBe(false);
    expect(tokenValido(emitirToken(0))).toBe(false); // venceu em 1970 + 180 dias
  });
});
