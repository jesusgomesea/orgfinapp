// Função agendada (todo dia às 8h de Brasília = 11h UTC): manda para os aparelhos inscritos o que vence AMANHÃ
// e ainda não foi marcado como pago. Sem nada vencendo, não manda nada.
import { getStore } from '@netlify/blobs';
import { normalizar, type Banco } from '../lib/operacoes.mts';
import { enviarParaTodos, inscricoes } from '../lib/push.mts';
import { amanhaEmSaoPaulo, vencimentosDoDia } from '../lib/vencimentos.mts';

const r$ = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async (): Promise<void> => {
  if (!(await inscricoes()).length) return;
  const salvo = await getStore({ name: 'orgfin', consistency: 'strong' }).get('banco', { type: 'json' });
  if (!salvo) return;
  const dia = amanhaEmSaoPaulo();
  const itens = vencimentosDoDia(normalizar(salvo as Banco), dia);
  if (!itens.length) return;

  const total = itens.reduce((t, i) => t + i.valor, 0);
  const corpo = itens.slice(0, 4).map((i) => `${i.descricao} ${r$(i.valor)}`).join(' · ') + (itens.length > 4 ? ` e mais ${itens.length - 4}` : '');
  const r = await enviarParaTodos({
    titulo: `Amanhã vence ${r$(total)}`,
    corpo,
    url: `/calendario?m=${dia.slice(0, 7)}`,
  });
  console.log('Lembretes', dia, itens.length, 'itens', r);
};

export const config = { schedule: '0 11 * * *' };
