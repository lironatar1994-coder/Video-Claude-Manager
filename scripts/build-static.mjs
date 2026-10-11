// Builds the read-only production snapshot:
//   dist/www/    index.html (static mode), app.js, style.css, data.json, thumbs/
//   data/web/    stream-ready copies of every video (moov atom up front), cached between builds
// Prints the media file names the release needs, one per line, to dist/media.txt.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, DATA, load } from '../lib.mjs';

const DIST = path.join(ROOT, 'dist');
const WWW = path.join(DIST, 'www');
const WEB = path.join(DATA, 'web');

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(path.join(WWW, 'thumbs'), { recursive: true });
fs.mkdirSync(WEB, { recursive: true });

for (const f of ['app.js', 'style.css']) fs.copyFileSync(path.join(ROOT, 'public', f), path.join(WWW, f));
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')
  .replace('<html lang="he" dir="rtl">', '<html lang="he" dir="rtl" data-mode="static">')
  .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="robots" content="noindex, nofollow">');
if (!html.includes('data-mode="static"')) throw new Error('index.html: could not switch to static mode');
fs.writeFileSync(path.join(WWW, 'index.html'), html);

const db = load();
const media = [];
const videos = db.videos.map((v) => {
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
  return {
    id: v.id, project: v.project, title: v.title, version: v.version, variant: v.variant, note: v.note,
    width: v.width, height: v.height, duration: v.duration, size: fs.statSync(out).size,
    createdAt: v.createdAt, addedAt: v.addedAt,
    src: `media/${name}`, poster, name: path.basename(v.source),
  };
});

fs.writeFileSync(path.join(WWW, 'data.json'), JSON.stringify({ rev: db.rev, videos }));
fs.writeFileSync(path.join(DIST, 'media.txt'), media.join('\n') + '\n');
fs.writeFileSync(path.join(DIST, 'rev.txt'), String(db.rev));
console.log(`built ${videos.length} videos (rev ${db.rev})`);
