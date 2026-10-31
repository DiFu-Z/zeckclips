// Servidor local de ZeckClips: sirve la app y descarga / convierte vídeos con yt-dlp y ffmpeg.
// Lo arranca main.js dentro de la app de escritorio; también funciona solo: `node server.js` → http://localhost:5178
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');

const MAX_HEIGHT = 1080;
const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.m4v', '.mkv'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
const EXE = process.platform === 'win32' ? '.exe' : '';
const PROGRESS = new Map(); // id de descarga -> { pct, msg } para la barra de la app

// busca un programa: primero en los binarios incluidos con la app, luego en el sistema
function finder(binDir) {
  const extra = [binDir, path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean);
  const dirs = [...extra, ...(process.env.PATH || '').split(path.delimiter)];
  const cache = {};
  return name => {
    if (name in cache) return cache[name];
    for (const d of dirs) {
      const p = path.join(d, name + EXE);
      try { fs.accessSync(p, fs.constants.X_OK); return (cache[name] = p); } catch {}
    }
    return (cache[name] = null);
  };
}

function createServer({ root, binDir, nodeRuntime }) {
  const find = finder(binDir);

  // YouTube necesita un motor de JavaScript: deno/node del sistema o, en la app, el propio Electron como Node
  function ytdlp() {
    const exe = find('yt-dlp');
    if (!exe) return null;
    const args = [], env = { ...process.env, PYTHONUNBUFFERED: '1' };
    const rt = find('deno') ? ['deno', find('deno')] : find('node') ? ['node', find('node')] : nodeRuntime ? ['node', nodeRuntime] : null;
    if (rt) args.push('--js-runtimes', `${rt[0]}:${rt[1]}`);
    if (rt && rt[1] === nodeRuntime) env.ELECTRON_RUN_AS_NODE = '1';
    if (find('ffmpeg')) args.push('--ffmpeg-location', find('ffmpeg'));
    return { exe, args, env };
  }

  const json = (res, code, obj) => { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': b.length }); res.end(b); };
  const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zeckclips-'));
  const rm = d => fs.rm(d, { recursive: true, force: true }, () => {});
  const sendFile = (res, file, type, name) => {
    const h = { 'Content-Type': type, 'Content-Length': fs.statSync(file).size };
    if (name) h['X-Filename'] = encodeURIComponent(name);
    res.writeHead(200, h);
    return new Promise(r => fs.createReadStream(file).on('close', r).pipe(res));
  };
  const run = (exe, args, opts, onLine) => new Promise(resolve => {
    const p = spawn(exe, args, { ...opts, windowsHide: true });
    const last = []; let buf = '';
    const feed = d => { buf += d; const lines = buf.split(/\r?\n|\r/); buf = lines.pop();
      for (const l of lines) { last.push(l.trim()); if (last.length > 8) last.shift(); onLine && onLine(l); } };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', e => resolve({ code: -1, last: [String(e.message)] }));
    p.on('close', code => resolve({ code, last }));
  });

  async function download(req, res, url, job) {
    if (!/^https?:\/\//i.test(url)) return json(res, 400, { error: 'La URL debe empezar por http:// o https://' });
    const tmp = tmpDir();
    try {
      // 1) enlace directo a un archivo de vídeo
      let name = decodeURIComponent(path.basename(new URL(url).pathname)) || 'video.mp4';
      let ctype = '';
      try { ctype = (await fetch(url, { method: 'HEAD', redirect: 'follow' })).headers.get('content-type') || ''; } catch {}
      if (ctype.startsWith('video/') || VIDEO_EXT.includes(path.extname(name).toLowerCase())) {
        const r = await fetch(url, { redirect: 'follow' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const out = path.join(tmp, 'video' + (path.extname(name) || '.mp4'));
        await new Promise((ok, ko) => Readable.fromWeb(r.body).pipe(fs.createWriteStream(out)).on('finish', ok).on('error', ko));
        return await sendFile(res, out, ctype.startsWith('video/') ? ctype : 'video/mp4', name);
      }
      // 2) plataformas (YouTube, Twitch, TikTok…) con yt-dlp
      const y = ytdlp();
      if (!y) throw new Error('Falta yt-dlp para descargar de YouTube, Twitch, TikTok… Los enlaces directos a .mp4 funcionan sin él.');
      const fmt = find('ffmpeg')
        ? `bv*[height<=${MAX_HEIGHT}][ext=mp4]+ba[ext=m4a]/b[height<=${MAX_HEIGHT}][ext=mp4]/bv*[height<=${MAX_HEIGHT}]+ba/b`
        : `b[height<=${MAX_HEIGHT}][ext=mp4]/b`; // sin ffmpeg no se pueden unir vídeo y audio separados
      PROGRESS.set(job, { pct: 3, msg: 'Analizando el enlace (puede tardar hasta un minuto)…' });
      let part = 0;
      const r = await run(y.exe, [...y.args, '--no-playlist', '--newline', '-f', fmt, '--merge-output-format', 'mp4',
        '-o', path.join(tmp, '%(title).80s.%(ext)s'), url], { env: y.env }, line => {
        const m = line.match(/\[download\]\s+([\d.]+)%/);
        if (m) {
          const pct = parseFloat(m[1]);
          if (pct < 1 && (PROGRESS.get(job)?.pct || 0) > 40) part = 1; // segunda parte (el audio)
          PROGRESS.set(job, { pct, msg: `${part ? 'Descargando audio' : 'Descargando vídeo'} ${pct.toFixed(0)}%` });
        } else if (line.includes('[Merger]')) PROGRESS.set(job, { pct: 100, msg: 'Uniendo vídeo y audio…' });
      });
      const file = fs.readdirSync(tmp).find(f => VIDEO_EXT.includes(path.extname(f).toLowerCase()));
      if (r.code !== 0 || !file) throw new Error('No se pudo descargar: ' + ([...r.last].reverse().find(l => l.includes('ERROR')) || r.last.at(-1) || 'error desconocido'));
      await sendFile(res, path.join(tmp, file), file.endsWith('.webm') ? 'video/webm' : 'video/mp4', file);
    } catch (e) {
      if (!res.headersSent) json(res, 502, { error: e.message });
    } finally { rm(tmp); PROGRESS.delete(job); }
  }

  // convierte la grabación del navegador en un MP4 estándar (H.264 + AAC, 30 fps, faststart)
  async function toMp4(req, res, src) {
    const ffmpeg = find('ffmpeg');
    if (!ffmpeg) return json(res, 501, { error: 'ffmpeg no está instalado' });
    const tmp = tmpDir();
    try {
      const inp = path.join(tmp, src === 'mp4' ? 'in.mp4' : 'in.webm'), out = path.join(tmp, 'out.mp4');
      await new Promise((ok, ko) => req.pipe(fs.createWriteStream(inp)).on('finish', ok).on('error', ko));
      const encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'];
      // el MP4 de Chromium ya es H.264: basta con reordenarlo; si falla, se recodifica
      const attempts = [...(src === 'mp4' ? [['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k']] : []), encode];
      let r;
      for (const opts of attempts) {
        r = await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', inp, ...opts, '-movflags', '+faststart', out], {});
        if (r.code === 0 && fs.existsSync(out) && fs.statSync(out).size > 0) return await sendFile(res, out, 'video/mp4');
      }
      throw new Error('ffmpeg: ' + (r.last.at(-1) || 'error'));
    } catch (e) {
      if (!res.headersSent) json(res, 500, { error: e.message });
    } finally { rm(tmp); }
  }

  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const q = k => u.searchParams.get(k) || '';
    if (u.pathname === '/api/status') return json(res, 200, { ytdlp: !!ytdlp(), ffmpeg: !!find('ffmpeg') });
    if (u.pathname === '/api/progress') return json(res, 200, PROGRESS.get(q('id')) || {});
    if (u.pathname === '/api/download') return download(req, res, q('url').trim(), q('id'));
    if (u.pathname === '/api/mp4' && req.method === 'POST') return toMp4(req, res, q('from'));
    // archivos estáticos de la app
    const file = path.join(root, path.normalize(decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

// arranca en el primer puerto libre a partir de `port` (puerto fijo = la app recuerda tus ajustes y el modelo descargado)
function listen(server, port, tries = 20) {
  return new Promise((resolve, reject) => {
    server.once('error', e => (e.code === 'EADDRINUSE' && tries > 1 ? listen(server, port + 1, tries - 1).then(resolve, reject) : reject(e)));
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

const platformDir = () => `${{ darwin: 'mac', win32: 'win' }[process.platform] || 'linux'}-${process.arch}`;

module.exports = { createServer, listen, platformDir };

if (require.main === module) {
  const server = createServer({ root: path.join(__dirname, 'app'), binDir: path.join(__dirname, 'bin', platformDir()) });
  listen(server, +process.env.PORT || 5178).then(p => console.log(`ZeckClips en http://localhost:${p}`));
}
