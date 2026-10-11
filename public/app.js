const $ = (s, el = document) => el.querySelector(s);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => String(s).trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

const ICON = {
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="16" rx="2"/><rect x="14" y="4" width="7" height="16" rx="2"/></svg>',
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
  size: (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB'),
};

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Production build: a read-only snapshot (data.json + media files), no API.
const STATIC = document.documentElement.dataset.mode === 'static';
if (STATIC) $('#addBtn').remove();

const S = { rev: -1, videos: [], project: null, a: null, b: null, compare: false, fresh: new Set() };

// ---------- data shaping ----------
function projects() {
  const map = new Map();
  for (const v of S.videos) {
    const k = slug(v.project);
    if (!map.has(k)) map.set(k, { key: k, name: v.project, videos: [] });
    map.get(k).videos.push(v);
  }
  for (const p of map.values()) {
    p.videos.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
    p.latest = p.videos[0];
  }
  return [...map.values()].sort((x, y) => new Date(y.latest.createdAt) - new Date(x.latest.createdAt));
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

const byId = (id) => S.videos.find((v) => v.id === id);
const isLatest = (v) => !S.videos.some((x) => slug(x.project) === slug(v.project) && slug(x.title) === slug(v.title) && x.version > v.version);
const label = (v) => v.variant || 'מקור';

// ---------- routing ----------
function syncHash() {
  const want = `#${encodeURIComponent(S.project || '')}${S.a ? '/' + S.a : ''}`;
  if (location.hash !== want) history.replaceState(null, '', want);
}
function readHash() {
  const [p, id] = decodeURIComponent(location.hash.slice(1)).split('/');
  return { p: p || null, id: id || null };
}

// ---------- render ----------
function renderSide() {
  const nav = $('#projects');
  const visited = store.get('visited', {});
  nav.replaceChildren(...projects().map((p) => {
    const unseen = p.key !== S.project && p.videos.some((v) => v.addedAt > (visited[p.key] || ''));
    const el = h(`<button class="proj ${p.key === S.project ? 'on' : ''}">
      ${p.latest.poster ? `<img src="${p.latest.poster}" alt="" loading="lazy">` : '<span class="ph"></span>'}
      <span style="min-width:0">
        <div class="proj-name">${esc(p.name)}${unseen ? '<span class="dot-new"></span>' : ''}</div>
        <div class="proj-when">${fmt.rel(p.latest.createdAt)}</div>
      </span>
      <span class="proj-count num">${new Set(p.videos.map((v) => v.title + v.version)).size}</span>
    </button>`);
    el.onclick = () => openProject(p.key);
    return el;
  }));
}

function renderMain() {
  const main = $('#main');
  const p = projects().find((x) => x.key === S.project);
  if (!p) {
    main.replaceChildren(h(`<div class="empty"><div><b>אין עדיין סרטונים</b>
      וידאו חדש שנוצר יופיע כאן אוטומטית<br>
      <code class="ltr">node register.mjs &lt;video.mp4&gt;</code></div></div>`));
    return;
  }
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
  head.innerHTML = `<div>
      <h1 title="לחיצה כפולה לשינוי שם">${esc(p.name)}</h1>
      <div class="head-meta"><span class="num">${versions}</span> גרסאות · עודכן ${fmt.rel(p.latest.createdAt)}</div>
    </div>
    <div class="tools"><button class="pill ${S.compare ? 'on' : ''}" id="cmp">${ICON.compare}השוואה</button></div>`;
  $('#cmp', head).onclick = toggleCompare;
  const h1 = $('h1', head);
  if (STATIC) h1.removeAttribute('title');
  else h1.ondblclick = () => editProjectName(h1, p);

  const rail = $('.rail', main);
  rail.replaceChildren(...groups.map((g) => {
    const sec = h(`<div class="ver">
      <div class="ver-head">
        <div class="ver-label num"><small>v</small>${g.version}${multiTitle ? `<span class="t">${esc(g.title)}</span>` : ''}${g.latest ? '<span class="badge-new">אחרון</span>' : ''}</div>
        <div class="ver-when num">${fmt.short(g.when)} · ${fmt.time(g.when)}</div>
      </div>
      <div class="cards"></div>
    </div>`);
    $('.cards', sec).append(...g.videos.map(card));
    return sec;
  }));

  renderStage();
}

function card(v) {
  const wide = v.width && v.height && v.width > v.height;
  const cls = [v.id === S.a && 'on', v.id === S.b && 'on-b', S.fresh.has(v.id) && 'fresh', wide && 'wide'].filter(Boolean).join(' ');
  const el = h(`<button class="card ${cls}" data-id="${v.id}" title="${esc(fmt.date(v.createdAt) + ' ' + fmt.time(v.createdAt))}">
    <div class="thumb ${wide ? 'wide' : ''}">
      ${v.poster ? `<img src="${v.poster}" alt="" loading="lazy">` : ''}
      <video muted loop playsinline preload="none"></video>
      ${v.duration ? `<span class="dur num">${fmt.dur(v.duration)}</span>` : ''}
      ${S.compare && (v.id === S.a || v.id === S.b) ? `<span class="ab">${v.id === S.a ? 'A' : 'B'}</span>` : ''}
    </div>
    <div class="card-label">${esc(label(v))}</div>
  </button>`);
  const pv = $('video', el);
  el.onmouseenter = () => { if (!pv.src) { pv.src = `${v.src}`; pv.onplaying = () => pv.classList.add('ready'); } pv.play().catch(() => {}); };
  el.onmouseleave = () => pv.pause();
  el.onclick = () => select(v.id);
  return el;
}

function slot(v, tag) {
  const landscape = v.width > v.height;
  const el = h(`<div class="slot ${landscape ? 'landscape' : ''}" data-id="${v.id}">
    <video src="${v.src}" controls playsinline preload="metadata" ${v.poster ? `poster="${v.poster}"` : ''}></video>
    <div class="slot-tag num">${tag ? `<b>${tag}</b>` : ''}v${v.version} · ${esc(label(v))} · ${fmt.short(v.createdAt)} ${fmt.time(v.createdAt)}</div>
  </div>`);
  return el;
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
    <div class="big-ver num"><small>v</small>${v.version}${isLatest(v) ? '<span class="badge-new">אחרון</span>' : ''}</div>
    ${siblings.length > 1 ? `<div class="variants">${siblings.map((s) => `<button class="chip ${s.id === v.id ? 'on' : ''}" data-id="${s.id}">${esc(label(s))}</button>`).join('')}</div>` : ''}
    <div class="when num">
      <span class="date">${fmt.date(v.createdAt)}</span>
      <span class="time">${fmt.time(v.createdAt)}</span>
      <span class="rel">${fmt.rel(v.createdAt)}</span>
    </div>
    <div class="facts num">${[v.duration && fmt.dur(v.duration), v.width && `${v.width}×${v.height}`, fmt.size(v.size)].filter(Boolean).map((x) => `<span class="ltr">${x}</span>`).join('')}</div>
    <div class="note" contenteditable="plaintext-only" data-ph="הערה…" spellcheck="false">${esc(v.note)}</div>
    <div class="acts">
      <button class="icon" data-act="reveal" title="פתיחת התיקייה">${ICON.folder}</button>
      <a class="icon" href="${v.src}" download="${esc(v.name)}" title="הורדה">${ICON.download}</a>
      ${STATIC ? '' : `<button class="icon danger" data-act="delete" title="הסרה מהספרייה">${ICON.trash}</button>`}
    </div>`;
  if (STATIC) {
    $('[data-act=reveal]', info).remove();
    const n = $('.note', info);
    if (v.note) n.contentEditable = 'false'; else n.remove();
    return;
  }
  info.querySelectorAll('.chip').forEach((c) => (c.onclick = () => select(c.dataset.id, true)));
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
function openProject(key, id) {
  S.project = key;
  const p = projects().find((x) => x.key === key);
  S.a = id && byId(id) ? id : p?.latest.id || null;
  S.b = null;
  const visited = store.get('visited', {});
  visited[key] = new Date().toISOString();
  store.set('visited', visited);
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
}

function toggleCompare() {
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
  toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---------- live updates ----------
async function refresh(force = false) {
  let data;
  if (STATIC) {
    try { data = await (await fetch('data.json', { cache: 'no-store' })).json(); } catch { return; }
    if (!force && data.rev === S.rev) return;
  } else {
    let rev;
    try { ({ rev } = await api('api/rev')); } catch { return; }
    if (!force && rev === S.rev) return;
    data = await api('api/videos');
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
    const all = projects();
    return openProject(all.some((x) => x.key === p) ? p : all[0]?.key || null, id);
  }

  if (added.length) {
    const n = added[added.length - 1];
    toast(`חדש · ${n.project} v${n.version}${n.variant ? ' · ' + n.variant : ''}`);
    const playing = [...document.querySelectorAll('.players video')].some((x) => !x.paused);
    if (!playing && !S.compare) return openProject(slug(n.project), n.id);
  }
  if (!projects().some((x) => x.key === S.project)) return openProject(projects()[0]?.key || null);
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
  if (p && (p !== S.project || (id && id !== S.a))) openProject(p, id);
});

refresh();
setInterval(refresh, STATIC ? 60000 : 2500);
setInterval(renderSide, 60000);
