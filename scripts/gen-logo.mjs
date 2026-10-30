// Genera el logo de ZeckClips (SVG 1024x1024) en el estilo de la referencia: cartoon + minimalista + anime.
import fs from 'node:fs';
const out = process.argv[2];
const C = { bg: '#111111', bg2: '#1d1d1f', ink: '#0b0b0b', org: '#FF7A00', orgD: '#D95E00', orgL: '#FFA24A', yel: '#FFC400', yelD: '#E09A00', yelL: '#FFE58A' };
const f = n => +n.toFixed(1);

// Líneas de concentración (manga) alrededor del punto de corte
const cx = 512, cy = 520;
let speed = '';
for (let i = 0; i < 36; i++) {
  const a = (i / 36) * Math.PI * 2 + (i % 2 ? 0.03 : 0);
  const r1 = 360 + (i % 3) * 45, r2 = 900, w = 0.018 + (i % 4) * 0.006;
  const p = (r, d) => `${f(cx + Math.cos(a + d) * r)},${f(cy + Math.sin(a + d) * r)}`;
  speed += `<polygon points="${p(r1, 0)} ${p(r2, -w)} ${p(r2, w)}"/>`;
}

// Tira de película (un trozo), en coordenadas locales: x0..x1, alto 190
function strip(x0, x1) {
  const y0 = -95, h = 190;
  let s = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${h}" fill="${C.org}"/>`;
  s += `<rect x="${x0}" y="${y0 + h - 26}" width="${x1 - x0}" height="26" fill="${C.orgD}"/>`; // sombra cartoon
  s += `<rect x="${x0}" y="${y0 + 8}" width="${x1 - x0}" height="8" fill="${C.orgL}"/>`;       // brillo
  for (let x = x0 + 14; x < x1 - 30; x += 62) {
    s += `<rect x="${x}" y="${y0 + 22}" width="34" height="26" rx="7" fill="${C.ink}"/>`;
    s += `<rect x="${x}" y="${y0 + h - 50}" width="34" height="26" rx="7" fill="${C.ink}"/>`;
  }
  for (let x = x0 + 20; x < x1 - 120; x += 164) {
    s += `<rect x="${x}" y="${y0 + 62}" width="140" height="66" rx="12" fill="${C.yel}"/>`;
    s += `<rect x="${x}" y="${y0 + 112}" width="140" height="16" rx="8" fill="${C.yelD}"/>`;
    s += `<rect x="${x + 14}" y="${y0 + 72}" width="40" height="9" rx="4.5" fill="${C.yelL}"/>`;
  }
  return s;
}

// Destello estilo anime (estrella de 4 puntas)
const spark = (x, y, r, fill) =>
  `<path d="M${x},${y - r} C${x + r * .12},${y - r * .12} ${x + r * .12},${y - r * .12} ${x + r},${y} C${x + r * .12},${y + r * .12} ${x + r * .12},${y + r * .12} ${x},${y + r} C${x - r * .12},${y + r * .12} ${x - r * .12},${y + r * .12} ${x - r},${y} C${x - r * .12},${y - r * .12} ${x - r * .12},${y - r * .12} ${x},${y - r}Z" fill="${fill}"/>`;

const bladeL = 'M492,575 C430,430 360,300 300,150 C405,270 488,395 560,540 Z';
const bladeR = 'M528,585 C560,420 552,270 512,100 C600,250 628,420 600,575 Z';
const armL = 'M498,560 L462,800 L522,808 L556,575 Z';
const armR = 'M560,555 L690,760 L740,724 L606,535 Z';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>
  <radialGradient id="g" cx="50%" cy="48%" r="65%"><stop offset="0" stop-color="${C.bg2}"/><stop offset="1" stop-color="${C.bg}"/></radialGradient>
  <clipPath id="c"><rect width="1024" height="1024" rx="230"/></clipPath>
</defs>
<g clip-path="url(#c)">
  <rect width="1024" height="1024" fill="url(#g)"/>
  <g fill="#ffffff" opacity=".07">${speed}</g>
  <g transform="translate(512 500) rotate(-14)">
    <g transform="translate(-8 14) rotate(4)">${strip(-760, -40)}</g>
    <g transform="translate(14 -10) rotate(-3)">${strip(40, 760)}</g>
    <path d="M-30,-120 L-6,-30 L-34,10 L-8,120" fill="none" stroke="${C.yelL}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>
  </g>
  <g stroke="${C.ink}" stroke-width="22" stroke-linejoin="round" stroke-linecap="round">
    <path d="${armL}" fill="${C.org}"/><path d="${armR}" fill="${C.org}"/>
    <circle cx="470" cy="880" r="100" fill="none" stroke-width="80"/>
    <circle cx="760" cy="810" r="100" fill="none" stroke-width="80"/>
  </g>
  <circle cx="470" cy="880" r="100" fill="none" stroke="${C.org}" stroke-width="46"/>
  <circle cx="760" cy="810" r="100" fill="none" stroke="${C.org}" stroke-width="46"/>
  <path d="M398,820 A82,82 0 0 1 452,792" fill="none" stroke="${C.orgL}" stroke-width="10" stroke-linecap="round"/>
  <path d="M690,746 A82,82 0 0 1 744,722" fill="none" stroke="${C.orgL}" stroke-width="10" stroke-linecap="round"/>
  <g stroke="${C.ink}" stroke-width="22" stroke-linejoin="round">
    <path d="${bladeL}" fill="${C.yel}"/><path d="${bladeR}" fill="${C.yel}"/>
  </g>
  <path d="M352,248 C400,330 445,410 488,500" fill="none" stroke="${C.yelL}" stroke-width="12" stroke-linecap="round"/>
  <path d="M532,190 C556,290 565,390 560,480" fill="none" stroke="${C.yelL}" stroke-width="12" stroke-linecap="round"/>
  <circle cx="548" cy="560" r="44" fill="${C.ink}"/>
  <circle cx="548" cy="560" r="18" fill="${C.org}"/>
  ${spark(225, 230, 62, C.yel)}${spark(640, 150, 34, '#ffffff')}${spark(860, 560, 44, C.yelL)}${spark(150, 720, 26, '#ffffff')}
</g>
</svg>`;
fs.writeFileSync(out, svg);
console.log('ok', out);
