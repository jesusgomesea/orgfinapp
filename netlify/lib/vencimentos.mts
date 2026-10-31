// O que vence num dia (para o lembrete da véspera): parcelas e fixos de GASTO ainda não pagos.
// Compras no cartão de crédito são agrupadas na fatura ("Fatura Nubank R$ 1.234,00"), como o banco cobra.
// Código puro, testado em novidades.spec.mts.
import { ocorrencias } from '../../src/app/dominio/recorrencia.ts';
import type { Banco } from './operacoes.mts';

export interface Vencimento {
  descricao: string;
  valor: number;
}

export function vencimentosDoDia(b: Banco, dia: string): Vencimento[] {
  const comp = `${dia.slice(0, 7)}-01`;
  const compras = new Map(b.compras.map((c) => [c.id, c]));
  const contas = new Map(b.contas.map((c) => [c.id, c]));
  const faturas = new Map<string, number>();
  const avulsos: Vencimento[] = [];

  for (const l of b.lancamentos) {
    if (l.data_prevista !== dia || b.pagamentos[`l:${l.id}`]) continue;
    const c = compras.get(l.compra_id);
    const conta = c?.conta_id ? contas.get(c.conta_id) : undefined;
    if (conta?.tipo === 'credito') faturas.set(conta.nome, (faturas.get(conta.nome) ?? 0) + l.valor);
    else avulsos.push({ descricao: (c?.descricao ?? 'Parcela') + (l.total_parcelas > 1 ? ` ${l.numero}/${l.total_parcelas}` : ''), valor: l.valor });
  }
  for (const r of b.recorrentes) {
    if (r.tipo !== 'gasto') continue;
    for (const o of ocorrencias(r, comp, comp)) {
      if (o.data_prevista !== dia || b.pagamentos[o.chave]) continue;
      const conta = r.conta_id ? contas.get(r.conta_id) : undefined;
      if (conta?.tipo === 'credito') faturas.set(conta.nome, (faturas.get(conta.nome) ?? 0) + r.valor);
      else avulsos.push({ descricao: r.descricao, valor: r.valor });
    }
  }
  return [
    ...[...faturas].map(([nome, valor]) => ({ descricao: `Fatura ${nome}`, valor: Math.round(valor * 100) / 100 })),
    ...avulsos,
  ];
}

/** Data de amanhã em São Paulo, 'AAAA-MM-DD'. */
export function amanhaEmSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(agora.getTime() + 86_400_000));
}
