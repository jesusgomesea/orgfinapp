// Gera src/app/ambiente.ts antes do build/serve, com a URL e a chave PÚBLICA (anon) do Supabase.
// No Netlify os valores vêm das variáveis de ambiente do site; na máquina, do arquivo .env (fora do git).
// A chave anon pode ir para o navegador: quem protege os dados é a RLS do banco (supabase/schema.sql).
// A chave do Gemini NUNCA entra aqui — ela só existe na Netlify Function.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const doArquivo = {};
if (existsSync('.env')) {
  for (const linha of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m) doArquivo[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const ler = (nome) => process.env[nome] ?? doArquivo[nome] ?? '';

const url = ler('SUPABASE_URL');
const chave = ler('SUPABASE_ANON_KEY');
if (!url || !chave) {
  const faltando = [!url && 'SUPABASE_URL', !chave && 'SUPABASE_ANON_KEY'].filter(Boolean).join(' e ');
  // No Netlify, publicar sem as variáveis gera um site que não conecta: melhor o deploy falhar com o motivo.
  // Causa comum: variável criada só com escopo "Functions" (precisa de "Builds") ou deploy feito antes de criá-la.
  if (process.env.NETLIFY === 'true') {
    console.error(`[gerar-ambiente] Faltando ${faltando} no build do Netlify. Confira o escopo "Builds" da variável e faça um novo deploy.`);
    process.exit(1);
  }
  console.warn(`[gerar-ambiente] Faltando ${faltando}: o app abre, mas não conecta. Veja o README.`);
}

writeFileSync(
  'src/app/ambiente.ts',
  `// ARQUIVO GERADO por scripts/gerar-ambiente.mjs — não editar nem versionar.\n` +
    `export const ambiente = ${JSON.stringify({ supabaseUrl: url, supabaseChavePublica: chave }, null, 2)};\n`,
);
