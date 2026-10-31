// Formatação para a tela (moeda, meses) e "hoje" no fuso do Brasil.
import { formatar, lerData, somarMeses } from '../dominio/parcelamento';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const reais = (v: number) => moeda.format(v);

export const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** 'AAAA-MM-DD' de hoje em São Paulo (o new Date() puro usaria UTC e viraria o dia às 21h). */
export function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/** Mês corrente como { ano, mes } (mes de 1 a 12). */
export function mesAtual(): { ano: number; mes: number } {
  const { ano, mes } = lerData(hoje());
  return { ano, mes };
}

export function primeiroDia(ano: number, mes: number): string {
  return formatar(ano, mes, 1);
}

export function navegarMes(ano: number, mes: number, quantos: number) {
  return somarMeses(ano, mes, quantos);
}

export function dataCurta(texto: string): string {
  const { dia, mes } = lerData(texto);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

export function nomeMesCurto(competencia: string): string {
  const { ano, mes } = lerData(competencia);
  return `${NOMES_MES[mes - 1].slice(0, 3)}/${String(ano).slice(2)}`;
}
