// Liga/desliga os lembretes de vencimento neste aparelho.
//   GET                          → { chavePublica, inscritos }
//   POST { acao: 'inscrever', inscricao }   → guarda o endereço de push do aparelho
//   POST { acao: 'cancelar', endpoint }     → remove
//   POST { acao: 'testar' }                 → manda uma notificação de teste para todos os aparelhos
import type { PushSubscription } from 'web-push';
import { chavesVapid, enviarParaTodos, inscricoes, salvarInscricoes } from '../lib/push.mts';
import { autorizado, json } from '../lib/sessao.mts';

export default async (req: Request): Promise<Response> => {
  if (!autorizado(req)) return json(401, { erro: 'Sessão expirada. Entre de novo.' });

  if (req.method === 'GET') {
    const [{ publicKey }, lista] = await Promise.all([chavesVapid(), inscricoes()]);
    return json(200, { chavePublica: publicKey, inscritos: lista.length });
  }
  if (req.method !== 'POST') return json(405, { erro: 'Use GET ou POST.' });

  const corpo = (await req.json().catch(() => null)) as { acao?: string; inscricao?: PushSubscription; endpoint?: string } | null;
  const lista = await inscricoes();

  switch (corpo?.acao) {
    case 'inscrever': {
      const i = corpo.inscricao;
      if (!i?.endpoint?.startsWith('https://') || !i.keys?.p256dh || !i.keys?.auth) return json(400, { erro: 'Inscrição inválida.' });
      await salvarInscricoes([...lista.filter((x) => x.endpoint !== i.endpoint), i].slice(-20));
      return json(200, { ok: true });
    }
    case 'cancelar':
      await salvarInscricoes(lista.filter((x) => x.endpoint !== corpo.endpoint));
      return json(200, { ok: true });
    case 'testar': {
      const r = await enviarParaTodos({ titulo: 'org-fin', corpo: 'Avisos ligados! Você vai receber os vencimentos na véspera.', url: '/painel' });
      return json(200, r);
    }
    default:
      return json(400, { erro: 'Ação desconhecida.' });
  }
};
