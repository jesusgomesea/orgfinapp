// Gastos e entradas fixos (aluguel, internet, salário extra...): NÃO são gravados mês a mês. Guardamos só a regra
// ("R$ 120 todo dia 15, de jan/2026 em diante") e geramos as ocorrências na hora, para qualquer mês pedido.
// Código puro, usado pelo app (calendário/painel) e pelo servidor (avisos de vencimento, assistente).
import { diasNoMes, formatar, lerData, somarMeses } from './parcelamento';

export interface RegraRecorrente {
  id: number;
  dia: number;
  /** 'AAAA-MM' do primeiro mês. */
  inicio: string;
  /** 'AAAA-MM' do último mês (inclusive), ou null = sem fim. */
  fim: string | null;
  ativo: boolean;
}

export interface Ocorrencia {
  /** Chave estável da ocorrência (usada para marcar como pago): 'r:<id>:AAAA-MM'. */
  chave: string;
  competencia: string;
  data_prevista: string;
}

/** Ocorrências da regra entre dois meses ('AAAA-MM-01' a 'AAAA-MM-01', inclusive). */
export function ocorrencias(regra: RegraRecorrente, de: string, ate: string): Ocorrencia[] {
  if (!regra.ativo) return [];
  const saida: Ocorrencia[] = [];
  const inicio = `${regra.inicio}-01`;
  const fim = regra.fim ? `${regra.fim}-01` : null;
  let { ano, mes } = lerData(de > inicio ? de : inicio);
  for (let i = 0; i < 240; i++) {
    const competencia = formatar(ano, mes, 1);
    if (competencia > ate || (fim && competencia > fim)) break;
    saida.push({
      chave: `r:${regra.id}:${competencia.slice(0, 7)}`,
      competencia,
      data_prevista: formatar(ano, mes, Math.min(regra.dia, diasNoMes(ano, mes))),
    });
    ({ ano, mes } = somarMeses(ano, mes, 1));
  }
  return saida;
}
