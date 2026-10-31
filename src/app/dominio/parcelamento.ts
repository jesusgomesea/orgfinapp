// Regra de parcelamento: transforma "valor total + nº de parcelas + forma de pagamento" nas parcelas que
// aparecem no calendário. Código puro (sem Angular/Supabase) para ser testado sozinho — ver parcelamento.spec.ts.
// O banco (função salvar_compra) só confere que a soma fecha; quem decide valores e meses é este arquivo.

export type TipoConta = 'dinheiro' | 'pix' | 'debito' | 'credito' | 'boleto';

export interface ContaParaParcela {
  tipo: TipoConta;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}

export interface Parcela {
  numero: number;
  total_parcelas: number;
  /** Em reais, já com 2 casas (vem de centavos inteiros, sem erro de ponto flutuante). */
  valor: number;
  /** Sempre dia 1 do mês em que o gasto conta: 'AAAA-MM-01'. */
  competencia: string;
  /** Dia em que aparece no calendário: 'AAAA-MM-DD'. */
  data_prevista: string;
}

/**
 * Divide em centavos inteiros. A sobra vai para a 1ª parcela (R$ 100 em 3x → 33,34 + 33,33 + 33,33),
 * assim a soma é sempre exatamente o total.
 */
export function dividirEmCentavos(totalCentavos: number, parcelas: number): number[] {
  const base = Math.floor(totalCentavos / parcelas);
  const sobra = totalCentavos - base * parcelas;
  return Array.from({ length: parcelas }, (_, i) => (i === 0 ? base + sobra : base));
}

/**
 * Quantos meses depois da compra cai a 1ª parcela.
 * - Cartão de crédito: fatura do mês seguinte; comprou DEPOIS do dia de fechamento → pula mais um mês.
 * - Parcelado fora do cartão (boleto, carnê...): começa no mês seguinte.
 * - À vista fora do cartão: conta no próprio mês.
 */
export function mesesAteAPrimeira(diaCompra: number, parcelas: number, conta: ContaParaParcela | null): number {
  if (conta?.tipo === 'credito') {
    return conta.dia_fechamento && diaCompra > conta.dia_fechamento ? 2 : 1;
  }
  return parcelas > 1 ? 1 : 0;
}

export function gerarParcelas(
  valorTotal: number,
  parcelas: number,
  dataCompra: string,
  conta: ContaParaParcela | null,
): Parcela[] {
  if (!(valorTotal > 0)) throw new Error('Informe um valor maior que zero.');
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 120) {
    throw new Error('Parcelas deve ser um número inteiro entre 1 e 120.');
  }
  const { ano, mes, dia } = lerData(dataCompra);
  const valores = dividirEmCentavos(Math.round(valorTotal * 100), parcelas);
  const inicio = mesesAteAPrimeira(dia, parcelas, conta);

  return valores.map((centavos, i) => {
    const { ano: a, mes: m } = somarMeses(ano, mes, inicio + i);
    // No cartão aparece no dia do vencimento da fatura; sem vencimento cadastrado, no mesmo dia da compra.
    const diaNoMes = conta?.tipo === 'credito' && conta.dia_vencimento ? conta.dia_vencimento : dia;
    return {
      numero: i + 1,
      total_parcelas: parcelas,
      valor: centavos / 100,
      competencia: formatar(a, m, 1),
      data_prevista: formatar(a, m, Math.min(diaNoMes, diasNoMes(a, m))),
    };
  });
}

// --- datas como texto 'AAAA-MM-DD': evita o fuso horário do navegador "andar" um dia ---

export function lerData(texto: string): { ano: number; mes: number; dia: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) throw new Error(`Data inválida: ${texto}`);
  return { ano: +m[1], mes: +m[2], dia: +m[3] };
}

export function somarMeses(ano: number, mes: number, quantos: number): { ano: number; mes: number } {
  const zeroBase = ano * 12 + (mes - 1) + quantos;
  return { ano: Math.floor(zeroBase / 12), mes: (zeroBase % 12) + 1 };
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

export function formatar(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
