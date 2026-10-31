// Assistente: responde perguntas sobre as finanças ("quanto gastei com mercado este ano?", "onde posso economizar?").
// Lê o banco no próprio servidor (Netlify Blobs), monta um resumo em texto (netlify/lib/resumo.mts) e manda para
// o Gemini junto com a conversa. O navegador só envia a pergunta e as últimas mensagens.
import { getStore } from '@netlify/blobs';
import { chamarGemini, descreverHoje, ErroGemini, hojeValido, type Mensagem } from '../lib/gemini.mts';
import { bancoVazio, normalizar, type Banco } from '../lib/operacoes.mts';
import { resumoParaIa } from '../lib/resumo.mts';
import { autorizado, json } from '../lib/sessao.mts';

const LIMITE_PERGUNTA = 600;
const MENSAGENS_ANTERIORES = 8;

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { erro: 'Use POST.' });
  if (!autorizado(req)) return json(401, { erro: 'Sessão expirada. Entre de novo.' });

  const corpo = (await req.json().catch(() => null)) as
    | { pergunta?: string; hoje?: string; historico?: { de: 'voce' | 'app'; texto: string }[] }
    | null;
  const pergunta = (corpo?.pergunta ?? '').trim();
  if (!pergunta) return json(400, { erro: 'Escreva sua pergunta.' });
  if (pergunta.length > LIMITE_PERGUNTA) return json(400, { erro: 'Pergunta muito longa.' });
  const hoje = hojeValido(corpo?.hoje);

  const salvo = await getStore({ name: 'orgfin', consistency: 'strong' }).get('banco', { type: 'json' });
  const banco = salvo ? normalizar(salvo as Banco) : bancoVazio();

  const instrucao =
    'Você é o assistente financeiro pessoal do app org-fin. Responda em português do Brasil, curto, direto e gentil, ' +
    'usando SOMENTE os dados abaixo. Use valores em reais (R$ 1.234,56). Quando fizer conta, mostre o resultado, não a fórmula. ' +
    'Se o dado não existir, diga que não tem essa informação no app. Pode sugerir economias concretas com base nos números. ' +
    'Não dê recomendação de investimento específica (ações, fundos); se pedirem, diga que não é consultor e sugira procurar um profissional. ' +
    'Sem markdown pesado: no máximo listas curtas com "- ".\n' +
    `${descreverHoje(hoje)}\n\nDADOS:\n${resumoParaIa(banco, hoje)}`;

  const conversa: Mensagem[] = (corpo?.historico ?? [])
    .slice(-MENSAGENS_ANTERIORES)
    .filter((m) => m?.texto)
    .map((m) => ({ role: m.de === 'voce' ? 'user' : 'model', parts: [{ text: String(m.texto).slice(0, 1500) }] }));
  conversa.push({ role: 'user', parts: [{ text: pergunta }] });

  try {
    const resposta = (await chamarGemini({ instrucao, conversa, temperatura: 0.3 })) as string;
    return json(200, { resposta: resposta || 'Não consegui responder agora.' });
  } catch (e) {
    if (e instanceof ErroGemini) return json(e.status, { erro: e.message });
    throw e;
  }
};
