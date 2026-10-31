// Resumo das finanças em texto curto, para o Assistente (IA) responder perguntas sem receber o banco inteiro.
// Código puro (testável): recebe o banco e a data de hoje, devolve texto em português.
import { formatar, lerData, somarMeses } from '../../src/app/dominio/parcelamento.ts';
import { ocorrencias } from '../../src/app/dominio/recorrencia.ts';
import type { Banco } from './operacoes.mts';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const r$ = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Gastos (parcelas + fixos) e entradas por mês de competência, com quebra por categoria. */
export function totaisPorMes(b: Banco, de: string, ate: string) {
  const cat = new Map(b.categorias.map((c) => [c.id, c.nome]));
  const compras = new Map(b.compras.map((c) => [c.id, c]));
  const meses = new Map<string, { gastos: number; entradas: number; porCategoria: Map<string, number> }>();
  const mes = (comp: string) => {
    let m = meses.get(comp);
    if (!m) meses.set(comp, (m = { gastos: 0, entradas: 0, porCategoria: new Map() }));
    return m;
  };
  const somaCat = (comp: string, nome: string, v: number) => {
    const m = mes(comp);
    m.gastos += v;
    m.porCategoria.set(nome, (m.porCategoria.get(nome) ?? 0) + v);
  };
  for (const l of b.lancamentos) {
    if (l.competencia < de || l.competencia > ate) continue;
    const c = compras.get(l.compra_id);
    somaCat(l.competencia, (c?.categoria_id && cat.get(c.categoria_id)) || 'Sem categoria', l.valor);
  }
  for (const r of b.recorrentes) {
    for (const o of ocorrencias(r, de, ate)) {
      if (r.tipo === 'entrada') mes(o.competencia).entradas += r.valor;
      else somaCat(o.competencia, (r.categoria_id && cat.get(r.categoria_id)) || 'Sem categoria', r.valor);
    }
  }
  for (const e of b.entradas) {
    const comp = `${e.data.slice(0, 7)}-01`;
    if (comp >= de && comp <= ate) mes(comp).entradas += e.valor;
  }
  return meses;
}

export function resumoParaIa(b: Banco, hoje: string): string {
  const { ano, mes } = lerData(hoje);
  const ini = somarMeses(ano, mes, -11);
  const fim = somarMeses(ano, mes, 3);
  const de = formatar(ini.ano, ini.mes, 1);
  const ate = formatar(fim.ano, fim.mes, 1);
  const meses = totaisPorMes(b, de, ate);
  const renda = b.configuracao?.renda_mensal ?? 0;
  const linhas: string[] = [];

  linhas.push(`Renda mensal fixa (salário): ${r$(renda)}.`);
  linhas.push('\nPor mês (gastos = parcelas + fixos; entradas além do salário):');
  for (let i = 0; i < 15; i++) {
    const m = somarMeses(ini.ano, ini.mes, i);
    const comp = formatar(m.ano, m.mes, 1);
    const t = meses.get(comp);
    const cats = t ? [...t.porCategoria].sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${r$(v)}`).join('; ') : '';
    const futuro = comp > formatar(ano, mes, 1) ? ' (futuro: só parcelas e fixos já previstos)' : '';
    linhas.push(`- ${MESES[m.mes - 1]}/${m.ano}${futuro}: gastos ${r$(t?.gastos ?? 0)}, entradas ${r$(t?.entradas ?? 0)}${cats ? ' — ' + cats : ''}`);
  }

  const limites = b.categorias.filter((c) => c.limite);
  if (limites.length) linhas.push('\nLimites mensais por categoria: ' + limites.map((c) => `${c.nome} ${r$(c.limite!)}`).join('; ') + '.');

  const fixos = b.recorrentes.filter((r) => r.ativo);
  if (fixos.length) {
    linhas.push('\nFixos ativos: ' + fixos.map((r) => `${r.tipo === 'entrada' ? '[entrada] ' : ''}${r.descricao} ${r$(r.valor)} dia ${r.dia}`).join('; ') + '.');
  }

  if (b.cofres.length) {
    linhas.push('\nCofres (poupanças): ' + b.cofres.map((c) => {
      const saldo = b.movimentos_cofre.filter((m) => m.cofre_id === c.id).reduce((t, m) => t + m.valor, 0);
      return `${c.nome}: ${r$(saldo)}${c.meta_valor ? ` de meta ${r$(c.meta_valor)}${c.meta_data ? ' até ' + c.meta_data : ''}` : ''}`;
    }).join('; ') + '.');
  }

  const cat = new Map(b.categorias.map((c) => [c.id, c.nome]));
  const conta = new Map(b.contas.map((c) => [c.id, c.nome]));
  const recentes = [...b.compras].sort((x, y) => y.data_compra.localeCompare(x.data_compra)).slice(0, 40);
  if (recentes.length) {
    linhas.push('\nCompras mais recentes:');
    for (const c of recentes) {
      linhas.push(`- ${c.data_compra} ${c.descricao}${c.estabelecimento ? ' (' + c.estabelecimento + ')' : ''}: ${r$(c.valor_total)}` +
        `${c.parcelas > 1 ? ` em ${c.parcelas}x` : ''} · ${(c.categoria_id && cat.get(c.categoria_id)) || 'sem categoria'}` +
        `${c.conta_id && conta.get(c.conta_id) ? ' · ' + conta.get(c.conta_id) : ''}`);
    }
  }
  return linhas.join('\n');
}
