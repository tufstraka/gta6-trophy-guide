// Platinum Leonida - an offline GTA VI trophy tracker and sourced guide.
// Data: data/trophies.json (official names, descriptions and grades).
// Progress lives in localStorage; export/import is plain JSON.

const STORAGE_KEY = 'platinum-leonida/v1';
const LEGACY_KEY = 'leonida-ledger/v1';
const GRADES = ['platinum', 'gold', 'silver', 'bronze'];
const GRADE_LABEL = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
const KIND_LABEL = {
  platinum: 'Platinum', story: 'Story', side: 'Side story', activity: 'Activity',
  collect: 'Collectible', explore: 'Exploration', crime: 'Crime', economy: 'Economy', partner: 'Partner',
};
const MISS_LABEL = { none: 'Not missable', attempt: 'Attempt only', unknown: 'Timing not pinned' };
const MISS_NOTE = {
  attempt: 'A failed attempt costs you only the attempt. This can be redone until the condition is met.',
  unknown: 'The official text names no chapter, mission or map square for this one, so treat it as do-early rather than risk a closed window.',
};

// A curated preview so screenshots and first looks show a lived-in save.
// It is used only with ?demo=1 and is never written to localStorage.
const DEMO_EARNED = [2, 3, 4, 5, 8, 9, 10, 19, 21, 27, 35, 42, 55];
const DEMO_COUNTERS = { 14: 37, 15: 64, 17: 19, 28: 11, 31: 37, 32: 14, 48: 180, 52: 120000 };

const ROADMAP = [
  {
    n: '01', title: 'The story spine', ids: [2, 3, 4, 5, 6, 7],
    why: 'Six milestones from Gone Fishing to the final mission. Nothing optional is needed, so this is the safest place to start, and the chapters open the systems every later phase leans on.',
  },
  {
    n: '02', title: 'Missions and stranger strands', ids: [8, 9, 10, 11, 12, 13, 22, 23, 24, 25, 26, 27, 29, 48],
    why: 'The named missions, then the contacts. Strangers & Freaks wants eight completed strands, not eight jobs, and each contact trophy is the last job in that strand. Choices count here too.',
  },
  {
    n: '03', title: 'Partner work and street crime', ids: [33, 34, 37, 39, 40, 41, 43, 45],
    why: 'Jobs that want a partner or a clean getaway. Two of these are attempt-scoped, so plan the attempt before you start it; the rest are free-roam crime best done with a fast car parked nearby.',
  },
  {
    n: '04', title: 'Activities and skill checks', ids: [16, 17, 18, 19, 20, 21, 28, 31, 32, 36, 46, 47, 49, 50, 51, 38],
    why: 'Repeatable events, skill checks and the cryptic ones. Counters do the bookkeeping here: gold medals at the range, drone-race wins, challenges, meditations. The vague descriptions are grouped last.',
  },
  {
    n: '05', title: 'Collecting and exploring', ids: [15, 30, 35, 42, 44, 54, 55],
    why: 'Stunts, card sets, vehicles, the 52 areas, garages and the scooter app. Do the exploration sweep with the counters open; no official list of spawns exists to copy, so the game map is the authority.',
  },
  {
    n: '06', title: 'Money and property', ids: [52, 53],
    why: 'Two dollar targets: $250,000 of Marked Bills laundered through contacts, and $100,000 spent across the shops. Both fill naturally from phase 03, so check them before the final sweep.',
  },
  {
    n: '07', title: '100% and the platinum', ids: [14, 1],
    why: 'A Long Road is the full completion sweep; the platinum is its receipt. Read the phase bars first: whatever is short is what 100% is still asking for.',
  },
];

const state = {
  doc: null,
  trophies: [],
  byId: new Map(),
  earned: new Set(),
  counters: {},
  revealed: new Set(),
  spoiler: false,
  tab: 'checklist',
  selected: null,
  demo: false,
  filters: { q: '', grade: 'all', kind: 'all', status: 'all', missable: false },
};

const el = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US');

function isEarned(t) { return state.earned.has(t.name); }
function isMasked(t) { return state.spoiler && !isEarned(t) && (t.hidden || t.kind === 'story') && !state.revealed.has(t.id); }
function countOf(t) { return state.counters[t.id] ?? (isEarned(t) ? t.target : 0); }
function missableList() { return state.trophies.filter((t) => t.missable !== 'none'); }

function save() {
  if (state.demo) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: 1, earned: [...state.earned], counters: state.counters, spoiler: state.spoiler, savedAt: new Date().toISOString(),
    }));
    el('save-note').textContent = 'Saved in this browser';
  } catch {
    el('save-note').textContent = 'Could not save - browser storage is blocked';
  }
}

function load() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY) ?? 'null'); } catch { stored = null; }
  if (!stored) return;
  if (Array.isArray(stored.earned)) {
    // Names are the portable key: a save survives even if ids ever move.
    const known = new Set(state.trophies.map((t) => t.name));
    for (const name of stored.earned) if (known.has(name)) state.earned.add(name);
  }
  if (stored.counters && typeof stored.counters === 'object') {
    for (const [id, n] of Object.entries(stored.counters)) {
      const t = state.byId.get(Number(id));
      if (t && Number.isFinite(Number(n))) state.counters[t.id] = Math.max(0, Math.min(t.target, Math.round(Number(n))));
    }
  }
  if (typeof stored.spoiler === 'boolean') state.spoiler = stored.spoiler;
}

function applyParams() {
  const p = new URLSearchParams(location.search);
  if (p.get('demo') === '1') {
    state.demo = true;
    state.earned = new Set(DEMO_EARNED.map((id) => state.byId.get(id)?.name).filter(Boolean));
    state.counters = { ...DEMO_COUNTERS };
    el('demo-pill').hidden = false;
  }
  if (p.get('spoiler') === '1') state.spoiler = true;
  if (p.get('q')) state.filters.q = p.get('q');
  if (p.get('grade') && ['all', ...GRADES].includes(p.get('grade'))) state.filters.grade = p.get('grade');
  if (p.get('kind')) state.filters.kind = p.get('kind');
  if (p.get('status')) state.filters.status = p.get('status');
  if (p.get('missable') === '1') state.filters.missable = true;
}

function visible() {
  const { q, grade, kind, status, missable } = state.filters;
  const needle = q.trim().toLowerCase();
  return state.trophies.filter((t) => {
    if (grade !== 'all' && t.grade !== grade) return false;
    if (kind !== 'all' && t.kind !== kind) return false;
    if (status === 'earned' && !isEarned(t)) return false;
    if (status === 'unearned' && isEarned(t)) return false;
    if (missable && t.missable === 'none') return false;
    if (needle) {
      const hay = `${t.name} ${t.description} ${t.guide} ${t.advice ?? ''} ${t.where} ${t.kind} ${t.grade}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/* ---------------- stats ---------------- */
function renderStats() {
  const total = state.trophies.length;
  const earned = state.trophies.filter(isEarned).length;
  const pct = total ? Math.round((earned / total) * 100) : 0;
  el('stat-total').textContent = total;
  el('stat-earned').textContent = earned;
  el('stat-plat').textContent = `${pct}%`;
  el('tabcount').textContent = `${earned}/${total}`;
  el('misscount').textContent = String(missableList().length);
  const bar = el('platbar');
  bar.setAttribute('aria-valuenow', String(earned));
  el('platfill').style.width = `${pct}%`;
  const left = Math.max(0, 54 - earned);
  el('plat-caption-text').textContent = earned >= total
    ? 'Every trophy earned - Leonida Legend.'
    : earned >= 54
      ? `${earned} of ${total} earned - the platinum is in reach.`
      : `${earned} of ${total} earned - ${left} more unlock the platinum`;
  const bars = GRADES.map((g) => {
    const all = state.trophies.filter((t) => t.grade === g);
    const got = all.filter(isEarned).length;
    const p = all.length ? Math.round((got / all.length) * 100) : 0;
    return `<li><span class="gb-dot gb-${g}"></span><span class="gb-name">${g === 'platinum' ? 'Plat' : GRADE_LABEL[g]}</span><span class="gb-count">${got}/${all.length}</span></li>`;
  }).join('');
  el('gradebars').innerHTML = bars;
}

/* ---------------- filters ---------------- */
function chip(label, value, group, pressed, extra = '', swatch = '') {
  return `<button class="chip" type="button" role="button" aria-pressed="${pressed}" data-group="${group}" data-value="${esc(value)}">${swatch}${esc(label)}${extra}</button>`;
}

function renderFilters() {
  const earnedIn = (g) => state.trophies.filter((t) => t.grade === g && isEarned(t)).length;
  el('grade-filters').innerHTML = [
    chip('All grades', 'all', 'grade', state.filters.grade === 'all', `<span class="n">${state.trophies.length}</span>`),
    ...GRADES.map((g) => chip(GRADE_LABEL[g], g, 'grade', state.filters.grade === g,
      `<span class="n">${earnedIn(g)}/${state.trophies.filter((t) => t.grade === g).length}</span>`,
      `<span class="swatch" style="background:var(--${g})"></span>`)),
  ].join('');

  const kinds = [...new Set(state.trophies.map((t) => t.kind))];
  el('kind-filters').innerHTML = [
    chip('Everything', 'all', 'kind', state.filters.kind === 'all'),
    ...kinds.map((k) => chip(KIND_LABEL[k] ?? k, k, 'kind', state.filters.kind === k,
      `<span class="n">${state.trophies.filter((t) => t.kind === k).length}</span>`)),
  ].join('');

  const earned = state.trophies.filter(isEarned).length;
  el('status-filters').innerHTML = [
    chip('All', 'all', 'status', state.filters.status === 'all'),
    chip('Earned', 'earned', 'status', state.filters.status === 'earned', `<span class="n">${earned}</span>`),
    chip('Unearned', 'unearned', 'status', state.filters.status === 'unearned', `<span class="n">${state.trophies.length - earned}</span>`),
    chip('Missable only', 'missable', 'missable', state.filters.missable, `<span class="n">${missableList().length}</span>`),
  ].join('');

  el('spoiler').checked = state.spoiler;
  el('search').value = state.filters.q;
  el('clear-search').hidden = !state.filters.q;
}

/* ---------------- list ---------------- */
function renderList() {
  const list = el('trophylist');
  const rows = visible();
  const scroll = list.scrollTop;
  const meta = el('listmeta');
  const earnedShown = rows.filter(isEarned).length;
  meta.innerHTML = `<span>Showing ${rows.length} of ${state.trophies.length}</span><span>${earnedShown} earned here</span>`;
  el('list-empty').hidden = rows.length > 0;

  if (state.selected == null && rows.length) state.selected = rows[0].id;
  if (state.selected != null && !rows.some((t) => t.id === state.selected) && rows.length) state.selected = rows[0].id;

  list.innerHTML = rows.map((t) => {
    const masked = isMasked(t);
    const got = isEarned(t);
    const c = countOf(t);
    const showCount = t.target > 1 && !got && c > 0;
    const name = masked ? (t.hidden ? 'Hidden trophy' : 'Story trophy') : t.name;
    const desc = masked ? 'Spoiler-safe mode - earn or reveal it to read the description' : t.description;
    return `<li class="trow${got ? ' is-earned' : ''}${masked ? ' is-masked' : ''}" role="option" tabindex="-1"
      aria-selected="${state.selected === t.id}" data-id="${t.id}" aria-label="${esc(name)}, ${GRADE_LABEL[t.grade]}${got ? ', earned' : ''}">
      <button class="check" type="button" role="checkbox" aria-checked="${got}" aria-label="${got ? 'Unmark' : 'Mark'} ${esc(name)} earned" data-check="${t.id}">&#10003;</button>
      <span class="tmain"><span class="tname">${esc(name)}</span><span class="tdesc">${esc(desc)}</span></span>
      <span class="tright">
        <span class="grade grade-${t.grade}">${GRADE_LABEL[t.grade]}</span>
        ${showCount ? `<span class="count-badge">${fmt(c)}/${fmt(t.target)}</span>` : ''}
        ${t.missable !== 'none' && !masked ? `<span class="flag">${t.missable === 'attempt' ? 'Attempt' : 'Missable?'}</span>` : ''}
      </span>
    </li>`;
  }).join('');

  list.scrollTop = scroll;
  el('status-filters').querySelectorAll('[data-value="missable"]').forEach((b) => b.setAttribute('aria-pressed', String(state.filters.missable)));
}

/* ---------------- detail ---------------- */
function advicePanel(t) {
  if (!t.advice) return '';
  return `<div class="panel wide advice">
        <p class="panel-label">Our advice</p>
        <p>${esc(t.advice)}</p>
      </div>`;
}

function unitText(t, n) {
  const u = t.unit;
  if (u.startsWith('dollars')) return `${fmt(n)} ${u.replace('dollars ', '')}`.trim();
  if (u.startsWith('%')) return `${fmt(n)}${u}`;
  return `${fmt(n)} ${u}`;
}

function detailHTML(t) {
  const got = isEarned(t);
  const masked = isMasked(t);
  const prevNext = (() => {
    const rows = visible();
    const i = rows.findIndex((r) => r.id === t.id);
    const prev = i > 0 ? rows[i - 1] : null;
    const next = i >= 0 && i < rows.length - 1 ? rows[i + 1] : null;
    const label = (t) => (isMasked(t) ? (t.hidden ? 'Hidden trophy' : 'Story trophy') : t.name);
    return `<div class="detailnav">
      <button class="btn small" type="button" data-goto="${prev ? prev.id : ''}" ${prev ? '' : 'disabled'}>&#8249; ${prev ? esc(label(prev)) : 'Start of list'}</button>
      <button class="btn small" type="button" data-goto="${next ? next.id : ''}" ${next ? '' : 'disabled'}>${next ? esc(label(next)) : 'End of list'} &#8250;</button>
      <span class="hint"><kbd>j</kbd><kbd>k</kbd> browse &middot; <kbd>e</kbd> mark &middot; <kbd>s</kbd> spoiler</span>
    </div>`;
  })();

  const head = `<div class="detail-head">
      <span class="grade grade-${t.grade}">${GRADE_LABEL[t.grade]}</span>
      <span class="kindtag">${esc(KIND_LABEL[t.kind] ?? t.kind)}</span>
      ${t.hidden ? '<span class="badge badge-hidden">Hidden</span>' : ''}
      ${t.missable !== 'none' ? `<span class="badge badge-${t.missable}">${MISS_LABEL[t.missable]}</span>` : ''}
      <span class="spacer"></span>
      <button class="btn ${got ? '' : 'primary'}" type="button" data-toggle-earned="${t.id}" aria-pressed="${got}">${got ? '&#10003; Earned - undo' : 'Mark earned'}</button>
    </div>`;

  if (masked) {
    return `${head}
      <h2 class="detail-title masked">${t.hidden ? 'Hidden trophy' : 'Story trophy'}</h2>
      <p class="quote">The description is hidden while spoiler-safe mode is on. Mark it earned, or reveal just this one. <cite>Grade: ${GRADE_LABEL[t.grade]}</cite></p>
      <div class="locked">
        <div class="lockmark" aria-hidden="true">&#9670;</div>
        <h3>This one would spoil the story</h3>
        <p>Spoiler-safe mode hides story and hidden trophies until you have earned them. Nothing else about your progress is hidden: the counters and roadmap still work, and you can mark it earned without reading a word.</p>
        <button class="btn" type="button" data-reveal="${t.id}">Reveal this trophy</button>
        <button class="btn primary" type="button" data-toggle-earned="${t.id}">Mark earned</button>
      </div>
      ${prevNext}`;
  }

  const miss = t.missable === 'none' ? '' : `
    <div class="miss-callout">
      <span class="badge badge-${t.missable}">${MISS_LABEL[t.missable]}</span>
      <p><strong>${t.missable === 'attempt' ? 'Attempt-scoped, not lost for good' : 'Timing is not pinned by the official text'}</strong>${MISS_NOTE[t.missable]}</p>
    </div>`;

  const counter = t.target > 1 ? `
    <div class="panel wide counter" aria-label="Progress counter">
      <div class="counter-top">
        <div class="counter-value">${unitText(t, countOf(t))}<small>${t.unit.startsWith('%') ? '' : Math.round((countOf(t) / t.target) * 100) + '%'}</small></div>
        <div class="stepper">
          <button type="button" data-count="${t.id}" data-delta="-1" aria-label="Decrease progress">&#8722;</button>
          <input type="number" inputmode="numeric" min="0" max="${t.target}" value="${countOf(t)}" data-count-input="${t.id}" aria-label="Progress for ${esc(t.name)}">
          <button type="button" data-count="${t.id}" data-delta="1" aria-label="Increase progress">+</button>
          <span class="unit">of ${fmt(t.target)} ${esc(t.unit)}</span>
          <button class="btn small quiet setmax" type="button" data-count="${t.id}" data-delta="${t.target - countOf(t)}" title="Set the counter to its target and mark it earned">Max</button>
        </div>
      </div>
      <div class="counter-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${t.target}" aria-valuenow="${countOf(t)}" aria-label="Counter progress"><span style="width:${Math.min(100, (countOf(t) / t.target) * 100)}%"></span></div>
      <p class="srcline">Target from ${esc(t.sources.find((s) => /PSNProfiles/.test(s) && !/not used/i.test(s)) ? 'PSNProfiles' : 'the official description')}. Ticks are saved with the rest of your progress.</p>
    </div>` : '';

  return `${head}
    <h2 class="detail-title">${esc(t.name)}</h2>
    <blockquote class="quote">${esc(t.description)}<cite>Official description &middot; Exophase</cite></blockquote>
    ${miss}
    <div class="guidegrid">
      <div class="panel wide">
        <p class="panel-label">How to earn it</p>
        <p>${esc(t.guide)}</p>
      </div>
      <div class="panel">
        <p class="panel-label">Where</p>
        <p>${esc(t.where)}</p>
      </div>
      <div class="panel">
        <p class="panel-label">When, and what can close</p>
        <p>${esc(t.when)}</p>
      </div>
      ${advicePanel(t)}
      ${counter}
    </div>
    ${prevNext}`;
}

function renderDetail() {
  const pane = el('detail');
  const t = state.selected != null ? state.byId.get(state.selected) : null;
  if (!t) {
    pane.innerHTML = `<div class="locked"><h3>Pick a trophy</h3><p>Choose any trophy on the left for its guide, location notes, missable window and our advice.</p></div>`;
    return;
  }
  pane.innerHTML = detailHTML(t);
  pane.scrollTop = 0;
}

function renderAll() {
  renderStats();
  renderFilters();
  renderList();
  renderDetail();
  if (state.tab === 'roadmap') renderRoadmap();
  if (state.tab === 'missables') renderMissables();
  if (state.tab === 'progress') renderProgress();
}

/* ---------------- roadmap ---------------- */
function renderRoadmap() {
  const phases = ROADMAP.map((p) => {
    const items = p.ids.map((id) => state.byId.get(id)).filter(Boolean);
    const got = items.filter(isEarned).length;
    const pct = items.length ? Math.round((got / items.length) * 100) : 0;
    const chips = items.map((t) => {
      const masked = isMasked(t);
      return `<button class="tchip${isEarned(t) ? ' is-earned' : ''}" type="button" data-goto="${t.id}">
        <span class="dot" style="background:var(--${t.grade})"></span>${esc(masked ? 'Hidden trophy' : t.name)}
        ${t.missable !== 'none' && !masked ? '<span class="missmark" title="Missable flag">&#2691;</span>' : ''}</button>`;
    }).join('');
    return `<article class="phase">
      <div class="phase-num">${p.n}</div>
      <div>
        <div class="phase-top"><h3>${esc(p.title)}</h3><span class="phase-progress">${got}/${items.length}</span></div>
        <p class="why">${esc(p.why)}</p>
        <div class="phase-bar"><span style="width:${pct}%"></span></div>
        <div class="chipwrap">${chips}</div>
      </div>
    </article>`;
  }).join('');

  const watch = missableList().map((t) => `<li>
      <button type="button" data-goto="${t.id}">
        <span class="wname"><span class="grade grade-${t.grade}">${GRADE_LABEL[t.grade]}</span>${esc(isMasked(t) ? (t.hidden ? 'Hidden trophy' : 'Story trophy') : t.name)}</span>
        <span class="wnote">${t.missable === 'attempt' ? 'Attempt only: ' : 'Timing unpinned: '}${esc(t.where.startsWith('Not pinned') ? 'official text names no place.' : t.where.replace(/\.$/, '') + '.')}</span>
      </button>
    </li>`).join('');

  el('view-roadmap').innerHTML = `
    <div class="page-head">
      <p class="eyebrow">The route to the platinum</p>
      <h2>Seven passes, one Leonida</h2>
      <p>Built from the official descriptions, in the order that keeps the few uncertain windows open. Story first because it opens the state, systems next, the long tails after, and 100% last. The bars count trophies you have marked earned, so the roadmap moves with your save.</p>
      <p class="note">The official text names no point of no return, so this route is our advice, not a rule: do the place-bound trophies early and the final mission late.</p>
    </div>
    <div class="roadmap-layout">
      <div class="phase-grid">${phases}</div>
      <aside class="sidecard">
        <h3>Missable watchlist</h3>
        <p class="sub">${missableList().length} flagged &middot; ${missableList().filter((t) => t.missable === 'attempt').length} attempt-scoped, ${missableList().filter((t) => t.missable === 'unknown').length} with timing the official text leaves open</p>
        <ul class="watch">${watch}</ul>
        <p class="footnote">A flag here is not a claim that a trophy is lost forever. &quot;Attempt only&quot; means a failed attempt can be retried; &quot;timing unpinned&quot; means the official description names no chapter, mission or place, so we will not invent one.</p>
      </aside>
    </div>`;
}

/* ---------------- missables ---------------- */
function renderMissables() {
  const groups = [
    { key: 'attempt', title: 'Attempt-scoped', blurb: 'You can fail these inside a single attempt. None is lost for good as far as the official text says: reset the attempt and meet the condition cleanly.' },
    { key: 'unknown', title: 'Timing the official text leaves open', blurb: 'The description names a place, an action or a joke but not the chapter or mission that offers it. Do these early; we name no location the official text does not.' },
  ];
  const cards = (key) => state.trophies.filter((t) => t.missable === key).map((t) => `
    <article class="miss-card m-${key}">
      <div class="miss-top">
        <h3>${esc(isMasked(t) ? (t.hidden ? 'Hidden trophy' : 'Story trophy') : t.name)}</h3>
        <span class="grade grade-${t.grade}">${GRADE_LABEL[t.grade]}</span>
      </div>
      <p class="desc">${isMasked(t) ? 'Hidden while spoiler-safe mode is on.' : `&ldquo;${esc(t.description)}&rdquo;`}</p>
      <dl>
        <dt>Where</dt><dd>${esc(t.where)}</dd>
        <dt>When</dt><dd>${esc(t.when)}</dd>
        <dt>Window</dt><dd>${esc(MISS_NOTE[t.missable])}</dd>
      </dl>
      <div class="actions">
        <button class="btn small" type="button" data-goto="${t.id}">Open guide</button>
        <button class="btn small ${isEarned(t) ? '' : 'primary'}" type="button" data-toggle-earned="${t.id}">${isEarned(t) ? '&#10003; Earned' : 'Mark earned'}</button>
      </div>
      <p class="adv"><b>Our advice</b>${esc(t.advice)}</p>

    </article>`).join('');

  el('view-missables').innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Read before the final mission</p>
      <h2>What can slip past you</h2>
      <p>Critically, this is not a list of things the game will lock. The official descriptions do not mark any trophy as permanently missable, and they name no point of no return. What they do give is a set of conditions that only hold during one attempt, plus a set of trophies tied to a place or a moment with no chapter attached. Those are the ones worth doing early.</p>
    </div>
    <div class="legend">
      <div class="panel"><p class="panel-label">Attempt only</p><p>Fails inside a run, retryable. Six trophies ask for a clean condition - undetected, a four-star escape, a three-shop chain, one Combat Focus, a retry, a melee hit.</p></div>
      <div class="panel"><p class="panel-label">Timing unpinned</p><p>Thirteen descriptions name a place, a target or a joke but no chapter. The guide says so instead of inventing a mission or a map square.</p></div>
      <div class="panel"><p class="panel-label">Not flagged</p><p>Story chapters, story missions and repeatable activities. Finish the story and they arrive; nothing in the official text suggests a locked door.</p></div>
    </div>
    ${groups.map((g) => `
      <h3 class="section-title" style="margin-top:18px">${esc(g.title)} <span class="tabcount">${state.trophies.filter((t) => t.missable === g.key).length}</span></h3>
      <p class="section-sub">${esc(g.blurb)}</p>
      <div class="miss-grid">${cards(g.key)}</div>`).join('')}`;
}

/* ---------------- progress ---------------- */
function renderProgress() {
  const total = state.trophies.length;
  const earned = state.trophies.filter(isEarned).length;
  const pct = Math.round((earned / total) * 100);
  const tracked = state.trophies.filter((t) => t.target > 1);
  const counters = tracked.map((t) => {
    const c = countOf(t);
    const p = Math.min(100, Math.round((c / t.target) * 100));
    return `<div class="ctile${isEarned(t) ? ' is-earned' : ''}">
      <div class="ctile-top"><span class="cn">${esc(t.name)}</span><span class="cv">${fmt(c)}/${fmt(t.target)}</span></div>
      <div class="bar"><span style="width:${p}%"></span></div>
      <div class="row">
        <button type="button" data-count="${t.id}" data-delta="-1" aria-label="Decrease ${esc(t.name)}">&#8722;</button>
        <input type="number" min="0" max="${t.target}" value="${c}" data-count-input="${t.id}" aria-label="${esc(t.name)} progress">
        <span class="u">${esc(t.unit)}</span>
        <button type="button" data-count="${t.id}" data-delta="1" aria-label="Increase ${esc(t.name)}">+</button>
        <button class="btn small quiet max" type="button" data-goto="${t.id}">Guide</button>
      </div>
    </div>`;
  }).join('');

  const byGrade = GRADES.map((g) => {
    const all = state.trophies.filter((t) => t.grade === g);
    const got = all.filter(isEarned).length;
    return `<div class="statcard"><div class="v">${got}<span style="font-size:15px;color:var(--muted)">/${all.length}</span></div><div class="l">${GRADE_LABEL[g]}</div><div class="sub">${all.length ? Math.round((got / all.length) * 100) : 0}% of grade</div></div>`;
  }).join('');

  el('view-progress').innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Your save, mirrored</p>
      <h2>Progress and data</h2>
      <p>Everything is stored in this browser, offline: ticks, part-way counters and the spoiler setting. Export a JSON file to move the save to another machine, or import one to restore it.</p>
    </div>
    <div class="statgrid">
      <div class="statcard"><div class="v">${earned}<span style="font-size:15px;color:var(--muted)">/${total}</span></div><div class="l">Trophies earned</div><div class="sub">${pct}% of the official list</div></div>
      ${byGrade}
    </div>
    <div class="two-col">
      <section>
        <h3 class="section-title">Part-way counters</h3>
        <p class="section-sub">${tracked.length} trophies have a number in their official description. Nudging a counter to its target marks the trophy earned; marking the trophy earned fills its counter.</p>
        <div class="counterlist">${counters}</div>
      </section>
      <aside style="display:grid;gap:12px">
        <div class="datacard">
          <h3>Save data</h3>
          <p>Plain JSON: trophy names and counter values. Nothing leaves this device unless you export it.</p>
          <div class="datarow">
            <button class="btn primary" type="button" data-action="export">Export progress</button>
            <label class="btn"><span>Import progress</span><input type="file" accept="application/json,.json" data-action="import" hidden></label>
            <button class="btn" type="button" data-action="reset">Reset save</button>
          </div>
        </div>
        <div class="datacard">
          <h3>Sources and method</h3>
          <ul class="sourcelist">
            <li><strong>Official list</strong>Exophase: each trophy's name, description and grade. Nothing here renames or regrades them.</li>
            <li><strong>PSN targets</strong>PSNProfiles: used only where PSN tracks a counter the description does not spell out, as on Actions Speak Louder (500 choices).</li>
            <li><strong>Guidance</strong>Mission order, locations and methods come from launch-week guides. Where something is still unconfirmed, the advice says so.</li>
            <li><strong>No artwork</strong>No Rockstar logo, no official artwork, no external fonts or files. The page runs offline from its own folder.</li>
          </ul>
        </div>
        <div class="datacard">
          <h3>Keyboard</h3>
          <div class="kbdlist">
            <div><kbd>/</kbd> search</div><div><kbd>j</kbd> <kbd>k</kbd> browse</div>
            <div><kbd>e</kbd> mark earned</div><div><kbd>s</kbd> spoiler-safe</div>
            <div><kbd>1</kbd>-<kbd>4</kbd> sections</div><div><kbd>Esc</kbd> clear search</div>
          </div>
        </div>
      </aside>
    </div>`;
}

/* ---------------- actions ---------------- */
function toast(msg) {
  const node = el('toast');
  node.textContent = msg;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, 2600);
}

function toggleEarned(id) {
  const t = state.byId.get(Number(id));
  if (!t) return;
  if (isEarned(t)) {
    state.earned.delete(t.name);
    state.counters[t.id] = 0;
    toast(`${t.name} marked unearned`);
  } else {
    state.earned.add(t.name);
    state.counters[t.id] = t.target;
    toast(`${t.name} earned - ${state.earned.size} of ${state.trophies.length}`);
  }
  save();
  renderAll();
}

function setCount(id, n) {
  const t = state.byId.get(Number(id));
  if (!t) return;
  const clamped = Math.max(0, Math.min(t.target, Math.round(Number(n) || 0)));
  state.counters[t.id] = clamped;
  if (clamped >= t.target) state.earned.add(t.name);
  else state.earned.delete(t.name);
  save();
  renderAll();
}

function selectTrophy(id) {
  state.selected = Number(id);
  if (state.tab !== 'checklist') setTab('checklist', false);
  location.hash = `#/trophy/${state.selected}`;
  renderList();
  renderDetail();
  const row = el('trophylist').querySelector(`[data-id="${state.selected}"]`);
  if (row) row.scrollIntoView({ block: 'nearest' });
}

function setTab(tab, push = true) {
  state.tab = tab;
  for (const key of ['checklist', 'roadmap', 'missables', 'progress']) {
    const btn = el(`tab-${key}`);
    const view = el(`view-${key}`);
    const on = key === tab;
    btn.setAttribute('aria-selected', String(on));
    view.hidden = !on;
  }
  if (push) location.hash = `#/${tab}`;
  if (tab === 'roadmap') renderRoadmap();
  if (tab === 'missables') renderMissables();
  if (tab === 'progress') renderProgress();
}

function exportSave() {
  const payload = {
    format: 'platinum-leonida/v1',
    game: state.doc.game,
    platform: state.doc.platform,
    exportedAt: new Date().toISOString(),
    earned: state.trophies.filter(isEarned).map((t) => t.name),
    counters: Object.fromEntries(Object.entries(state.counters).filter(([id, n]) => n > 0 && state.byId.has(Number(id)))),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'platinum-leonida-progress.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${payload.earned.length} earned trophies`);
}

async function importSave(file) {
  try {
    const raw = JSON.parse(await file.text());
    const names = Array.isArray(raw) ? raw : Array.isArray(raw.earned) ? raw.earned : null;
    if (!names) throw new Error('No earned list found');
    const earned = new Set();
    for (const n of names) {
      const t = state.trophies.find((x) => x.name === n);
      if (t) earned.add(t.name);
    }
    // Start from the imported state, not on top of the old one: earned trophies
    // keep a full counter, and a saved counter only lands on a trophy it fits.
    state.counters = {};
    for (const t of state.trophies) if (earned.has(t.name)) state.counters[t.id] = t.target;
    if (raw && typeof raw.counters === 'object' && raw.counters) {
      for (const [id, n] of Object.entries(raw.counters)) {
        const t = state.byId.get(Number(id));
        if (t && Number.isFinite(Number(n))) state.counters[t.id] = Math.max(0, Math.min(t.target, Math.round(Number(n))));
      }
    }
    state.earned = earned;
    save();
    renderAll();
    toast(`Imported ${earned.size} earned trophies`);
  } catch {
    toast('That file is not a Platinum Leonida save');
  }
}

function resetSave() {
  state.earned = new Set();
  state.counters = {};
  state.revealed = new Set();
  state.selected = state.trophies[0]?.id ?? null;
  save();
  renderAll();
  toast('Save reset');
}

/* ---------------- events ---------------- */
function bind() {
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  el('grade-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (!b) return;
    state.filters.grade = b.dataset.value;
    renderFilters(); renderList(); renderDetail();
  });
  el('kind-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (!b) return;
    state.filters.kind = b.dataset.value;
    renderFilters(); renderList(); renderDetail();
  });
  el('status-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (!b) return;
    if (b.dataset.group === 'missable') state.filters.missable = !state.filters.missable;
    else state.filters.status = b.dataset.value;
    renderFilters(); renderList(); renderDetail();
  });
  el('clear-filters').addEventListener('click', () => {
    state.filters = { q: '', grade: 'all', kind: 'all', status: 'all', missable: false };
    renderFilters(); renderList(); renderDetail();
  });
  el('empty-reset').addEventListener('click', () => el('clear-filters').click());

  el('search').addEventListener('input', (e) => {
    state.filters.q = e.target.value;
    el('clear-search').hidden = !state.filters.q;
    if (state.tab !== 'checklist') setTab('checklist', false);
    renderList(); renderDetail();
  });
  el('clear-search').addEventListener('click', () => {
    state.filters.q = '';
    el('search').value = '';
    el('clear-search').hidden = true;
    renderList(); renderDetail(); el('search').focus();
  });

  el('spoiler').addEventListener('change', (e) => {
    state.spoiler = e.target.checked;
    state.revealed.clear();
    save(); renderAll();
    toast(state.spoiler ? 'Spoiler-safe mode on' : 'Spoiler-safe mode off');
  });

  el('trophylist').addEventListener('click', (e) => {
    const check = e.target.closest('[data-check]');
    if (check) { e.stopPropagation(); toggleEarned(check.dataset.check); return; }
    const row = e.target.closest('[data-id]');
    if (row) selectTrophy(row.dataset.id);
  });

  el('detail').addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle-earned]');
    if (t) { toggleEarned(t.dataset.toggleEarned); return; }
    const rev = e.target.closest('[data-reveal]');
    if (rev) { state.revealed.add(Number(rev.dataset.reveal)); renderList(); renderDetail(); return; }
    const go = e.target.closest('[data-goto]');
    if (go && go.dataset.goto) { selectTrophy(go.dataset.goto); return; }
    const c = e.target.closest('[data-count]');
    if (c) {
      const id = Number(c.dataset.count);
      setCount(id, countOf(state.byId.get(id)) + Number(c.dataset.delta));
    }
  });

  el('detail').addEventListener('change', (e) => {
    const input = e.target.closest('[data-count-input]');
    if (input) setCount(input.dataset.countInput, input.value);
  });

  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-earned]');
    if (toggle && !el('detail').contains(toggle)) { toggleEarned(toggle.dataset.toggleEarned); return; }
    const go = e.target.closest('[data-goto]');
    if (go && go.dataset.goto && !el('detail').contains(go)) { selectTrophy(go.dataset.goto); return; }
    const count = e.target.closest('[data-count]');
    if (count && !el('detail').contains(count)) { setCount(count.dataset.count, countOf(state.byId.get(Number(count.dataset.count))) + Number(count.dataset.delta)); return; }
    const action = e.target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'export') exportSave();
      if (action.dataset.action === 'reset') resetSave();
    }
  });

  document.addEventListener('change', (e) => {
    const input = e.target.closest('[data-action="import"]');
    if (input && input.files && input.files[0]) { importSave(input.files[0]); input.value = ''; }
    const num = e.target.closest('[data-count-input]');
    if (num && !el('detail').contains(num)) setCount(num.dataset.countInput, num.value);
  });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === '/' && !typing) { e.preventDefault(); el('search').focus(); el('search').select(); return; }
    if (e.key === 'Escape' && typing) { e.target.blur(); return; }
    if (typing) return;
    if (e.key === 's' || e.key === 'S') { el('spoiler').click(); return; }
    if (['1', '2', '3', '4'].includes(e.key)) { setTab(['checklist', 'roadmap', 'missables', 'progress'][Number(e.key) - 1]); return; }
    if (e.key === 'e' || e.key === 'E') { if (state.selected != null) toggleEarned(state.selected); return; }
    if (e.key === 'j' || e.key === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = visible();
      if (!rows.length) return;
      const i = rows.findIndex((t) => t.id === state.selected);
      const step = e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1;
      const next = rows[Math.max(0, Math.min(rows.length - 1, (i === -1 ? 0 : i) + step))];
      if (next) selectTrophy(next.id);
    }
  });

  window.addEventListener('hashchange', route);
}

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  if (!h) { setTab('checklist', false); return; }
  if (h.startsWith('trophy/')) {
    const id = Number(h.slice(7));
    if (state.byId.has(id)) { state.selected = id; setTab('checklist', false); renderList(); renderDetail(); }
    return;
  }
  if (['checklist', 'roadmap', 'missables', 'progress'].includes(h)) setTab(h, false);
}

/* ---------------- boot ---------------- */
async function boot() {
  const res = await fetch('data/trophies.json');
  const doc = await res.json();
  state.doc = doc;
  state.trophies = doc.trophies;
  state.byId = new Map(doc.trophies.map((t) => [t.id, t]));
  load();
  applyParams();
  bind();
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('trophy/')) {
    const id = Number(h.slice(7));
    state.selected = state.byId.has(id) ? id : null;
    setTab('checklist', false);
  } else if (['roadmap', 'missables', 'progress'].includes(h)) {
    setTab(h, false);
  } else {
    setTab('checklist', false);
  }
  renderAll();
  route();
  const chosen = el('trophylist').querySelector(`[data-id="${state.selected}"]`);
  if (chosen) {
    const rowBox = chosen.getBoundingClientRect();
    const listBox = el('trophylist').getBoundingClientRect();
    el('trophylist').scrollTop += rowBox.top - listBox.top - 1;
  }

  // A read-only view helper for screenshots and deep links: ?focus=sources opens a
  // trophy's citations without scrolling by hand.
  if (new URLSearchParams(location.search).get('focus') === 'sources') {
    const pane = el('detail');
    const box = pane.querySelector('.sources');
    if (box) pane.scrollTop = Math.max(0, box.offsetTop - 70);
  }
}

boot().catch((err) => {
  el('detail').innerHTML = `<div class="locked"><h3>The guide could not load</h3><p>${esc(err.message)}</p><p>Open the page from the guide's own folder (node serve.ts) so data/trophies.json can load.</p></div>`;
});
