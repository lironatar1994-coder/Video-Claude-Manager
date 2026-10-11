// Local video library — http://localhost:5757
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, DATA, load, register, remove, update, renameProject, scanDir } from './lib.mjs';

const PORT = Number(process.env.PORT) || 5757;
const PUBLIC = path.join(ROOT, 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
  });
}

// Static file with HTTP Range support so videos can seek.
function sendFile(req, res, file, cache = 'no-cache') {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, {
        'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache,
        'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1,
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
    fs.createReadStream(file).pipe(res);
  });
}

function inside(base, rel) {
  const p = path.resolve(base, rel);
  return p.startsWith(path.resolve(base) + path.sep) ? p : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(url.pathname);
  const seg = p.split('/').filter(Boolean);

  try {
    if (p === '/api/videos' && req.method === 'GET') {
      const db = load();
      const videos = db.videos.map(({ hash, ...v }) => ({
        ...v,
        src: `media/${v.id}`,
        poster: v.thumb ? `thumb/${v.id}.jpg` : null,
        name: path.basename(v.source),
      }));
      return json(res, 200, { rev: db.rev, videos });
    }
    if (p === '/api/rev') return json(res, 200, { rev: load().rev });

    if (p === '/api/videos' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.path) return json(res, 400, { error: 'path is required' });
      const out = await register(b.path, b);
      return json(res, out.duplicate ? 200 : 201, out);
    }
    if (p === '/api/scan' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.dir) return json(res, 400, { error: 'dir is required' });
      const out = await scanDir(b.dir, b);
      return json(res, 200, { added: out.filter((r) => !r.duplicate).length, results: out });
    }
    if (seg[0] === 'api' && seg[1] === 'videos' && seg[2]) {
      const id = seg[2];
      if (seg[3] === 'reveal' && req.method === 'POST') {
        const v = load().videos.find((x) => x.id === id);
        if (!v) return json(res, 404, { error: 'not found' });
        const target = fs.existsSync(v.source) ? v.source : path.join(DATA, v.file);
        spawn('explorer.exe', [`/select,${target}`], { detached: true, stdio: 'ignore' }).unref();
        return json(res, 200, { ok: true });
      }
      if (req.method === 'PATCH') {
        const v = update(id, await readBody(req));
        return v ? json(res, 200, { video: v }) : json(res, 404, { error: 'not found' });
      }
      if (req.method === 'DELETE') return json(res, (await remove(id)) ? 200 : 404, {});
    }
    if (p === '/api/projects/rename' && req.method === 'POST') {
      const b = await readBody(req);
      return json(res, 200, { changed: renameProject(b.from, b.to) });
    }

    if (seg[0] === 'media' && seg[1]) {
      const v = load().videos.find((x) => x.id === seg[1]);
      const f = v && inside(DATA, v.file);
      if (!f) { res.writeHead(404); return res.end(); }
      return sendFile(req, res, f, 'max-age=31536000, immutable');
    }
    if (seg[0] === 'thumb' && seg[1]) {
      const f = inside(DATA, path.join('thumbs', path.basename(seg[1])));
      if (!f) { res.writeHead(404); return res.end(); }
      return sendFile(req, res, f, 'max-age=60');
    }

    const f = inside(PUBLIC, p === '/' ? 'index.html' : p.slice(1));
    if (f && fs.existsSync(f)) return sendFile(req, res, f);
    return sendFile(req, res, path.join(PUBLIC, 'index.html'));
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Video library → http://localhost:${PORT}`));
