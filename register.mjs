#!/usr/bin/env node
// Register videos in the local library (works whether or not the server is running).
//
//   node register.mjs <file.mp4> [more files...] [--project name] [--title name]
//                     [--version 3] [--variant dark] [--note "what changed"]
//   node register.mjs --scan <folder> [--project name]
import { register, scanDir, rethumbAll } from './lib.mjs';

const args = process.argv.slice(2);
if (args[0] === '--rethumb') {
  console.log(`thumbnails rebuilt: ${await rethumbAll()}`);
  process.exit(0);
}
const opts = {};
const files = [];
let scan = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--scan') scan = args[++i];
  else if (a.startsWith('--')) opts[a.slice(2)] = args[++i];
  else files.push(a);
}

if (!scan && !files.length) {
  console.log('usage: node register.mjs <video> [--project P] [--title T] [--version N] [--variant V] [--note "..."]');
  console.log('       node register.mjs --scan <folder> [--project P]');
  process.exit(1);
}

const show = ({ video: v, duplicate }) =>
  console.log(`${duplicate ? '=' : '+'} ${v.project} / ${v.title} v${v.version}${v.variant ? ' (' + v.variant + ')' : ''}  ${v.source}`);

try {
  if (scan) (await scanDir(scan, opts)).forEach(show);
  for (const f of files) show(await register(f, opts));
  console.log('→ http://localhost:5757');
} catch (e) {
  console.error('error:', e.message);
  process.exit(1);
}
