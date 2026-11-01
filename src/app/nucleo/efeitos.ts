// Pequenos retornos físicos e visuais:
//  - vibrar(): toque leve no celular ao salvar/marcar pago (Android; o iPhone não libera vibração para sites);
//  - comemorar(): chuva de confete ao bater a meta de um cofre. Feito à mão num <canvas> (sem biblioteca),
//    some sozinho em ~2,5 s e respeita "reduzir movimento".
const reduzMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function vibrar(ms: number | number[] = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sem suporte */
  }
}

export function comemorar(cores = ['#cfff04', '#a78bfa', '#38bdf8', '#f472b6', '#fb923c', '#ffffff']) {
  vibrar([20, 40, 20]);
  if (reduzMovimento()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confete';
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const pedacos = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 13 - 4,
    giro: Math.random() * Math.PI,
    vg: (Math.random() - 0.5) * 0.3,
    tam: 5 + Math.random() * 6,
    cor: cores[Math.floor(Math.random() * cores.length)],
  }));

  const inicio = performance.now();
  const quadro = (t: number) => {
    const passou = t - inicio;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, passou - 1600) / 900);
    for (const p of pedacos) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.giro += p.vg;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.fillStyle = p.cor;
      ctx.fillRect(-p.tam / 2, -p.tam / 4, p.tam, p.tam / 2);
      ctx.restore();
    }
    if (passou < 2500) requestAnimationFrame(quadro);
    else canvas.remove();
  };
  requestAnimationFrame(quadro);
}
