// Notificações (Web Push) dos lembretes de vencimento.
// - As chaves VAPID (que identificam o servidor para Apple/Google) são criadas sozinhas na primeira vez e guardadas
//   no Netlify Blobs: ninguém precisa gerar nem configurar variável.
// - As inscrições (um endereço por aparelho que ativou os avisos) também ficam no Blobs.
// - O formato da mensagem é o que o service worker do Angular entende (campo "notification").
import { getStore } from '@netlify/blobs';
import webpush, { type PushSubscription } from 'web-push';

const loja = () => getStore({ name: 'orgfin', consistency: 'strong' });

export async function chavesVapid(): Promise<{ publicKey: string; privateKey: string }> {
  const salvas = (await loja().get('vapid', { type: 'json' })) as { publicKey: string; privateKey: string } | null;
  if (salvas) return salvas;
  const novas = webpush.generateVAPIDKeys();
  const r = await loja().setJSON('vapid', novas, { onlyIfNew: true });
  // Se outro pedido criou ao mesmo tempo, vale a que ficou gravada.
  return r.modified ? novas : ((await loja().get('vapid', { type: 'json' })) as { publicKey: string; privateKey: string });
}

export async function inscricoes(): Promise<PushSubscription[]> {
  return ((await loja().get('inscricoes', { type: 'json' })) as PushSubscription[] | null) ?? [];
}

export async function salvarInscricoes(lista: PushSubscription[]) {
  await loja().setJSON('inscricoes', lista);
}

export interface Notificacao {
  titulo: string;
  corpo: string;
  url?: string;
}

/** Envia para todos os aparelhos inscritos; tira da lista os que não existem mais (app removido, permissão negada). */
export async function enviarParaTodos(n: Notificacao): Promise<{ enviados: number; removidos: number }> {
  const { publicKey, privateKey } = await chavesVapid();
  webpush.setVapidDetails('mailto:avisos@orgfin.app', publicKey, privateKey);
  const payload = JSON.stringify({
    notification: {
      title: n.titulo,
      body: n.corpo,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: n.url ?? '/painel' } } },
    },
  });
  const lista = await inscricoes();
  const validas: PushSubscription[] = [];
  let enviados = 0;
  for (const i of lista) {
    try {
      await webpush.sendNotification(i, payload, { TTL: 60 * 60 * 12 });
      validas.push(i);
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status !== 404 && status !== 410) validas.push(i); // erro passageiro: tenta de novo amanhã
    }
  }
  if (validas.length !== lista.length) await salvarInscricoes(validas);
  return { enviados, removidos: lista.length - validas.length };
}
