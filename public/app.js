const $ = (s, el = document) => el.querySelector(s);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => String(s).trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICON = {
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  download: svg('<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>'),
  trash: svg('<path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  film: svg('<rect x="3" y="5" width="13" height="14" rx="2.5"/><path d="m16 10 5-3v10l-5-3"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>',
  compare: svg('<rect x="3" y="4" width="7" height="16" rx="2"/><rect x="14" y="4" width="7" height="16" rx="2"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="2.4"'),
  pen: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  upload: svg('<path d="M12 16V4m-5 5 5-5 5 5M5 20h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  grid: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
};

const fmt = {
  date: (d) => new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  short: (d) => new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
  time: (d) => new Date(d).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }),
  rel(d) {
    const s = (new Date(d) - Date.now()) / 1000;
    const r = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });
    for (const [u, n] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]])
      // ICU writes dual forms as "לפני שעתיים (2)" — drop the redundant number.
      if (Math.abs(s) >= n) return r.format(Math.round(s / n), u).replace(/\s*\(\d+\)$/, '');
    return 'עכשיו';
  },
  dur: (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : ''),
  at: (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`,
  size: (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB'),
};

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Production build: a read-only snapshot (data.json + media files), no API, no client feedback.
const STATIC = document.documentElement.dataset.mode === 'static';
if (STATIC) { $('#addBtn').remove(); $('#publish').remove(); }

const S = {
  rev: -1, videos: [], project: null, a: null, b: null, compare: false, fresh: new Set(),
  query: '', events: [], fbLast: null, state: null, local: { resolved: {}, sent: {} }, filter: null,
};

// ---------- data shaping ----------
function matches(v) {
  if (!S.query) return true;
  const q = S.query.toLowerCase();
  return [v.project, v.title, v.variant, v.note, `v${v.version}`].some((x) => String(x || '').toLowerCase().includes(q));
}

function projects({ filtered = false } = {}) {
  const map = new Map();
  for (const v of S.videos) {
    const k = slug(v.project);
    if (!map.has(k)) map.set(k, { key: k, name: v.project, videos: [] });
    map.get(k).videos.push(v);
  }
  let list = [...map.values()];
  for (const p of list) {
    p.videos.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
    p.latest = p.videos[0];
  }
  if (filtered && S.query) list = list.filter((p) => p.videos.some(matches));
  return list.sort((x, y) => new Date(y.latest.createdAt) - new Date(x.latest.createdAt));
}

function versionGroups(p) {
  const titles = new Set(p.videos.map((v) => slug(v.title)));
  const map = new Map();
  for (const v of p.videos) {
    const k = slug(v.title) + '|' + v.version;
    if (!map.has(k)) map.set(k, { key: k, title: v.title, version: v.version, videos: [] });
    map.get(k).videos.push(v);
  }
  const groups = [...map.values()];
  const maxByTitle = {};
  for (const g of groups) {
    g.videos.sort((x, y) => x.variant.localeCompare(y.variant));
    g.when = g.videos.reduce((m, v) => (v.createdAt > m ? v.createdAt : m), '');
    maxByTitle[slug(g.title)] = Math.max(maxByTitle[slug(g.title)] || 0, g.version);
  }
  for (const g of groups) g.latest = g.version === maxByTitle[slug(g.title)];
  groups.sort((x, y) => new Date(y.when) - new Date(x.when) || y.version - x.version);
  return { groups, multiTitle: titles.size > 1 };
}

function fbFor(v) {
  const list = S.events.filter((e) => e.video === v.id);
  const decisions = list.filter((e) => e.kind === 'approve' || e.kind === 'changes');
  const last = decisions.at(-1);
  const views = list.filter((e) => e.kind === 'view');
  // a change request stays open until it is marked handled here (or a later approval replaces it)
  const openList = last?.kind === 'approve' ? [] : list.filter((e) => e.kind === 'changes' && !S.local.resolved[e.id]);
  return {
    list: list.filter((e) => e.kind !== 'view'),
    approved: last?.kind === 'approve' ? last : null,
    changes: openList.length,
    open: openList.length > 0,
    openList,
    views: views.length,
    lastView: views.at(-1)?.ts || null,
  };
}
// One word for where a project stands, from its newest version (and whether its link went out).
function projectStatus(p) {
  if (STATIC) return null;
  const { groups } = versionGroups(p);
  const vids = groups.filter((g) => g.latest).flatMap((g) => g.videos);
  const fbs = vids.map(fbFor);
  if (fbs.some((f) => f.approved)) return { cls: 'ok', text: 'אושר', key: 'ok' };
  const open = fbs.reduce((n, f) => n + f.changes, 0);
  if (open) return { cls: 'changes', text: open > 1 ? `${open} תיקונים` : 'בתיקונים', key: 'changes' };
  const lastView = fbs.map((f) => f.lastView).filter(Boolean).sort().at(-1);
  if (lastView) return { cls: 'seen', text: 'נצפה', key: 'seen', at: lastView };
  const sent = (S.local.sent[p.name] || []).at(-1);
  if (sent && sent.at > p.latest.addedAt) return { cls: 'sent', text: 'נשלח · לא נצפה', key: 'sent', at: sent.at };
  // only fresh versions nag; an old project that was never sent through here is just quiet
  if (Date.now() - new Date(p.latest.addedAt) > 14 * 864e5) return null;
  return { cls: 'new', text: 'טרם נשלח', key: 'new' };
}

// ---------- links ----------
// Every video gets its own public page and every project a private review page
// (both built by scripts/build-static.mjs). Links always point at production.
const PUBLIC = 'https://lawebs.co.il/videos/';
const shareUrl = (v) => `${PUBLIC}v/${v.id}/`;
const reviewUrl = (v) => `${PUBLIC}p/${v.review}/`;
const wa = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);
const waLink = (v) => wa(`${v.project} · v${v.version}${v.variant ? ' · ' + v.variant : ''}\n${shareUrl(v)}`);
const fileName = (v) => `${slug(v.project)}-v${v.version}${v.variant ? '-' + slug(v.variant) : ''}${(v.src.match(/\.\w+$/) || v.name.match(/\.\w+$/) || ['.mp4'])[0]}`;

async function copy(text, done = 'הקישור הועתק') {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { prompt('קישור', text); }
}

// Send the video itself (not a link) so WhatsApp shows it as a playable video.
const fileCache = new Map();
async function sendVideo(v, btn) {
  if (!STATIC) {
    // Local app on Windows: the file goes on the clipboard, Ctrl+V in WhatsApp sends it.
    try { await api(`api/videos/${v.id}/clipboard`, 'POST'); toast('הסרטון הועתק · Ctrl+V בצ׳אט בוואטסאפ'); }
    catch { toast('ההעתקה נכשלה'); }
    return;
  }
  const src = v.light || v.src;
  const canFiles = navigator.canShare?.({ files: [new File([''], 'x.mp4', { type: 'video/mp4' })] });
  if (!canFiles) {
    const a = Object.assign(document.createElement('a'), { href: src, download: fileName(v) });
    a.click();
    toast('הסרטון ירד · גרירה לצ׳אט בוואטסאפ');
    return;
  }
  // Phones: native share sheet with the file → WhatsApp. The 720p copy keeps this quick.
  const ready = fileCache.has(v.id);
  if (!ready) {
    btn.classList.add('busy');
    try {
      const blob = await (await fetch(src)).blob();
      fileCache.set(v.id, new File([blob], fileName(v).replace(/\.\w+$/, '.mp4'), { type: blob.type || 'video/mp4' }));
    } catch { btn.classList.remove('busy'); return toast('ההורדה נכשלה'); }
    btn.classList.remove('busy');
  }
  try {
    await navigator.share({ files: [fileCache.get(v.id)] });
  } catch (e) {
    // Downloading can outlast the click's permission to share; the second tap is instant.
    if (e.name === 'NotAllowedError') toast('הסרטון מוכן · לחיצה נוספת לשליחה');
  }
}

const byId = (id) => S.videos.find((v) => v.id === id);
const isLatest = (v) => !S.videos.some((x) => slug(x.project) === slug(v.project) && slug(x.title) === slug(v.title) && x.version > v.version);
const label = (v) => v.variant || 'מקור';

// ---------- routing ----------
function syncHash() {
  const want = S.project ? `#${encodeURIComponent(S.project)}${S.a ? '/' + S.a : ''}` : '#';
  if ((location.hash || '#') !== want) history.replaceState(null, '', want === '#' ? location.pathname : want);
}
function readHash() {
  const [p, id] = decodeURIComponent(location.hash.slice(1)).split('/');
  return { p: p || null, id: id || null };
}

// ---------- sidebar ----------
function renderSide() {
  const nav = $('#projects');
  const visited = store.get('visited', {});
  const list = projects({ filtered: true });
  nav.replaceChildren(
    h(`<button class="proj home ${S.project ? '' : 'on'}" ${S.project ? '' : 'aria-current="true"'}>
      <span class="ph">${ICON.grid}</span>
      <span class="proj-text"><span class="proj-name">כל הפרויקטים</span></span>
      <span class="proj-count num">${projects().length}</span>
    </button>`),
    ...list.map((p) => {
      const unseen = p.key !== S.project && p.videos.some((v) => v.addedAt > (visited[p.key] || ''));
      const newFb = !STATIC && p.key !== S.project && S.events.some((e) => e.kind !== 'view' && slug(e.project) === p.key && e.ts > (visited[p.key] || ''));
      const versions = new Set(p.videos.map((v) => v.title + v.version)).size;
      const st = projectStatus(p);
      return h(`<button class="proj ${p.key === S.project ? 'on' : ''}" data-key="${esc(p.key)}" ${p.key === S.project ? 'aria-current="true"' : ''}>
        ${p.latest.poster ? `<img src="${p.latest.poster}" alt="" loading="lazy">` : '<span class="ph"></span>'}
        <span class="proj-text">
          <span class="proj-name">${esc(p.name)}${unseen || newFb ? '<span class="dot-new" title="חדש"></span>' : ''}</span>
          <span class="proj-when">${st && st.key !== 'new' ? `<span class="st ${st.cls}">${st.text}</span> · ` : ''}${fmt.rel(p.latest.createdAt)}</span>
        </span>
        <span class="proj-count num" title="${versions} גרסאות">${versions}</span>
      </button>`);
    }),
  );
  nav.firstElementChild.onclick = () => openHome();
  nav.querySelectorAll('.proj[data-key]').forEach((el) => (el.onclick = () => openProject(el.dataset.key)));
  // Phone layout scrolls the project strip sideways — keep the current one in view.
  nav.querySelector('.proj.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---------- publish (local) ----------
function renderPublish() {
  const el = $('#publish');
  if (!el || !S.state) return;
  const st = S.state;
  const pub = st.publish;
  const dirty = st.publishedRev !== st.rev;
  let cls = 'ok', text = 'הכל באוויר', title = 'כל השינויים פורסמו ב־lawebs.co.il/videos';
  if (pub.running) { cls = 'busy'; text = 'מפרסם…'; title = pub.log.at(-1) || ''; }
  else if (pub.ok === false && dirty) { cls = 'err'; text = 'הפרסום נכשל · שוב'; title = pub.log.slice(-6).join('\n'); }
  else if (dirty && pub.scheduledAt) { cls = 'pending'; text = `מתפרסם בעוד ${Math.max(0, Math.round((new Date(pub.scheduledAt) - Date.now()) / 1000))} שנ׳`; title = 'לחיצה לפרסום עכשיו'; }
  else if (dirty) { cls = 'pending'; text = 'פרסום עדכונים'; title = 'יש שינויים שעוד לא עלו לאתר'; }
  el.className = `publish ${cls}`;
  el.title = title;
  el.innerHTML = `${cls === 'ok' ? ICON.check : ICON.upload}<span>${text}</span>`;
  el.disabled = pub.running || (!dirty && pub.ok !== false);
}
$('#publish')?.addEventListener('click', async () => {
  try { S.state.publish = await api('api/publish', 'POST'); } catch { /* already running */ }
  renderPublish();
});

// ---------- home: everything at a glance, and what needs doing ----------
const latestVideos = (p) => versionGroups(p).groups.filter((g) => g.latest).flatMap((g) => g.videos);
function attention() {
  const items = [];
  for (const p of projects()) {
    for (const v of latestVideos(p)) for (const e of fbFor(v).openList) items.push({ type: 'change', p, v, e, at: e.ts });
    const st = projectStatus(p);
    if (st?.key === 'new') items.push({ type: 'send', p, at: p.latest.addedAt });
    if (st?.key === 'sent' && Date.now() - new Date(st.at) > 2 * 864e5) items.push({ type: 'nudge', p, at: st.at });
  }
  const rank = { change: 0, send: 1, nudge: 2 };
  return items.sort((a, b) => rank[a.type] - rank[b.type] || (b.at > a.at ? 1 : -1));
}
function activity() {
  const out = [];
  for (const v of S.videos) out.push({ at: v.addedAt, kind: 'new', v });
  const views = new Map();   // views of the same video on the same day count as one line
  for (const e of S.events) {
    const v = byId(e.video); if (!v) continue;
    if (e.kind === 'view') {
      const k = e.video + e.ts.slice(0, 10), cur = views.get(k);
      if (cur) { cur.n++; if (e.ts > cur.at) cur.at = e.ts; } else { const it = { at: e.ts, kind: 'view', v, n: 1 }; views.set(k, it); out.push(it); }
    } else out.push({ at: e.ts, kind: e.kind, v, e });
  }
  for (const [name, list] of Object.entries(S.local.sent)) for (const x of list) out.push({ at: x.at, kind: 'sent', name });
  return out.sort((a, b) => (b.at > a.at ? 1 : -1)).slice(0, 18);
}
const vlabel = (v) => `${esc(v.project)} · <span class="ltr">v${v.version}</span>${v.variant ? ' · ' + esc(v.variant) : ''}`;
const STATS = [['changes', 'תיקונים פתוחים', 'pen'], ['new', 'מוכנים לשליחה', 'upload'], ['sent', 'נשלחו, לא נצפו', 'eye'], ['ok', 'אושרו', 'check']];
function renderHome() {
  const main = $('#main');
  let list = projects({ filtered: true });
  const counts = { changes: 0, new: 0, sent: 0, ok: 0 };
  const stOf = new Map(projects().map((p) => [p.key, projectStatus(p)]));
  for (const st of stOf.values()) if (st && st.key in counts) counts[st.key]++;
  counts.changes = projects().reduce((n, p) => n + latestVideos(p).reduce((m, v) => m + fbFor(v).changes, 0), 0);
  if (S.filter) list = list.filter((p) => stOf.get(p.key)?.key === S.filter);
  const week = S.videos.filter((v) => Date.now() - new Date(v.addedAt) < 7 * 864e5).length;
  const fname = (STATS.find((x) => x[0] === S.filter) || [])[1];
  main.replaceChildren(h(`<section class="home">
    <div class="home-main">
      <header class="home-head">
        <div><h1>כל הפרויקטים</h1><p class="head-meta num">${projects().length} פרויקטים · ${S.videos.length} סרטונים · ${week} חדשים השבוע</p></div>
        <button class="pill" id="kbtn" title="חיפוש ופעולות (Ctrl+K)">${ICON.search}<span>חיפוש ופעולות</span><kbd>Ctrl K</kbd></button>
      </header>
      ${STATIC ? '' : `<div class="stats">${STATS.map(([k, label, ic]) => `<button class="stat st-${k} ${S.filter === k ? 'on' : ''}" data-f="${k}" aria-pressed="${S.filter === k}"><span class="si">${ICON[ic]}</span><b class="num">${counts[k]}</b><span>${label}</span></button>`).join('')}</div>`}
      ${S.filter ? `<p class="filtering">מוצגים רק: ${fname} <button id="clearF">הצגת הכל</button></p>` : ''}
      <div class="tiles"></div>
    </div>
    ${STATIC ? '' : `<aside class="home-side">
      <section class="panel" id="attn"><h2>דורש טיפול <span class="count num"></span></h2><ol class="alist"></ol></section>
      <section class="panel"><h2>פעילות אחרונה</h2><ol class="feed"></ol></section>
    </aside>`}
  </section>`));
  $('#kbtn').onclick = openPalette;
  main.querySelectorAll('.stat').forEach((b) => (b.onclick = () => { S.filter = S.filter === b.dataset.f ? null : b.dataset.f; renderHome(); }));
  $('#clearF')?.addEventListener('click', () => { S.filter = null; renderHome(); });

  const tiles = $('.tiles', main);
  if (!list.length) tiles.append(h(`<p class="none">${S.query ? `אין תוצאות ל־"${esc(S.query)}"` : 'אין פרויקטים במצב הזה'}</p>`));
  tiles.append(...list.map((p) => {
    const top = versionGroups(p).groups[0], st = stOf.get(p.key);
    const el = h(`<div class="tile" role="button" tabindex="0" data-key="${esc(p.key)}">
      <span class="tile-art">
        ${p.latest.poster ? `<img src="${p.latest.poster}" alt="" loading="lazy">` : ''}
        ${st && !STATIC ? `<span class="st ${st.cls}">${st.text}</span>` : ''}
        ${p.latest.review && !STATIC ? `<span class="qa">
          <a class="qb wa" href="${wa(`${p.name} · צפייה ואישור\n${reviewUrl(p.latest)}`)}" target="_blank" rel="noopener" title="שליחת לינק ללקוח בוואטסאפ" data-sent="wa">${ICON.whatsapp}</a>
          <button class="qb" title="העתקת לינק ללקוח" data-act="copy">${ICON.link}</button>
        </span>` : ''}
      </span>
      <span class="tile-text">
        <b>${esc(p.name)}</b>
        <span class="num"><span class="ltr">v${top.version}</span> · ${fmt.rel(top.when)}</span>
      </span>
    </div>`);
    el.onclick = (e) => { if (!e.target.closest('.qa')) openProject(p.key); };
    el.onkeydown = (e) => { if (e.key === 'Enter') openProject(p.key); };
    el.querySelector('[data-sent="wa"]')?.addEventListener('click', () => sent(p.name, 'wa'));
    el.querySelector('[data-act="copy"]')?.addEventListener('click', () => { copy(reviewUrl(p.latest), 'לינק הלקוח הועתק'); sent(p.name, 'link'); });
    return el;
  }));
  if (STATIC) return;

  // needs attention: open change requests first, then versions nobody has sent, then links nobody opened
  const att = attention();
  $('#attn .count').textContent = att.length || '';
  $('#attn .alist').innerHTML = att.length ? att.slice(0, 12).map((a, i) => {
    if (a.type === 'change') return `<li class="ai change">
        <img src="${a.v.poster || ''}" alt="">
        <div class="ab"><div class="ah">${vlabel(a.v)}</div>
          <p><b>${esc(a.e.name || 'לקוח')}:</b> ${esc(a.e.text)}</p>
          <div class="arow">${a.e.at != null ? `<button class="chipb num" data-go="${i}">▶ ${fmt.at(a.e.at)}</button>` : `<button class="chipb" data-go="${i}">פתיחה</button>`}
          <button class="done" data-done="${a.e.id}" title="סימון כטופל">${ICON.check}טופל</button><span class="dim-t">${fmt.rel(a.e.ts)}</span></div></div></li>`;
    if (a.type === 'send') return `<li class="ai send"><img src="${a.p.latest.poster || ''}" alt="">
        <div class="ab"><div class="ah">${esc(a.p.name)}</div><p>גרסה חדשה מוכנה ועוד לא נשלחה ללקוח</p>
        <div class="arow"><a class="chipb wa" href="${wa(`${a.p.name} · צפייה ואישור\n${reviewUrl(a.p.latest)}`)}" target="_blank" rel="noopener" data-wa="${esc(a.p.name)}">${ICON.whatsapp}שליחה</a><button class="chipb" data-copy="${esc(a.p.name)}">${ICON.link}העתקה</button><button class="done" data-manual="${esc(a.p.name)}" title="נשלח בדרך אחרת">${ICON.check}כבר נשלח</button><span class="dim-t">${fmt.rel(a.at)}</span></div></div></li>`;
    return `<li class="ai nudge"><img src="${a.p.latest.poster || ''}" alt="">
        <div class="ab"><div class="ah">${esc(a.p.name)}</div><p>הלינק נשלח ${fmt.rel(a.at)} ועוד לא נצפה</p>
        <div class="arow"><a class="chipb wa" href="${wa(`תזכורת · ${a.p.name}\n${reviewUrl(a.p.latest)}`)}" target="_blank" rel="noopener" data-wa="${esc(a.p.name)}">${ICON.whatsapp}תזכורת</a></div></div></li>`;
  }).join('') : '<li class="none">הכל מטופל ✓</li>';
  main.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { const a = att[+b.dataset.go]; openAt(a.v, a.e.at); }));
  main.querySelectorAll('[data-done]').forEach((b) => (b.onclick = () => resolve(b.dataset.done, true)));
  main.querySelectorAll('[data-wa]').forEach((b) => b.addEventListener('click', () => sent(b.dataset.wa, 'wa')));
  main.querySelectorAll('[data-manual]').forEach((b) => (b.onclick = () => sent(b.dataset.manual, 'manual')));
  main.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => { const pr = projects().find((x) => x.name === b.dataset.copy); copy(reviewUrl(pr.latest), 'לינק הלקוח הועתק'); sent(pr.name, 'link'); }));

  const ACT = {
    new: (a) => `<b>סרטון חדש</b> · ${vlabel(a.v)}`,
    view: (a) => `${vlabel(a.v)} <b>נצפה</b>${a.n > 1 ? ` ${a.n} פעמים` : ''}`,
    changes: (a) => `<b>${esc(a.e.name || 'לקוח')}</b> ביקש/ה תיקון · ${vlabel(a.v)}`,
    approve: (a) => `<b>${esc(a.e.name || 'לקוח')}</b> אישר/ה · ${vlabel(a.v)}`,
    comment: (a) => `<b>${esc(a.e.name || 'לקוח')}</b> הגיב/ה · ${vlabel(a.v)}`,
    sent: (a) => `לינק נשלח ללקוח · ${esc(a.name)}`,
  };
  const DOTC = { new: 'acc', view: 'seen', changes: 'changes', approve: 'ok', comment: 'acc', sent: 'sent' };
  const feed = activity();
  $('.feed', main).innerHTML = feed.map((a, i) => `<li data-f="${i}" tabindex="0"><i class="fd ${DOTC[a.kind]}"></i><span>${ACT[a.kind](a)}</span><time class="dim-t">${fmt.rel(a.at)}</time></li>`).join('');
  $('.feed', main).querySelectorAll('li').forEach((li) => (li.onclick = () => {
    const a = feed[+li.dataset.f];
    if (a.v) openAt(a.v, a.e?.at ?? null); else { const pr = projects().find((x) => x.name === a.name); if (pr) openProject(pr.key); }
  }));
}
// open a video at a moment (a client's timestamp)
function openAt(v, at) {
  openProject(slug(v.project), v.id);
  if (at == null) return;
  requestAnimationFrame(() => {
    const vid = $(`.players .slot[data-id="${v.id}"] video`); if (!vid) return;
    const set = () => { vid.currentTime = at; vid.pause(); };
    vid.readyState >= 1 ? set() : vid.addEventListener('loadedmetadata', set, { once: true });
  });
}
async function resolve(id, done) {
  try { S.local = await api('api/resolve', 'POST', { id, done }); } catch { return toast('לא נשמר'); }
  toast(done ? 'סומן כטופל' : 'הוחזר לפתוח');
  renderSide(); if (S.project) renderMain(); else renderHome();
}
async function sent(project, how) {
  try { S.local = await api('api/sent', 'POST', { project, how }); } catch { return; }
  renderSide(); if (!S.project) renderHome();
}

// ---------- project ----------
function renderMain() {
  const main = $('#main');
  if (!S.videos.length) {
    main.replaceChildren(h(`<div class="empty"><div><b>אין עדיין סרטונים</b>
      וידאו חדש שנוצר יופיע כאן אוטומטית<br>
      <code class="ltr">node register.mjs &lt;video.mp4&gt;</code></div></div>`));
    return;
  }
  const p = projects().find((x) => x.key === S.project);
  if (!p) return renderHome();
  const { groups, multiTitle } = versionGroups(p);
  const versions = groups.length;

  let head = $('.head', main);
  if (!head || head.dataset.p !== p.key) {
    main.replaceChildren(
      (head = h(`<header class="head" data-p="${esc(p.key)}"></header>`)),
      h('<section class="stage"><div class="players"></div><div class="info"></div></section>'),
      h('<section class="rail"></section>'),
    );
  }
  head.innerHTML = `<div class="head-text">
      <h1 title="${STATIC ? '' : 'לחיצה כפולה לשינוי שם'}">${esc(p.name)}</h1>
      <div class="head-meta"><span class="num">${versions}</span> גרסאות · עודכן ${fmt.rel(p.latest.createdAt)}</div>
    </div>
    <div class="tools">
      ${p.latest.review ? `<div class="client" role="group" aria-label="לינק ללקוח">
        <button class="pill" id="clientCopy" title="${esc(reviewUrl(p.latest))}">${ICON.user}<span>לינק ללקוח</span></button>
        <a class="pill icon-only wa" id="clientWa" href="${wa(`${p.name} · צפייה ואישור\n${reviewUrl(p.latest)}`)}" target="_blank" rel="noopener" title="שליחת הלינק ללקוח בוואטסאפ" aria-label="שליחה בוואטסאפ">${ICON.whatsapp}</a>
      </div>` : ''}
      ${p.videos.length > 1 ? `<button class="pill ${S.compare ? 'on' : ''}" id="cmp" aria-pressed="${S.compare}" title="השוואה (C)">${ICON.compare}<span>השוואה</span></button>` : ''}
    </div>`;
  $('#cmp', head)?.addEventListener('click', toggleCompare);
  $('#clientCopy', head)?.addEventListener('click', () => { copy(reviewUrl(p.latest), 'לינק הלקוח הועתק'); sent(p.name, 'link'); });
  $('#clientWa', head)?.addEventListener('click', () => sent(p.name, 'wa'));
  const h1 = $('h1', head);
  if (!STATIC) h1.ondblclick = () => editProjectName(h1, p);

  const rail = $('.rail', main);
  rail.replaceChildren(...groups.map((g) => {
    const sec = h(`<div class="ver">
      <div class="ver-head">
        <div class="ver-label num"><span class="ltr"><small>v</small>${g.version}</span>${g.latest ? '<span class="badge-new">אחרון</span>' : ''}</div>
        <div class="ver-when num">${fmt.short(g.when)} · ${fmt.time(g.when)}</div>
      </div>
      ${multiTitle ? `<div class="ver-title">${esc(g.title)}</div>` : ''}
      <div class="cards"></div>
    </div>`);
    $('.cards', sec).append(...g.videos.map(card));
    return sec;
  }));

  renderStage();
}

function card(v) {
  const wide = v.width && v.height && v.width > v.height;
  const f = STATIC ? null : fbFor(v);
  const cls = [v.id === S.a && 'on', v.id === S.b && 'on-b', S.fresh.has(v.id) && 'fresh', wide && 'wide', S.query && !matches(v) && 'dim'].filter(Boolean).join(' ');
  const badge = !f ? '' : f.approved ? `<span class="fb ok" title="אושר">${ICON.check}</span>`
    : f.open ? `<span class="fb changes num" title="${f.changes} בקשות תיקון">${f.changes}</span>`
    : f.views ? `<span class="fb seen" title="נצפה ${f.views}">${ICON.eye}</span>` : '';
  const el = h(`<button class="card ${cls}" data-id="${v.id}" title="${esc(`v${v.version} · ${label(v)} · ${fmt.date(v.createdAt)} ${fmt.time(v.createdAt)}`)}">
    <div class="thumb ${wide ? 'wide' : ''}">
      ${v.poster ? `<img src="${v.poster}" alt="" loading="lazy">` : ''}
      <video muted loop playsinline preload="none"></video>
      ${v.duration ? `<span class="dur num">${fmt.dur(v.duration)}</span>` : ''}
      ${badge}
      ${S.compare && (v.id === S.a || v.id === S.b) ? `<span class="ab">${v.id === S.a ? 'A' : 'B'}</span>` : ''}
    </div>
    <div class="card-label">${esc(label(v))}</div>
  </button>`);
  const pv = $('video', el);
  el.onmouseenter = () => { if (!pv.src) { pv.src = `${v.light || v.src}`; pv.onplaying = () => pv.classList.add('ready'); } pv.play().catch(() => {}); };
  el.onmouseleave = () => pv.pause();
  el.onclick = () => select(v.id);
  return el;
}

function slot(v, tag) {
  const landscape = v.width > v.height;
  return h(`<div class="slot ${landscape ? 'landscape' : ''}" data-id="${v.id}">
    <video src="${v.src}" controls playsinline preload="metadata" ${v.poster ? `poster="${v.poster}"` : ''}></video>
    <div class="slot-tag num">${tag ? `<b>${tag}</b>` : ''}v${v.version} · ${esc(label(v))} · ${fmt.short(v.createdAt)} ${fmt.time(v.createdAt)}</div>
  </div>`);
}

function clientBlock(v) {
  if (STATIC) return '';
  const f = fbFor(v);
  let head;
  if (f.approved) head = `<span class="st ok">${ICON.check}אושר${f.approved.name ? ` · ${esc(f.approved.name)}` : ''}</span><span class="dim-t">${fmt.rel(f.approved.ts)}</span>`;
  else if (f.open) head = `<span class="st changes">${ICON.pen}${f.changes === 1 ? 'בקשת תיקון' : `${f.changes} בקשות תיקון`}</span>`;
  else if (f.views) head = `<span class="st seen">${ICON.eye}נצפה${f.views > 1 ? ` ${f.views} פעמים` : ''}</span><span class="dim-t">${fmt.rel(f.lastView)}</span>`;
  else head = `<span class="st none">הלקוח עוד לא צפה</span>`;
  const KIND = { approve: 'אישור', changes: 'תיקון', comment: 'הערה' };
  const items = f.list.slice().reverse().map((e) => `<li class="fb-item ${e.kind} ${S.local.resolved[e.id] ? 'resolved' : ''}">
      <div class="fb-head"><span class="kind">${KIND[e.kind]}</span><b>${esc(e.name || 'לקוח')}</b><span class="dim-t">${fmt.rel(e.ts)}</span>
        ${e.kind === 'changes' ? `<button class="done ${S.local.resolved[e.id] ? 'on' : ''}" data-done="${e.id}" title="${S.local.resolved[e.id] ? 'החזרה לפתוח' : 'סימון כטופל'}">${ICON.check}${S.local.resolved[e.id] ? 'טופל' : 'טיפלתי'}</button>` : ''}</div>
      ${e.at != null ? `<button class="at num" data-at="${e.at}">${fmt.at(e.at)}</button>` : ''}
      ${e.text ? `<p>${esc(e.text)}</p>` : ''}
    </li>`).join('');
  return `<section class="client-fb" aria-label="לקוח">
    <div class="fb-status">${head}</div>
    ${items ? `<ol class="fb-list">${items}</ol>` : ''}
  </section>`;
}

function renderStage() {
  const players = $('.players');
  const info = $('.info');
  if (!players) return;
  const ids = [S.a, S.compare ? S.b : null].filter(Boolean);
  const existing = [...players.children];
  const same = existing.length === ids.length && existing.every((el, i) => el.dataset.id === ids[i]);
  if (!same) {
    // Keep a playing element alive when only the other slot changes.
    const keep = new Map(existing.map((el) => [el.dataset.id, el]));
    players.replaceChildren(...ids.map((id, i) => keep.get(id) || slot(byId(id), S.compare ? (i ? 'B ' : 'A ') : '')));
    wireSync();
  }
  for (const [i, el] of [...players.children].entries()) {
    const v = byId(el.dataset.id);
    $('.slot-tag', el).innerHTML = `${S.compare ? `<b>${i ? 'B' : 'A'}</b>` : ''}v${v.version} · ${esc(label(v))} · ${fmt.short(v.createdAt)} ${fmt.time(v.createdAt)}`;
    $('.slot-tag', el).style.display = S.compare ? '' : 'none';
  }

  const v = byId(S.a);
  info.classList.toggle('hidden', S.compare || !v);
  if (!v || S.compare) return;
  const siblings = S.videos.filter((x) => slug(x.project) === slug(v.project) && slug(x.title) === slug(v.title) && x.version === v.version);
  info.innerHTML = `
    <div class="info-top">
      <div class="big-ver num"><span class="ltr"><small>v</small>${v.version}</span>${isLatest(v) ? '<span class="badge-new">אחרון</span>' : ''}</div>
      <div class="when num">
        <span class="date">${fmt.date(v.createdAt)}</span>
        <span class="time">${fmt.time(v.createdAt)}</span>
        <span class="rel">${fmt.rel(v.createdAt)}</span>
      </div>
    </div>
    ${siblings.length > 1 ? `<div class="variants" role="group" aria-label="וריאנט">${siblings.map((s) => `<button class="chip ${s.id === v.id ? 'on' : ''}" data-id="${s.id}" aria-pressed="${s.id === v.id}">${esc(label(s))}</button>`).join('')}</div>` : ''}
    <div class="facts num">${[v.duration && fmt.dur(v.duration), v.width && `${v.width}×${v.height}`, fmt.size(v.size)].filter(Boolean).map((x) => `<span class="ltr">${x}</span>`).join('<i></i>')}</div>
    ${clientBlock(v)}
    <div class="note" contenteditable="plaintext-only" data-ph="הערה פנימית…" spellcheck="false">${esc(v.note)}</div>
    <div class="send">
      <button class="btn primary" data-act="send">${ICON.film}<span>${STATIC ? 'שליחה כסרטון' : 'העתקה כסרטון'}</span></button>
      <a class="btn wa" href="${waLink(v)}" target="_blank" rel="noopener">${ICON.whatsapp}<span>לינק בוואטסאפ</span></a>
    </div>
    <div class="acts">
      <button class="icon" data-act="copy" title="העתקת קישור" aria-label="העתקת קישור">${ICON.link}</button>
      <a class="icon" href="${v.src}" download="${esc(v.name)}" title="הורדה" aria-label="הורדה">${ICON.download}</a>
      <button class="icon" data-act="reveal" title="פתיחת התיקייה" aria-label="פתיחת התיקייה">${ICON.folder}</button>
      ${STATIC ? '' : `<button class="icon danger" data-act="delete" title="הסרה מהספרייה" aria-label="הסרה מהספרייה">${ICON.trash}</button>`}
    </div>`;
  info.querySelectorAll('.chip').forEach((c) => (c.onclick = () => select(c.dataset.id, true)));
  info.querySelectorAll('[data-done]').forEach((b) => (b.onclick = () => resolve(b.dataset.done, !S.local.resolved[b.dataset.done])));
  info.querySelectorAll('.at').forEach((b) => (b.onclick = () => {
    const vid = $(`.players .slot[data-id="${v.id}"] video`);
    if (vid) { vid.currentTime = +b.dataset.at; vid.pause(); }
  }));
  $('[data-act=send]', info).onclick = (e) => sendVideo(v, e.currentTarget);
  $('[data-act=copy]', info).onclick = () => copy(shareUrl(v));
  if (STATIC) {
    $('[data-act=reveal]', info).remove();
    const n = $('.note', info);
    if (v.note) n.contentEditable = 'false'; else n.remove();
    return;
  }
  const note = $('.note', info);
  note.onblur = () => {
    const text = note.innerText.trim();
    if (text !== v.note) api(`api/videos/${v.id}`, 'PATCH', { note: text }).then(() => (v.note = text));
  };
  note.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); note.blur(); } };
  $('[data-act=reveal]', info).onclick = () => api(`api/videos/${v.id}/reveal`, 'POST');
  $('[data-act=delete]', info).onclick = async () => {
    if (!confirm(`להסיר את v${v.version} · ${label(v)} מהספרייה?\n(הקובץ המקורי לא יימחק)`)) return;
    await api(`api/videos/${v.id}`, 'DELETE');
    S.a = null;
    await refresh(true);
  };
}

function markCards() {
  document.querySelectorAll('.card').forEach((c) => {
    c.classList.toggle('on', c.dataset.id === S.a);
    c.toggleAttribute('aria-current', c.dataset.id === S.a);
    c.classList.toggle('on-b', S.compare && c.dataset.id === S.b);
  });
}

// Play / pause / seek both players together in compare mode.
function wireSync() {
  const vids = [...document.querySelectorAll('.players video')];
  if (vids.length < 2) return;
  let busy = false;
  const mirror = (src, fn) => { if (busy) return; busy = true; vids.filter((x) => x !== src).forEach(fn); setTimeout(() => (busy = false), 50); };
  for (const v of vids) {
    v.onplay = () => mirror(v, (o) => { o.currentTime = v.currentTime; o.play().catch(() => {}); });
    v.onpause = () => mirror(v, (o) => o.pause());
    v.onseeked = () => mirror(v, (o) => (o.currentTime = v.currentTime));
  }
}

// ---------- actions ----------
function markVisited(key) {
  const visited = store.get('visited', {});
  visited[key] = new Date().toISOString();
  store.set('visited', visited);
}

function openHome() {
  S.project = null; S.a = null; S.b = null; S.compare = false;
  renderSide();
  renderMain();
  syncHash();
}

function openProject(key, id) {
  S.project = key;
  const p = projects().find((x) => x.key === key);
  if (!p) return openHome();
  S.a = id && byId(id) ? id : (S.query && p.videos.find(matches)?.id) || p.latest.id;
  S.b = null;
  markVisited(key);
  renderSide();
  renderMain();
  syncHash();
}

function select(id, forceA = false) {
  if (S.compare && !forceA) {
    if (id === S.a) return;
    S.b = id;
  } else {
    S.a = id;
    if (S.b === id) S.b = null;
  }
  renderStage();
  markCards();
  syncHash();
  const vid = $(`.players .slot[data-id="${id}"] video`);
  if (vid && !S.compare) vid.play().catch(() => {});
  // On phones the list sits under the player — bring the player back into view.
  if (matchMedia('(max-width: 900px)').matches) $('.stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleCompare() {
  if (!S.project) return;
  S.compare = !S.compare;
  if (S.compare && !S.b) {
    // Preselect the previous version of the same variant as B.
    const a = byId(S.a);
    const prev = a && S.videos
      .filter((x) => slug(x.project) === slug(a.project) && slug(x.title) === slug(a.title) && x.version < a.version)
      .sort((x, y) => (slug(y.variant) === slug(a.variant)) - (slug(x.variant) === slug(a.variant)) || y.version - x.version)[0];
    S.b = prev?.id || null;
  }
  if (!S.compare) S.b = null;
  renderMain();
}

// Step through the cards in on-screen order (← / →).
function step(dir) {
  const cards = [...document.querySelectorAll('.rail .card')];
  if (!cards.length) return;
  const i = cards.findIndex((c) => c.dataset.id === (S.compare && S.b ? S.b : S.a));
  const next = cards[Math.max(0, Math.min(cards.length - 1, i + dir))];
  if (next) { select(next.dataset.id); next.scrollIntoView({ block: 'nearest' }); }
}

function editProjectName(h1, p) {
  h1.contentEditable = 'true';
  h1.focus();
  document.getSelection().selectAllChildren(h1);
  const done = async (ok) => {
    h1.contentEditable = 'false';
    const to = h1.innerText.trim();
    if (ok && to && to !== p.name) {
      await api('api/projects/rename', 'POST', { from: p.name, to });
      S.project = slug(to);
      await refresh(true);
    } else h1.innerText = p.name;
  };
  h1.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); h1.onblur = null; done(true); } if (e.key === 'Escape') { h1.onblur = null; done(false); } };
  h1.onblur = () => done(true);
}

async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 3600);
}

// ---------- search & keys ----------
const search = $('#search');
search.addEventListener('input', () => {
  S.query = search.value.trim();
  renderSide();
  if (!S.project) renderHome();
  else document.querySelectorAll('.rail .card').forEach((c) => c.classList.toggle('dim', !!S.query && !matches(byId(c.dataset.id))));
});
search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const p = projects({ filtered: true })[0]; if (p) { openProject(p.key); search.blur(); } }
  if (e.key === 'Escape') { search.value = ''; search.dispatchEvent(new Event('input')); search.blur(); }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'ל')) { e.preventDefault(); openPalette(); return; }
  const typing = e.target.closest?.('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]');
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '?') { e.preventDefault(); toggleHelp(); return; }
  if (e.key === '/') { e.preventDefault(); search.focus(); search.select(); }
  else if (e.key === 'Escape' && S.project) openHome();
  else if (e.key === 'ArrowLeft' && S.project) { e.preventDefault(); step(1); }   // RTL: left = onward
  else if (e.key === 'ArrowRight' && S.project) { e.preventDefault(); step(-1); }
  else if ((e.key === 'c' || e.key === 'ב') && S.project) toggleCompare();
});

// ---------- live updates ----------
const KIND_TOAST = { approve: 'אישר/ה', changes: 'ביקש/ה תיקון ב־', comment: 'הגיב/ה על' };
async function pollState() {
  if (STATIC) return;
  try { S.state = await api('api/state'); } catch { return; }
  renderPublish();
  if (S.state.feedback.last !== S.fbLast) {
    const first = S.fbLast === null;
    const before = new Set(S.events.map((e) => e.id));
    try { S.events = (await api('api/feedback')).events; } catch { return; }
    S.fbLast = S.state.feedback.last;
    if (!first) {
      const fresh = S.events.filter((e) => !before.has(e.id) && e.kind !== 'view');
      const last = fresh.at(-1);
      const v = last && byId(last.video);
      if (v) toast(`${last.name || 'הלקוח'} ${KIND_TOAST[last.kind]} ${v.project} v${v.version}`);
    }
    renderSide();
    if (S.project) renderMain(); else renderHome();
  }
  if (S.state.rev !== S.rev) refresh();
}

async function refresh(force = false) {
  let data;
  if (STATIC) {
    try { data = await (await fetch('data.json', { cache: 'no-store' })).json(); } catch { return; }
    if (!force && data.rev === S.rev) return;
  } else {
    try { data = await api('api/videos'); } catch { return; }
    if (!force && data.rev === S.rev) return;
  }
  const first = S.rev === -1;
  const before = new Set(S.videos.map((v) => v.id));
  S.rev = data.rev;
  S.videos = data.videos;

  const added = first ? [] : S.videos.filter((v) => !before.has(v.id));
  added.forEach((v) => S.fresh.add(v.id));
  setTimeout(() => added.forEach((v) => S.fresh.delete(v.id)), 4000);

  if (first) {
    const { p, id } = readHash();
    return projects().some((x) => x.key === p) ? openProject(p, id) : openHome();
  }

  if (added.length) {
    const n = added[added.length - 1];
    toast(`חדש · ${n.project} v${n.version}${n.variant ? ' · ' + n.variant : ''}`);
    const playing = [...document.querySelectorAll('.players video')].some((x) => !x.paused);
    if (S.project && !playing && !S.compare) return openProject(slug(n.project), n.id);
  }
  if (S.project && !projects().some((x) => x.key === S.project)) return openHome();
  if (S.a && !byId(S.a)) S.a = projects().find((x) => x.key === S.project)?.latest.id;
  if (S.b && !byId(S.b)) S.b = null;
  renderSide();
  renderMain();
}

// ---------- add dialog ----------
const dlg = $('#addDlg');
$('#addBtn')?.addEventListener('click', () => { $('#addErr').textContent = ''; dlg.showModal(); });
$('#addForm').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  const f = new FormData(e.target);
  const path = f.get('path').trim().replace(/^"|"$/g, '');
  const project = f.get('project').trim() || undefined;
  const isFile = /\.(mp4|webm|mov|m4v|mkv)$/i.test(path);
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const r = isFile ? await api('api/videos', 'POST', { path, project }) : await api('api/scan', 'POST', { dir: path, project });
    dlg.close();
    e.target.reset();
    await refresh(true);
    const v = isFile ? r.video : r.results.at(-1)?.video;
    if (v) openProject(slug(v.project), v.id);
  } catch (err) {
    $('#addErr').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

window.addEventListener('hashchange', () => {
  const { p, id } = readHash();
  if (!p) { if (S.project) openHome(); return; }
  if (p !== S.project || (id && id !== S.a)) openProject(p, id);
});

(STATIC ? Promise.resolve() : api('api/local').then((l) => (S.local = l)).catch(() => {})).then(() => refresh()).then(pollState);
if (STATIC) setInterval(refresh, 60000);
else setInterval(pollState, 2500);
setInterval(() => { renderSide(); renderPublish(); }, 30000);
setInterval(() => { if (S.state?.publish.scheduledAt) renderPublish(); }, 1000);

// ---------- command palette (Ctrl+K): jump anywhere, do anything ----------
function paletteItems() {
  const items = [];
  if (!STATIC) items.push({ k: 'פרסום עכשיו', sub: 'העלאת השינויים לאתר', ic: ICON.upload, run: () => $('#publish')?.click() });
  items.push({ k: 'כל הפרויקטים', sub: 'מסך הבית', ic: ICON.grid, run: openHome });
  for (const p of projects()) {
    items.push({ k: p.name, sub: `פרויקט · ${new Set(p.videos.map((v) => v.title + v.version)).size} גרסאות`, ic: ICON.folder, img: p.latest.poster, run: () => openProject(p.key) });
    if (p.latest.review && !STATIC) {
      items.push({ k: `לינק ללקוח · ${p.name}`, sub: 'העתקה', ic: ICON.link, run: () => { copy(reviewUrl(p.latest), 'לינק הלקוח הועתק'); sent(p.name, 'link'); } });
      items.push({ k: `וואטסאפ ללקוח · ${p.name}`, sub: 'פתיחה בוואטסאפ', ic: ICON.whatsapp, run: () => { window.open(wa(`${p.name} · צפייה ואישור\n${reviewUrl(p.latest)}`), '_blank', 'noopener'); sent(p.name, 'wa'); } });
    }
  }
  for (const v of S.videos) items.push({ k: `${v.project} v${v.version}${v.variant ? ' ' + v.variant : ''}`, sub: `${v.title} · ${fmt.date(v.createdAt)}`, ic: ICON.film, img: v.poster, run: () => openProject(slug(v.project), v.id) });
  if (!STATIC) items.push({ k: 'הוספת וידאו', sub: 'מנתיב בדיסק', ic: ICON.upload, run: () => $('#addBtn')?.click() });
  items.push({ k: 'קיצורי מקלדת', sub: '?', ic: ICON.search, run: toggleHelp });
  return items;
}
function openPalette() {
  if ($('#pal')) return;
  const all = paletteItems();
  const el = h(`<div id="pal" class="pal" role="dialog" aria-label="חיפוש ופעולות"><div class="pal-box">
    <label class="pal-in">${ICON.search}<input placeholder="פרויקט, גרסה או פעולה…" autocomplete="off" spellcheck="false"></label>
    <ol class="pal-list" role="listbox"></ol></div></div>`);
  document.body.append(el);
  const input = $('input', el), listEl = $('.pal-list', el);
  let sel = 0, shown = [];
  const score = (it, q) => {
    if (!q) return 1;
    const hay = (it.k + ' ' + it.sub).toLowerCase(), parts = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!parts.every((w) => hay.includes(w))) return 0;
    return (it.k.toLowerCase().startsWith(parts[0]) ? 3 : 1) + (it.k.toLowerCase().includes(q.toLowerCase()) ? 2 : 0);
  };
  const draw = () => {
    const q = input.value.trim();
    shown = all.map((it) => [it, score(it, q)]).filter(([, sc]) => sc > 0).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([it]) => it);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    listEl.innerHTML = shown.length ? shown.map((it, i) => `<li role="option" aria-selected="${i === sel}" class="${i === sel ? 'on' : ''}" data-i="${i}">
      ${it.img ? `<img src="${it.img}" alt="">` : `<span class="pi">${it.ic}</span>`}<span class="pt"><b>${esc(it.k)}</b><small>${esc(it.sub)}</small></span></li>`).join('') : '<li class="none">אין תוצאות</li>';
    listEl.querySelectorAll('li[data-i]').forEach((li) => { li.onmousemove = () => { if (sel !== +li.dataset.i) { sel = +li.dataset.i; draw(); } }; li.onclick = () => go(+li.dataset.i); });
    listEl.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => el.remove();
  const go = (i) => { const it = shown[i]; close(); it?.run(); };
  input.oninput = () => { sel = 0; draw(); };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(sel); }
    else if (e.key === 'Escape') close();
  };
  el.onclick = (e) => { if (e.target === el) close(); };
  draw(); input.focus();
}

// ---------- keyboard help (?) ----------
function toggleHelp() {
  if ($('#help')) return $('#help').remove();
  const keys = [['Ctrl K', 'חיפוש ופעולות'], ['/', 'חיפוש בסרגל'], ['← →', 'גרסה הבאה / קודמת'], ['C', 'השוואה'], ['Esc', 'כל הפרויקטים'], ['?', 'החלון הזה']];
  const el = h(`<div id="help" class="pal"><div class="pal-box help"><h2>קיצורי מקלדת</h2><dl>${keys.map(([k, d]) => `<dt><kbd>${k}</kbd></dt><dd>${d}</dd>`).join('')}</dl><p class="dim-t">גרירת קובץ וידאו לחלון מוסיפה אותו לפרויקט הפתוח.</p></div></div>`);
  el.onclick = () => el.remove();
  document.body.append(el);
}

// ---------- drag a video file onto the window: it is uploaded and registered ----------
if (!STATIC) {
  let depth = 0;
  const overlay = h('<div id="drop" class="drop"><div><b></b><span>הקובץ יועתק לספרייה וירשם כגרסה</span></div></div>');
  document.body.append(overlay);
  const isFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragenter', (e) => {
    if (!isFiles(e)) return; e.preventDefault(); depth++;
    const p = projects().find((x) => x.key === S.project);
    $('b', overlay).textContent = p ? `הוספה לפרויקט ${p.name}` : 'הוספה לספרייה';
    overlay.classList.add('on');
  });
  addEventListener('dragleave', (e) => { if (!isFiles(e)) return; if (--depth <= 0) { depth = 0; overlay.classList.remove('on'); } });
  addEventListener('dragover', (e) => { if (isFiles(e)) e.preventDefault(); });
  addEventListener('drop', async (e) => {
    if (!isFiles(e)) return; e.preventDefault(); depth = 0; overlay.classList.remove('on');
    const files = [...e.dataTransfer.files].filter((f) => /\.(mp4|webm|mov|m4v|mkv)$/i.test(f.name));
    if (!files.length) return toast('רק קבצי וידאו (mp4, webm, mov)');
    const p = projects().find((x) => x.key === S.project);
    for (const f of files) {
      try {
        const r = await new Promise((resolve, reject) => {
          const x = new XMLHttpRequest();
          x.open('POST', `api/upload?name=${encodeURIComponent(f.name)}${p ? `&project=${encodeURIComponent(p.name)}` : ''}`);
          x.upload.onprogress = (ev) => { if (ev.lengthComputable) toast(`מעלה ${f.name} · ${Math.round((ev.loaded / ev.total) * 100)}%`); };
          x.onload = () => { try { const j = JSON.parse(x.responseText); x.status < 300 ? resolve(j) : reject(new Error(j.error)); } catch (err) { reject(err); } };
          x.onerror = () => reject(new Error('network'));
          x.send(f);
        });
        toast(r.duplicate ? 'הסרטון כבר בספרייה' : `נוסף · ${r.video.project} v${r.video.version}`);
        await refresh(true);
        openProject(slug(r.video.project), r.video.id);
      } catch (err) { toast(`ההעלאה נכשלה: ${err.message}`); }
    }
  });
}
