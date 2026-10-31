// Gera os ícones do PWA (public/icons/*.png) sem dependências: fundo quase preto e três barras subindo,
// a última no verde-limão de destaque (mesmos tokens de src/styles.scss).
// O desenho fica dentro dos 80% centrais para funcionar como ícone "maskable" (Android corta as bordas).
// Rodar só quando quiser mudar o ícone: node scripts/gerar-icones.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TAMANHOS = [72, 96, 128, 144, 152, 192, 384, 512];
const FUNDO = [9, 9, 11];
const BARRAS = [[63, 63, 70], [113, 113, 122], [207, 255, 4]];

function desenhar(n) {
  const px = Buffer.alloc(n * n * 3);
  for (let i = 0; i < n * n; i++) px.set(FUNDO, i * 3);
  // Três barras na área segura (de 25% a 75%), alturas crescentes.
  const base = 0.72, larg = 0.13, gap = 0.055, inicio = 0.5 - (3 * larg + 2 * gap) / 2;
  [0.28, 0.4, 0.52].forEach((altura, b) => {
    const x0 = Math.round((inicio + b * (larg + gap)) * n), x1 = Math.round((inicio + b * (larg + gap) + larg) * n);
    const y0 = Math.round((base - altura) * n), y1 = Math.round(base * n);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.set(BARRAS[b], (y * n + x) * 3);
  });
  return px;
}

function png(n, px) {
  const linhas = Buffer.alloc((n * 3 + 1) * n);
  for (let y = 0; y < n; y++) px.copy(linhas, y * (n * 3 + 1) + 1, y * n * 3, (y + 1) * n * 3);
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo);
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
    return Buffer.concat([tam, t, dados, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloco('IHDR', ihdr), bloco('IDAT', deflateSync(linhas)), bloco('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}

for (const n of TAMANHOS) writeFileSync(`public/icons/icon-${n}x${n}.png`, png(n, desenhar(n)));
console.log('Ícones gerados em public/icons/');
