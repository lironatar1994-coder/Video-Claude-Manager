// Builds the read-only production snapshot:
//   dist/www/    index.html (static mode), app.js, style.css, data.json, thumbs/
//   data/web/    stream-ready copies of every video (moov atom up front), cached between builds
// Prints the media file names the release needs, one per line, to dist/media.txt.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, DATA, load, ensureLight, projectToken } from '../lib.mjs';

const DIST = path.join(ROOT, 'dist');
const WWW = path.join(DIST, 'www');
const WEB = path.join(DATA, 'web');

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(path.join(WWW, 'thumbs'), { recursive: true });
fs.mkdirSync(WEB, { recursive: true });

for (const f of ['app.js', 'style.css', 'review.js', 'review.css']) fs.copyFileSync(path.join(ROOT, 'public', f), path.join(WWW, f));
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')
  .replace('<html lang="he" dir="rtl">', '<html lang="he" dir="rtl" data-mode="static">')
  .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="robots" content="noindex, nofollow">');
if (!html.includes('data-mode="static"')) throw new Error('index.html: could not switch to static mode');
fs.writeFileSync(path.join(WWW, 'index.html'), html);

const db = load();
const media = [];
const videos = [];
for (const v of db.videos) {
  const src = path.join(DATA, v.file);
  const ext = path.extname(src).toLowerCase();
  const name = `${v.id}${ext}`;
  const out = path.join(WEB, name);
  if (!fs.existsSync(out)) {
    if (ext === '.mp4' || ext === '.m4v' || ext === '.mov') {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-c', 'copy', '-movflags', '+faststart', out + '.tmp' + ext]);
      fs.renameSync(out + '.tmp' + ext, out);
    } else {
      fs.copyFileSync(src, out);
    }
  }
  media.push(name);
  let poster = null;
  if (v.thumb && fs.existsSync(path.join(DATA, v.thumb))) {
    fs.copyFileSync(path.join(DATA, v.thumb), path.join(WWW, 'thumbs', `${v.id}.jpg`));
    poster = `thumbs/${v.id}.jpg`;
  }
  // 720p share copy, linked next to the stream copy so deploy uploads it like any other media file.
  let light = null;
  const lp = await ensureLight(v);
  if (lp) {
    const lname = `${v.id}.light.mp4`;
    const lout = path.join(WEB, lname);
    if (!fs.existsSync(lout)) { try { fs.linkSync(lp, lout); } catch { fs.copyFileSync(lp, lout); } }
    media.push(lname);
    light = `media/${lname}`;
  }
  videos.push({
    id: v.id, project: v.project, title: v.title, version: v.version, variant: v.variant, note: v.note,
    width: v.width, height: v.height, duration: v.duration, size: fs.statSync(out).size,
    createdAt: v.createdAt, addedAt: v.addedAt,
    src: `media/${name}`, light, poster, name: path.basename(v.source),
    review: projectToken(v.project),
  });
}

// ---- share pages: /videos/v/<id>/ with Open Graph tags so WhatsApp shows a preview ----
const PUBLIC = 'https://lawebs.co.il/videos/';
const OG = path.join(DATA, 'og');
fs.mkdirSync(OG, { recursive: true });
fs.mkdirSync(path.join(WWW, 'og'), { recursive: true });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (d) => new Date(d).toLocaleString('he-IL', {
  timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).replace(',', ' ·');

for (const v of videos) {
  let og = null;
  if (v.poster) {
    // 1200×630 card: the frame sharp in the middle over a blurred, darkened copy of itself.
    const out = path.join(OG, `${v.id}.jpg`);
    if (!fs.existsSync(out)) {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(WWW, v.poster), '-filter_complex',
        '[0]scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630,boxblur=28:2,eq=brightness=-0.22[bg];' +
        '[0]scale=1200:630:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2',
        '-frames:v', '1', '-q:v', '4', out]);
    }
    fs.copyFileSync(out, path.join(WWW, 'og', `${v.id}.jpg`));
    og = `og/${v.id}.jpg`;
  }
  const title = `${v.project} · v${v.version}${v.variant ? ' · ' + v.variant : ''}`;
  const type = v.src.endsWith('.webm') ? 'video/webm' : 'video/mp4';
  const page = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<meta property="og:type" content="video.other">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(when(v.createdAt))}">
<meta property="og:url" content="${PUBLIC}v/${v.id}/">
${og ? `<meta property="og:image" content="${PUBLIC}${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">` : ''}
<meta property="og:video" content="${PUBLIC}${v.src}">
<meta property="og:video:type" content="${type}">
${v.width ? `<meta property="og:video:width" content="${v.width}">\n<meta property="og:video:height" content="${v.height}">` : ''}
<meta name="theme-color" content="#0b0b0d">
<style>
  html, body { margin: 0; height: 100%; background: #0b0b0d; color: #f2f0eb; font: 15px/1.4 "Segoe UI", system-ui, sans-serif; }
  main { height: 100svh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px; box-sizing: border-box; }
  video { max-width: 100%; max-height: calc(100svh - 72px); border-radius: 14px; background: #000; box-shadow: 0 30px 80px -30px #000; }
  p { margin: 0; color: #8d8b86; font-size: 13px; }
  p b { color: #f2f0eb; font-weight: 600; }
</style>
</head>
<body>
<main>
  <video src="../../${v.src}" ${v.poster ? `poster="../../${v.poster}" ` : ''}controls playsinline preload="metadata"></video>
  <p><b>${esc(v.project)}</b> · v${v.version}${v.variant ? ' · ' + esc(v.variant) : ''} · <span dir="ltr">${esc(when(v.createdAt))}</span></p>
</main>
</body>
</html>
`;
  fs.mkdirSync(path.join(WWW, 'v', v.id), { recursive: true });
  fs.writeFileSync(path.join(WWW, 'v', v.id, 'index.html'), page);
}

// ---- client review pages: /videos/p/<token>/ — one project only, with approve / comment ----
// The page gets its own data.json holding just that project, so a client never sees the others.
const reviewTpl = fs.readFileSync(path.join(ROOT, 'public', 'review.html'), 'utf8');
const byProject = new Map();
for (const v of videos) {
  if (!byProject.has(v.review)) byProject.set(v.review, []);
  byProject.get(v.review).push(v);
}
for (const [token, list] of byProject) {
  list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  const latest = list[0];
  const project = latest.project;
  const versions = new Set(list.map((v) => v.title + v.version)).size;
  const og = fs.existsSync(path.join(WWW, 'og', `${latest.id}.jpg`)) ? `${PUBLIC}og/${latest.id}.jpg` : null;
  const tags = [
    `<title>${esc(project)} · צפייה ואישור</title>`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(project)} · צפייה ואישור">`,
    `<meta property="og:description" content="${esc(`גרסה v${latest.version} · ${when(latest.createdAt)}`)}">`,
    `<meta property="og:url" content="${PUBLIC}p/${token}/">`,
    og && `<meta property="og:image" content="${og}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).join('\n');
  const dir = path.join(WWW, 'p', token);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), reviewTpl.replace('<!--HEAD-->', tags));
  // Paths in the page are relative to /videos/p/<token>/.
  const rel = (s) => (s ? `../../${s}` : null);
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({
    project, token, versions,
    videos: list.map(({ name, review, note, addedAt, ...v }) => ({ ...v, src: rel(v.src), light: rel(v.light), poster: rel(v.poster) })),
  }));
}

fs.writeFileSync(path.join(WWW, 'data.json'), JSON.stringify({ rev: db.rev, videos }));
fs.writeFileSync(path.join(DIST, 'media.txt'), media.join('\n') + '\n');
fs.writeFileSync(path.join(DIST, 'rev.txt'), String(db.rev));
console.log(`built ${videos.length} videos (rev ${db.rev})`);
