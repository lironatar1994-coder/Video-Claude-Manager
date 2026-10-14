// Client review page — /videos/p/<token>/
// Watch the latest version, approve it or ask for changes (optionally pinned to a moment).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API = '../../api/';

const fmt = {
  date: (d) => new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  time: (d) => new Date(d).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }),
  at: (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`,
  rel(d) {
    const s = (new Date(d) - Date.now()) / 1000;
    const r = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });
    for (const [u, n] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]])
      if (Math.abs(s) >= n) return r.format(Math.round(s / n), u).replace(/\s*\(\d+\)$/, '');
    return 'עכשיו';
  },
};
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = { data: null, video: null, events: [], mode: null, at: null, viewed: new Set() };
const video = $('#video');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---------- data ----------
const groupKey = (v) => `${v.title}|${v.version}`;
function groups() {
  const map = new Map();
  for (const v of S.data.videos) {
    if (!map.has(groupKey(v))) map.set(groupKey(v), []);
    map.get(groupKey(v)).push(v);
  }
  return [...map.values()]
    .map((list) => ({ list: list.sort((a, b) => a.variant.localeCompare(b.variant)), when: list.reduce((m, v) => (v.createdAt > m ? v.createdAt : m), '') }))
    .sort((a, b) => (b.when > a.when ? 1 : -1));
}
const latestGroup = () => groups()[0];
const isLatest = (v) => latestGroup().list.includes(v);
const label = (v) => v.variant || '';
// A project can hold several different videos (titles); name them only when it does.
const multiTitle = () => new Set(S.data.videos.map((v) => v.title)).size > 1;
const eventsFor = (v) => S.events.filter((e) => e.video === v.id).sort((a, b) => a.id - b.id);
function approval(v) {
  // The most recent decision wins: a later "changes" request undoes an earlier approval.
  const decisions = eventsFor(v).filter((e) => e.kind === 'approve' || e.kind === 'changes');
  const last = decisions.at(-1);
  return last?.kind === 'approve' ? last : null;
}

// ---------- render ----------
function show(v, { play = false } = {}) {
  const changed = S.video !== v;
  S.video = v;
  if (changed) {
    const t = video.currentTime && S.video && video.dataset.group === groupKey(v) ? video.currentTime : 0;
    video.dataset.group = groupKey(v);
    video.poster = v.poster || '';
    video.src = v.src;
    if (t) video.addEventListener('loadedmetadata', () => { video.currentTime = t; }, { once: true });
    if (play) video.play().catch(() => {});
  }
  const latest = isLatest(v);
  $('#sub').textContent = `${multiTitle() ? v.title + ' · ' : ''}גרסה v${v.version}${label(v) ? ' · ' + label(v) : ''} · ${fmt.date(v.createdAt)} · ${fmt.time(v.createdAt)}`;
  $('#olderNote').hidden = latest;

  const sibs = groups().find((g) => g.list.includes(v)).list;
  $('#variants').innerHTML = sibs.length > 1
    ? sibs.map((s) => `<button type="button" class="chip ${s === v ? 'on' : ''}" aria-pressed="${s === v}" data-id="${s.id}">${esc(label(s) || 'מקור')}</button>`).join('')
    : '';
  $('#variants').querySelectorAll('.chip').forEach((c) => (c.onclick = () => show(S.data.videos.find((x) => x.id === c.dataset.id))));

  const older = groups().slice(1);
  $('#older').hidden = !older.length;
  $('#older h2').textContent = multiTitle() ? 'סרטונים וגרסאות נוספים' : 'גרסאות קודמות';
  $('#olderList').innerHTML = older.map((g) => {
    const o = g.list[0];
    const ok = g.list.some(approval);
    return `<button type="button" class="old ${g.list.includes(v) ? 'on' : ''}" data-id="${o.id}">
      ${o.poster ? `<img src="${esc(o.poster)}" alt="" loading="lazy">` : '<span class="ph"></span>'}
      <span class="old-text"><b class="num">v${o.version}</b>${multiTitle() ? `<span class="old-title">${esc(o.title)}</span>` : ''}<span class="num">${fmt.date(g.when)}</span></span>
      ${ok ? '<span class="tick" title="אושר">✓</span>' : ''}
    </button>`;
  }).join('');
  $('#olderList').querySelectorAll('.old').forEach((b) => (b.onclick = () => {
    show(S.data.videos.find((x) => x.id === b.dataset.id), { play: true });
    if (matchMedia('(max-width: 900px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

  renderFeedback();
}

function renderFeedback() {
  const v = S.video;
  const list = eventsFor(v);
  const ok = approval(v);
  const st = $('#status');
  st.hidden = false;
  st.className = `status ${ok ? 'ok' : list.some((e) => e.kind === 'changes') ? 'changes' : ''}`;
  st.textContent = ok ? 'אושר' : list.some((e) => e.kind === 'changes') ? 'בתיקונים' : 'ממתין לאישור';
  $('#approveBtn').classList.toggle('done', !!ok);
  $('#approveBtn span').textContent = ok ? `אושר${ok.name ? ' · ' + ok.name : ''}` : 'אישור הגרסה';

  $('#count').textContent = list.length ? list.length : '';
  $('#empty').hidden = list.length > 0;
  const KIND = { approve: 'אישור', changes: 'תיקון', comment: 'הערה' };
  $('#thread').innerHTML = list.slice().reverse().map((e) => `
    <li class="item ${e.kind}">
      <div class="item-head">
        <span class="kind">${KIND[e.kind]}</span>
        <b>${esc(e.name || 'אורח')}</b>
        <span class="when">${fmt.rel(e.ts)}</span>
      </div>
      ${e.at != null ? `<button type="button" class="at num" data-at="${e.at}">${fmt.at(e.at)}</button>` : ''}
      ${e.text ? `<p>${esc(e.text)}</p>` : ''}
    </li>`).join('');
  $('#thread').querySelectorAll('.at').forEach((b) => (b.onclick = () => seek(+b.dataset.at)));
  renderMarkers();
}

function renderMarkers() {
  const v = S.video;
  const pts = eventsFor(v).filter((e) => e.at != null);
  const dur = video.duration || v.duration;
  const m = $('#markers');
  m.hidden = !pts.length || !dur;
  // The player's own progress bar runs left→right even on a Hebrew page, so the markers do too.
  m.innerHTML = pts.map((e) => `<button type="button" class="mark ${e.kind}" style="left:${Math.min(100, (e.at / dur) * 100)}%" data-at="${e.at}" title="${esc(`${fmt.at(e.at)} · ${e.text || ''}`)}" aria-label="${fmt.at(e.at)}"></button>`).join('');
  m.querySelectorAll('.mark').forEach((b) => (b.onclick = () => seek(+b.dataset.at)));
}

function seek(t) {
  video.currentTime = t;
  video.pause();
  video.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- composer ----------
function openComposer(mode) {
  S.mode = mode;
  const c = $('#composer');
  c.hidden = false;
  $('#decide').classList.add('composing');
  $('#formErr').textContent = '';
  $('#name').value = store.get('reviewer', '');
  const v = S.video;
  if (mode === 'approve') {
    $('#composerTitle').textContent = `לאשר את v${v.version}${label(v) ? ' · ' + label(v) : ''}?`;
    $('#text').placeholder = 'הערה (לא חובה)';
    $('#text').required = false;
    $('#atChip').hidden = true;
    S.at = null;
    $('#sendBtn span').textContent = 'אישור';
  } else {
    video.pause();
    S.at = video.currentTime > 0.3 ? video.currentTime : null;
    $('#composerTitle').textContent = 'מה לשנות?';
    $('#text').placeholder = S.at != null ? 'מה לשנות ברגע הזה?' : 'מה לשנות?';
    $('#text').required = true;
    $('#atChip').hidden = S.at == null;
    $('#atChip').setAttribute('aria-pressed', 'true');
    $('#atChip').textContent = S.at != null ? `בזמן ${fmt.at(S.at)}` : '';
    $('#sendBtn span').textContent = 'שליחה';
  }
  setTimeout(() => (mode === 'approve' && $('#name').value ? $('#sendBtn') : $('#text')).focus(), 50);
  if (matchMedia('(max-width: 900px)').matches) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function closeComposer() {
  $('#composer').hidden = true;
  $('#decide').classList.remove('composing');
  $('#text').value = '';
  S.mode = null;
}

$('#approveBtn').onclick = () => openComposer('approve');
$('#changesBtn').onclick = () => openComposer('changes');
$('#cancelBtn').onclick = closeComposer;
$('#atChip').onclick = () => {
  const on = $('#atChip').getAttribute('aria-pressed') !== 'true';
  $('#atChip').setAttribute('aria-pressed', String(on));
};
$('#composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#text').value.trim();
  if (S.mode === 'changes' && !text) { $('#formErr').textContent = 'כתבו מה לשנות'; return; }
  const name = $('#name').value.trim();
  store.set('reviewer', name);
  const btn = $('#sendBtn');
  btn.disabled = true;
  btn.classList.add('busy');
  try {
    const r = await fetch(API + 'feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: S.data.token, video: S.video.id, kind: S.mode, text, name,
        at: S.mode === 'changes' && $('#atChip').getAttribute('aria-pressed') === 'true' ? S.at : null,
      }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    const { event } = await r.json();
    S.events.push(event);
    const was = S.mode;
    closeComposer();
    renderFeedback();
    toast(was === 'approve' ? 'הגרסה אושרה · תודה!' : 'ההערה נשלחה');
  } catch {
    $('#formErr').textContent = 'לא נשלח. בדקו את החיבור ונסו שוב.';
  } finally {
    btn.disabled = false;
    btn.classList.remove('busy');
  }
});
$('#text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#composer').requestSubmit();
  if (e.key === 'Escape') closeComposer();
});
$('#backToLatest').onclick = () => show(latestGroup().list[0], { play: true });

// ---------- views ----------
video.addEventListener('play', () => {
  const v = S.video;
  if (!v || S.viewed.has(v.id)) return;
  S.viewed.add(v.id);
  fetch(API + 'view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: S.data.token, video: v.id }) }).catch(() => {});
});
video.addEventListener('loadedmetadata', renderMarkers);

// ---------- boot ----------
async function loadEvents() {
  try {
    const r = await fetch(`${API}feedback?token=${encodeURIComponent(S.data.token)}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { events } = await r.json();
    const changed = events.length !== S.events.length;
    S.events = events;
    if (changed && S.video) renderFeedback();
  } catch { /* offline: keep what we have */ }
}

(async () => {
  try {
    S.data = await (await fetch('data.json', { cache: 'no-store' })).json();
  } catch {
    $('#title').textContent = 'הקישור לא זמין';
    document.body.classList.add('broken');
    return;
  }
  $('#title').textContent = S.data.project;
  await loadEvents();
  const g = latestGroup();
  // Within the newest version, open the most recent render — usually the finished cut.
  show(g.list.slice().sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0]);
  setInterval(loadEvents, 30e3);
})();
