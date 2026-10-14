// Local stand-in for production: serves the built snapshot at /videos/ exactly like nginx
// (dist/www + data/web as media) and mounts the review API at /videos/api/.
//   node scripts/build-static.mjs && node scripts/preview-prod.mjs   →  http://localhost:5760/videos/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHandler } from '../api/server.mjs';
import { ROOT, DATA } from '../lib.mjs';

const WWW = path.join(ROOT, 'dist', 'www');
const MEDIA = path.join(DATA, 'web');
const PORT = Number(process.env.PORT) || 5760;
const api = createHandler({ dataDir: path.join(ROOT, 'dist', 'api-data'), wwwDir: WWW, teamKey: 'local-preview-key' });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };

function serve(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    if (st.isDirectory()) return serve(req, res, path.join(file, 'index.html'));
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const m = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
    if (m) {
      const start = +m[1];
      const end = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/videos') { res.writeHead(308, { Location: '/videos/' }); return res.end(); }
  if (p.startsWith('/videos/api/')) return api(req, res);
  const inside = (base, rel) => { const f = path.resolve(base, rel); return f.startsWith(base + path.sep) || f === base ? f : null; };
  const f = p.startsWith('/videos/media/') ? inside(MEDIA, p.slice('/videos/media/'.length))
    : p.startsWith('/videos/') ? inside(WWW, p.slice('/videos/'.length) || '.') : null;
  if (!f) { res.writeHead(404); return res.end(); }
  serve(req, res, f);
}).listen(PORT, '127.0.0.1', () => console.log(`production preview → http://localhost:${PORT}/videos/`));
