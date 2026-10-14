// Client-review API for https://lawebs.co.il/videos/ — runs on the production server under pm2.
//
// Public (scoped by a project's review token, checked against the deployed release):
//   GET  /videos/api/feedback?token=T          → feedback on that project's videos
//   POST /videos/api/feedback {token, video, kind: approve|changes|comment, text?, at?, name?}
//   POST /videos/api/view     {token, video}
// Team (X-Team-Key header):
//   GET  /videos/api/team?since=N              → every event after id N (feedback + views)
//
// Storage is an append-only JSON-lines file; the whole log is small enough to keep in memory.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const KINDS = new Set(['approve', 'changes', 'comment']);
const TOKEN_RE = /^[A-Za-z0-9_-]{12}$/;
const ID_RE = /^[0-9a-f]{12}$/;

export function createHandler({ dataDir, wwwDir, teamKey }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const logFile = path.join(dataDir, 'events.jsonl');
  const events = [];
  if (fs.existsSync(logFile)) {
    for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { events.push(JSON.parse(line)); } catch { /* skip a torn last line */ }
    }
  }
  let nextId = events.reduce((m, e) => Math.max(m, e.id), 0) + 1;

  // token → { project, ids } read from the live release, re-read when the file changes.
  const tokens = new Map();
  function project(token) {
    if (!TOKEN_RE.test(token || '')) return null;
    const file = path.join(wwwDir, 'p', token, 'data.json');
    let st;
    try { st = fs.statSync(file); } catch { tokens.delete(token); return null; }
    const hit = tokens.get(token);
    if (hit && hit.mtime === st.mtimeMs) return hit;
    try {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      const entry = { mtime: st.mtimeMs, project: d.project, ids: new Set(d.videos.map((v) => v.id)) };
      tokens.set(token, entry);
      return entry;
    } catch { return null; }
  }

  // Simple per-IP budget: plenty for a person, useless for a flood.
  const hits = new Map();
  function allowed(ip, bucket, max, windowMs = 10 * 60e3) {
    const k = bucket + ip;
    const now = Date.now();
    const list = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) return false;
    list.push(now);
    hits.set(k, list);
    return true;
  }
  setInterval(() => { const now = Date.now(); for (const [k, l] of hits) if (!l.some((t) => now - t < 10 * 60e3)) hits.delete(k); }, 60e3).unref();

  function append(e) {
    e.id = nextId++;
    e.ts = new Date().toISOString();
    events.push(e);
    fs.appendFileSync(logFile, JSON.stringify(e) + '\n');
    return e;
  }

  const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
  const publicView = ({ id, ts, video, kind, text, at, name }) => ({ id, ts, video, kind, text, at, name });

  function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  function body(req) {
    return new Promise((resolve) => {
      let s = '';
      let size = 0;
      req.on('data', (c) => { size += c.length; if (size > 16384) { req.destroy(); resolve(null); } else s += c; });
      req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve(null); } });
      req.on('error', () => resolve(null));
    });
  }

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const route = url.pathname.replace(/^\/videos\/api/, '');
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || '';
    try {
      if (route === '/health') return send(res, 200, { ok: true, events: events.length });

      if (route === '/feedback' && req.method === 'GET') {
        const p = project(url.searchParams.get('token'));
        if (!p) return send(res, 404, { error: 'unknown link' });
        return send(res, 200, { events: events.filter((e) => e.kind !== 'view' && p.ids.has(e.video)).map(publicView) });
      }

      if ((route === '/feedback' || route === '/view') && req.method === 'POST') {
        const b = await body(req);
        if (!b) return send(res, 400, { error: 'bad request' });
        const p = project(b.token);
        if (!p || !ID_RE.test(b.video || '') || !p.ids.has(b.video)) return send(res, 404, { error: 'unknown video' });
        if (route === '/view') {
          if (!allowed(ip, 'v', 120)) return send(res, 429, { error: 'slow down' });
          append({ kind: 'view', project: p.project, video: b.video, ua: clean(req.headers['user-agent'], 160) });
          return send(res, 201, { ok: true });
        }
        if (!KINDS.has(b.kind)) return send(res, 400, { error: 'bad kind' });
        const text = clean(b.text, 2000);
        if (b.kind !== 'approve' && !text) return send(res, 400, { error: 'empty comment' });
        if (!allowed(ip, 'f', 40)) return send(res, 429, { error: 'slow down' });
        const at = b.at != null && b.at !== '' && Number.isFinite(+b.at) && +b.at >= 0 && +b.at < 36000 ? Math.round(+b.at * 10) / 10 : null;
        const e = append({ kind: b.kind, project: p.project, video: b.video, text, at, name: clean(b.name, 60) });
        return send(res, 201, { event: publicView(e) });
      }

      if (route === '/team' && req.method === 'GET') {
        const key = String(req.headers['x-team-key'] || '');
        const ok = teamKey && key.length === teamKey.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(teamKey));
        if (!ok) return send(res, 401, { error: 'unauthorized' });
        const since = Number(url.searchParams.get('since')) || 0;
        return send(res, 200, { last: nextId - 1, events: events.filter((e) => e.id > since) });
      }

      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
  };
}

// Run directly (production): PORT, VL_DATA, VL_WWW, VL_TEAM_KEY_FILE
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.VL_DATA || '/var/lib/video-library';
  const keyFile = process.env.VL_TEAM_KEY_FILE || path.join(dataDir, 'team.key');
  const handler = createHandler({
    dataDir,
    wwwDir: process.env.VL_WWW || '/opt/video-library/www/current',
    teamKey: fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '',
  });
  const port = Number(process.env.PORT) || 3192;
  http.createServer(handler).listen(port, '127.0.0.1', () => console.log(`video-library-api on 127.0.0.1:${port}`));
}
