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

// Fundo dos cartões desenhados (painel e ajustes). Escolhido pelo id, então cada cartão mantém sempre a mesma cor.
const GRADIENTES_CARTAO = [
  'linear-gradient(135deg, #9b1fe8 0%, #5b0a9e 55%, #2a0650 100%)',
  'linear-gradient(135deg, #d9ff3d 0%, #8ccf00 45%, #2f4d00 100%)',
  'linear-gradient(135deg, #ff8a3d 0%, #e5482b 50%, #6b1410 100%)',
  'linear-gradient(135deg, #38bdf8 0%, #2563eb 50%, #172554 100%)',
  'linear-gradient(135deg, #f472b6 0%, #be185d 50%, #4a0626 100%)',
  'linear-gradient(135deg, #52525b 0%, #27272a 50%, #09090b 100%)',
];
export function gradienteDoCartao(id: number): string {
  return GRADIENTES_CARTAO[id % GRADIENTES_CARTAO.length];
}

export function nomeMesCurto(competencia: string): string {
  const { ano, mes } = lerData(competencia);
  return `${NOMES_MES[mes - 1].slice(0, 3)}/${String(ano).slice(2)}`;
}
