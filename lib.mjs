// Shared registry logic — used by both the server and the CLI.
// Each registered video is copied into data/library so older versions survive
// even when a render overwrites the original file in place.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const DATA = path.join(ROOT, 'data');
export const LIBRARY = path.join(DATA, 'library');
export const THUMBS = path.join(DATA, 'thumbs');
const DB = path.join(DATA, 'videos.json');

export const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv']);

// Folder names that never name a project on their own.
const GENERIC_DIRS = /^(out|output|outputs|render|renders|export|exports|dist|build|final|video|videos|media|preview|previews|v\d+)$/i;
// Filename tokens treated as a variant of the same video rather than part of its title.
const VARIANT_TOKENS = new Set([
  'dark', 'light', 'dubbed', 'feed', 'story', 'reel', 'square', 'vertical', 'horizontal',
  'landscape', 'portrait', 'wide', 'preview', 'draft', 'final', 'he', 'en', 'ar', 'ru',
  '9x16', '16x9', '4x5', '1x1', 'mute', 'muted', 'nosound', 'subs', 'subtitled', 'hq', 'lq',
  'share', 'voice', 'vo', 'female', 'male', 'music', 'silent', 'short', 'long', 'cut',
]);

function ensureDirs() {
  for (const d of [DATA, LIBRARY, THUMBS]) fs.mkdirSync(d, { recursive: true });
}

export function load() {
  ensureDirs();
  try {
    return JSON.parse(fs.readFileSync(DB, 'utf8'));
  } catch {
    return { rev: 0, videos: [] };
  }
}

export function save(db) {
  ensureDirs();
  db.rev = (db.rev || 0) + 1;
  const tmp = DB + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB);
  return db;
}

export function slug(s) {
  return String(s).trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'untitled';
}

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout) => resolve(err ? null : stdout));
  });
}

async function probe(file) {
  const out = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file,
  ]);
  if (!out) return {};
  try {
    const j = JSON.parse(out);
    const s = j.streams?.[0] || {};
    return { width: s.width || null, height: s.height || null, duration: Number(j.format?.duration) || null };
  } catch {
    return {};
  }
}

// Grab a representative frame a third of the way in (skips fade-ins / black openers).
async function makeThumb(file, dest, duration) {
  const at = duration ? duration * 0.3 : 2;
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', at.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'thumbnail=30,scale=480:-2', '-q:v', '4', dest]);
  return fs.existsSync(dest);
}

export async function rethumbAll() {
  const db = load();
  for (const v of db.videos) {
    const dest = path.join(THUMBS, `${v.id}.jpg`);
    if (await makeThumb(path.join(DATA, v.file), dest, v.duration)) v.thumb = path.relative(DATA, dest);
  }
  save(db);
  return db.videos.length;
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });
}

// Work out project / title / version / variant from the file's location and name.
export function infer(src) {
  const dir = path.dirname(src);
  const ext = path.extname(src);
  let tokens = path.basename(src, ext).split(/[-_.\s]+/).filter(Boolean);

  let version = null;
  const dirVer = path.basename(dir).match(/^v(\d+)$/i);
  if (dirVer) version = Number(dirVer[1]);
  tokens = tokens.filter((t) => {
    const m = t.match(/^v(\d+)$/i);
    if (m) { version = Number(m[1]); return false; }
    return true;
  });

  const variant = [];
  const title = [];
  // Everything from the first variant token on describes the variant ("dark-voice-female").
  for (const t of tokens) (variant.length || (VARIANT_TOKENS.has(t.toLowerCase()) && title.length) ? variant : title).push(t);

  let p = dir;
  while (GENERIC_DIRS.test(path.basename(p)) && path.dirname(p) !== p) p = path.dirname(p);

  return {
    project: path.basename(p),
    title: title.join('-') || path.basename(src, ext),
    version,
    variant: variant.join(' · ').replace(/\b(voice|vo) · /gi, '$1-'),
  };
}

// Register a video file. Options override anything inferred from the path.
export async function register(srcPath, opts = {}) {
  const src = path.resolve(srcPath);
  const st = await fsp.stat(src).catch(() => null);
  if (!st || !st.isFile()) throw new Error(`File not found: ${src}`);
  const ext = path.extname(src).toLowerCase();
  if (!VIDEO_EXT.has(ext)) throw new Error(`Not a video file: ${src}`);

  const guess = infer(src);
  const project = (opts.project || guess.project).trim();
  const title = (opts.title || guess.title).trim();
  const variant = (opts.variant ?? guess.variant).trim();
  const hash = await hashFile(src);

  const db = load();
  const dupe = db.videos.find((v) => v.hash === hash && slug(v.project) === slug(project));
  if (dupe) {
    // Same bytes already in this project: allow updating the note / labels, nothing else.
    let changed = false;
    for (const k of ['note', 'variant', 'title']) {
      if (opts[k] != null && opts[k] !== dupe[k]) { dupe[k] = opts[k]; changed = true; }
    }
    if (opts.version != null && Number(opts.version) !== dupe.version) { dupe.version = Number(opts.version); changed = true; }
    if (changed) save(db);
    return { video: dupe, duplicate: true };
  }

  let version = opts.version != null ? Number(String(opts.version).replace(/^v/i, '')) : guess.version;
  if (version == null || Number.isNaN(version)) {
    // No version in the name: continue from the latest version of this title.
    // A variant that already exists there means this is a newer render → next version.
    const same = db.videos.filter((v) => slug(v.project) === slug(project) && slug(v.title) === slug(title));
    const max = same.reduce((m, v) => Math.max(m, v.version || 0), 0);
    const taken = same.some((v) => v.version === max && slug(v.variant) === slug(variant));
    version = max === 0 ? 1 : taken ? max + 1 : max;
  }

  const id = crypto.randomBytes(6).toString('hex');
  const libDir = path.join(LIBRARY, slug(project));
  await fsp.mkdir(libDir, { recursive: true });
  const file = path.join(libDir, `${id}${ext}`);
  await fsp.copyFile(src, file);

  const meta = await probe(file);
  const thumbPath = path.join(THUMBS, `${id}.jpg`);
  const hasThumb = await makeThumb(file, thumbPath, meta.duration);

  const video = {
    id,
    project,
    title,
    version,
    variant,
    note: opts.note || '',
    source: src,
    file: path.relative(DATA, file),
    thumb: hasThumb ? path.relative(DATA, thumbPath) : null,
    width: meta.width || null,
    height: meta.height || null,
    duration: meta.duration || null,
    size: st.size,
    createdAt: (opts.createdAt ? new Date(opts.createdAt) : st.mtime).toISOString(),
    addedAt: new Date().toISOString(),
    hash,
  };

  // Re-read right before writing so a concurrent register isn't lost.
  const fresh = load();
  fresh.videos.push(video);
  save(fresh);
  return { video, duplicate: false };
}

export async function remove(id) {
  const db = load();
  const v = db.videos.find((x) => x.id === id);
  if (!v) return false;
  db.videos = db.videos.filter((x) => x.id !== id);
  save(db);
  for (const rel of [v.file, v.thumb]) if (rel) await fsp.rm(path.join(DATA, rel), { force: true });
  return true;
}

export function update(id, patch) {
  const db = load();
  const v = db.videos.find((x) => x.id === id);
  if (!v) return null;
  for (const k of ['project', 'title', 'variant', 'note']) if (typeof patch[k] === 'string') v[k] = patch[k].trim();
  if (patch.version != null) v.version = Number(String(patch.version).replace(/^v/i, ''));
  save(db);
  return v;
}

export function renameProject(from, to) {
  const db = load();
  let n = 0;
  for (const v of db.videos) if (v.project === from) { v.project = to.trim(); n++; }
  if (n) save(db);
  return n;
}

export async function scanDir(dir, opts = {}) {
  const found = [];
  const walk = async (d) => {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (VIDEO_EXT.has(path.extname(e.name).toLowerCase())) found.push(p);
    }
  };
  await walk(path.resolve(dir));
  // Oldest first so automatic version numbering follows creation order.
  const withTime = await Promise.all(found.map(async (f) => ({ f, t: (await fsp.stat(f)).mtimeMs })));
  withTime.sort((a, b) => a.t - b.t);
  const results = [];
  for (const { f } of withTime) results.push(await register(f, opts));
  return results;
}
