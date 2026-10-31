// Descarga ffmpeg y yt-dlp para cada sistema en bin/<so>-<arquitectura>/, que el instalador incluye en la app.
// Uso: node scripts/fetch-bins.mjs [mac|win|linux|all]   (sin argumento: solo el sistema actual)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1';
const YTDLP = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

// destino → [nombre de ffmpeg-static, ejecutable de yt-dlp]
const TARGETS = {
  'mac-x64': ['darwin-x64', 'yt-dlp_macos'],
  'mac-arm64': ['darwin-arm64', 'yt-dlp_macos'],
  'win-x64': ['win32-x64', 'yt-dlp.exe'],
  'linux-x64': ['linux-x64', 'yt-dlp_linux'],
  'linux-arm64': ['linux-arm64', 'yt-dlp_linux_aarch64'],
};

const current = `${{ darwin: 'mac', win32: 'win' }[process.platform] || 'linux'}-${process.arch}`;
const want = process.argv[2] || current;
const list = Object.keys(TARGETS).filter(t => want === 'all' || t === want || t.startsWith(want + '-'));
if (!list.length) { console.error(`Sistema desconocido: ${want}`); process.exit(1); }

async function get(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} al descargar ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

let sums;
async function ytdlpSum(name) {
  sums ??= Object.fromEntries((await get(`${YTDLP}/SHA2-256SUMS`)).toString().trim().split('\n').map(l => l.trim().split(/\s+/).reverse()));
  return sums[name];
}

for (const t of list) {
  const [ff, yt] = TARGETS[t], win = t.startsWith('win'), dir = path.join(ROOT, 'bin', t);
  fs.mkdirSync(dir, { recursive: true });
  const ffOut = path.join(dir, win ? 'ffmpeg.exe' : 'ffmpeg'), ytOut = path.join(dir, win ? 'yt-dlp.exe' : 'yt-dlp');

  if (!fs.existsSync(ffOut)) {
    process.stdout.write(`${t}: ffmpeg… `);
    fs.writeFileSync(ffOut, zlib.gunzipSync(await get(`${FFMPEG}/ffmpeg-${ff}.gz`)), { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'ffmpeg-LICENSE.txt'), zlib.gunzipSync(await get(`${FFMPEG}/${ff}.LICENSE.gz`)));
    console.log('ok');
  }
  if (!fs.existsSync(ytOut)) {
    process.stdout.write(`${t}: yt-dlp… `);
    const bin = await get(`${YTDLP}/${yt}`);
    const hash = crypto.createHash('sha256').update(bin).digest('hex');
    if (hash !== await ytdlpSum(yt)) throw new Error(`La suma SHA-256 de ${yt} no coincide`);
    fs.writeFileSync(ytOut, bin, { mode: 0o755 });
    console.log('ok (verificado)');
  }
}
console.log('Binarios listos en bin/:', list.join(', '));
