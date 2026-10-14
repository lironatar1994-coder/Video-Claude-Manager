// Background services for the local app:
//   watcher   — new renders in folders we already know get registered on their own
//   light     — 720p share copies made in the background
//   publisher — runs deploy.ps1 -Target Prod, debounced after automatic registrations
//   feedback  — pulls client approvals/comments/views from production
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, DATA, VIDEO_EXT, load, register, ensureLight, needsLight, lightPath } from './lib.mjs';

const log = (...a) => console.log(new Date().toLocaleTimeString('he-IL', { hour12: false }), ...a);

// ---------------------------------------------------------------- light copies
const lightQueue = [];
let lightBusy = false;
export function queueLight(v) {
  if (!needsLight(v) || fs.existsSync(lightPath(v)) || lightQueue.some((x) => x.id === v.id)) return;
  lightQueue.push(v);
  drainLight();
}
async function drainLight() {
  if (lightBusy) return;
  lightBusy = true;
  while (lightQueue.length) {
    const v = lightQueue.shift();
    try { if (await ensureLight(v)) log('light copy', v.project, `v${v.version}`, v.variant); } catch {}
  }
  lightBusy = false;
}
export function lightPending() { return lightQueue.length + (lightBusy ? 1 : 0); }

// ---------------------------------------------------------------- watcher
// Folders that only hold renders. Anything else (assets, node_modules, previews) is ignored.
const RENDER_DIRS = /^(out|output|outputs|render|renders|export|exports|final|v\d+)$/i;
const SKIP_NAME = /(preview|partial|tmp|temp|draft|test|\.part)/i;
const STABLE_MS = 4000;

const watchers = new Map();
const settling = new Map();
const watchEvents = [];

function rootOf(dir) {
  let d = dir;
  while (RENDER_DIRS.test(path.basename(d)) && path.dirname(d) !== d) d = path.dirname(d);
  return d;
}

export function watchedRoots() { return [...watchers.keys()]; }
export function recentIngest() { return watchEvents.slice(-20); }

export function syncWatchers(onIngest) {
  const roots = new Set();
  for (const v of load().videos) {
    const dir = path.dirname(v.source);
    if (fs.existsSync(dir)) roots.add(rootOf(dir));
  }
  for (const root of roots) {
    if (watchers.has(root)) continue;
    try {
      const w = fs.watch(root, { recursive: true }, (_ev, rel) => rel && consider(root, rel.toString(), onIngest));
      w.on('error', () => { watchers.delete(root); });
      watchers.set(root, w);
    } catch { /* folder vanished or not watchable */ }
  }
}

function consider(root, rel, onIngest) {
  const parts = rel.split(/[\\/]/);
  const name = parts.pop();
  if (!VIDEO_EXT.has(path.extname(name).toLowerCase()) || SKIP_NAME.test(name)) return;
  // Only files directly in the project folder or inside render folders (out/, v3/, renders/...).
  if (!parts.every((p) => RENDER_DIRS.test(p))) return;
  const file = path.join(root, rel);
  clearTimeout(settling.get(file));
  settling.set(file, setTimeout(() => settle(file, -1, onIngest), STABLE_MS));
}

// Wait until the file stops growing (renderers write progressively), then register it.
async function settle(file, lastSize, onIngest) {
  let st;
  try { st = fs.statSync(file); } catch { settling.delete(file); return; }
  if (st.size !== lastSize || st.size === 0) {
    settling.set(file, setTimeout(() => settle(file, st.size, onIngest), STABLE_MS));
    return;
  }
  settling.delete(file);
  const db = load();
  const dir = path.dirname(file);
  const byRecent = (a, b) => (b.addedAt > a.addedAt ? 1 : -1);
  const sibling = db.videos.filter((v) => path.dirname(v.source) === dir).sort(byRecent)[0]
    || db.videos.filter((v) => rootOf(path.dirname(v.source)) === rootOf(dir)).sort(byRecent)[0];
  try {
    const r = await register(file, sibling ? { project: sibling.project } : {});
    if (r.duplicate) return;
    log('auto-registered', r.video.project, `v${r.video.version}`, r.video.variant, file);
    watchEvents.push({ at: new Date().toISOString(), id: r.video.id, file });
    queueLight(r.video);
    onIngest?.(r.video);
  } catch (e) {
    // Usually a render that is still being written by a tool that pauses; try again later.
    if (!/Not a video/.test(e.message)) settling.set(file, setTimeout(() => settle(file, -1, onIngest), STABLE_MS * 3));
  }
}

// ---------------------------------------------------------------- publisher
const PUBLISHED = path.join(DATA, 'published.json');
const pub = { running: false, startedAt: null, finishedAt: null, ok: null, log: [], scheduledAt: null };
let pubTimer = null;

export function publishedRev() {
  try { return JSON.parse(fs.readFileSync(PUBLISHED, 'utf8')).rev; } catch { return null; }
}
export function publishState() {
  return { ...pub, log: pub.log.slice(-40), publishedRev: publishedRev() };
}

export function publish() {
  if (pub.running) return false;
  clearTimeout(pubTimer);
  Object.assign(pub, { running: true, startedAt: new Date().toISOString(), finishedAt: null, ok: null, log: [], scheduledAt: null });
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'deploy.ps1'), '-Target', 'Prod'], {
    cwd: ROOT, windowsHide: true,
  });
  const take = (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      // nginx -t chatter from other sites on the server is noise here.
      if (line.trim() && !/\[warn\]|^nginx: /.test(line)) pub.log.push(line.trimEnd());
    }
    if (pub.log.length > 400) pub.log.splice(0, pub.log.length - 400);
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  child.on('close', (code) => {
    Object.assign(pub, { running: false, finishedAt: new Date().toISOString(), ok: code === 0 });
    log('publish', code === 0 ? 'ok' : `failed (${code})`);
  });
  return true;
}

// Automatic registrations publish themselves once things go quiet.
export function schedulePublish(delayMs = 90e3) {
  clearTimeout(pubTimer);
  pub.scheduledAt = new Date(Date.now() + delayMs).toISOString();
  pubTimer = setTimeout(() => { pub.scheduledAt = null; publish(); }, delayMs);
}

// ---------------------------------------------------------------- feedback sync
// VL_DATA_FEEDBACK / VL_TEAM_URL / VL_TEAM_KEY point the sync at scripts/preview-prod.mjs for testing.
const FEEDBACK = process.env.VL_DATA_FEEDBACK || path.join(DATA, 'feedback.json');
const TEAM_KEY = path.join(DATA, 'team.key');
const TEAM_URL = process.env.VL_TEAM_URL || 'https://lawebs.co.il/videos/api/team';
const fb = { lastSync: null, error: null };

export function loadFeedback() {
  try { return JSON.parse(fs.readFileSync(FEEDBACK, 'utf8')); } catch { return { last: 0, events: [] }; }
}

export async function syncFeedback() {
  const key = process.env.VL_TEAM_KEY || (fs.existsSync(TEAM_KEY) ? fs.readFileSync(TEAM_KEY, 'utf8').trim() : '');
  if (!key) { fb.error = 'no team key yet (publish once)'; return 0; }
  const cur = loadFeedback();
  try {
    const r = await fetch(`${TEAM_URL}?since=${cur.last}`, { headers: { 'X-Team-Key': key }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    fb.lastSync = new Date().toISOString();
    fb.error = null;
    if (!j.events.length) return 0;
    cur.events.push(...j.events);
    cur.last = j.last;
    const tmp = FEEDBACK + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cur));
    fs.renameSync(tmp, FEEDBACK);
    log('feedback +', j.events.length);
    return j.events.length;
  } catch (e) {
    fb.error = e.message;
    return 0;
  }
}
export function feedbackState() { return { ...fb }; }
