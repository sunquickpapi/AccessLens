// AccessLens staff & admin website.
// Plain JavaScript, no build step: the AccessLens server serves this folder at /staff.

// ------------------------------------------------------------------ constants
const CAT = { obstruction: 'Obstruction', surface: 'Surface damage', steps: 'Steps' };
const CAT_KEYS = Object.keys(CAT);
const STATUS = {
  new: 'New',
  verified: 'Verified',
  assigned: 'Work assigned',
  awaiting_confirmation: 'Awaiting confirmation',
  confirmed: 'Resolved',
  closed: 'Closed',
};
const SEVERITY = { blocked: 'Blocks the journey', difficult: 'Makes it difficult', minor: 'Minor inconvenience' };
const AFFECTED = { wheelchair: 'Wheelchair users', older: 'Older residents', walking_aid: 'People using walking aids', stroller: 'Parents with strollers' };
const IMPACTS = {
  cannot_pass: "Couldn't get past at all",
  road: 'Had to go onto the road',
  turn_back: 'Had to turn back',
  longer_route: 'Took a longer route',
  needed_help: 'Needed someone to help',
  risk_fall: 'Risk of tripping or falling',
};
const POLL_MS = 15000;

const LOGO = (size = 40) => `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
  <rect width="100" height="100" rx="24" fill="#D62828"/>
  <circle cx="45" cy="45" r="24" fill="none" stroke="#FFF3E0" stroke-width="7"/>
  <line x1="62.5" y1="62.5" x2="77" y2="77" stroke="#FFF3E0" stroke-width="8" stroke-linecap="round"/>
  <path d="M31 53 H39 L51 41 H59" fill="none" stroke="#FFF3E0" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ------------------------------------------------------------------ state
const S = { token: null, user: null, teams: [], people: [], knownIds: null, pollTimer: null, maps: [] };
try {
  S.token = localStorage.getItem('al_token');
  S.user = JSON.parse(localStorage.getItem('al_user') || 'null');
} catch {
  // storage unavailable — stay logged out
}

const $app = document.getElementById('app');

// ------------------------------------------------------------------ helpers
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
function hours(h) {
  if (h == null) return '—';
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} days`;
}
const statusPill = (r) =>
  `<span class="pill ${r.status}">${esc(r.rejected ? 'Rejected' : STATUS[r.status])}</span>${r.overdue ? ' <span class="pill overdue">Overdue</span>' : ''}`;
const catLabel = (c) => (c ? `<span class="cat-dot cat-${c}"></span>${esc(CAT[c] ?? c)}` : '—');
const list = (keys, map) => (keys?.length ? keys.map((k) => esc(map[k] ?? k)).join(', ') : '—');
const isAdmin = () => S.user?.role === 'admin';

function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = `toast${err ? ' err' : ''}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function api(path, { method = 'GET', json, form } = {}) {
  const headers = {};
  if (S.token) headers.Authorization = `Bearer ${S.token}`;
  let bodyData;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyData = JSON.stringify(json);
  } else if (form) {
    bodyData = form;
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: bodyData });
  } catch {
    throw new Error('Can’t reach the AccessLens server. Is “npm run ai” still running?');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/auth/login') {
    logout(false);
    throw new Error(data.error || 'Please log in again.');
  }
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data;
}

function setSession(token, user) {
  S.token = token;
  S.user = user;
  try {
    if (token) {
      localStorage.setItem('al_token', token);
      localStorage.setItem('al_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('al_token');
      localStorage.removeItem('al_user');
    }
  } catch {
    // ignore
  }
}

function logout(callServer = true) {
  if (callServer && S.token) api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  setSession(null, null);
  clearInterval(S.pollTimer);
  S.pollTimer = null;
  S.knownIds = null;
  location.hash = '#/login';
  render();
}

function clearMaps() {
  S.maps.forEach((m) => m.remove?.());
  S.maps = [];
}

// ------------------------------------------------------------------ map
const CENTER = [3.0738, 101.5183];

function renderMap(el, points, { zoom = 16, onPick, center } = {}) {
  if (!el) return;
  const valid = points.filter((p) => p.lat != null && p.lng != null);
  if (window.L) {
    const map = L.map(el, { scrollWheelZoom: false }).setView(center || (valid[0] ? [valid[0].lat, valid[0].lng] : CENTER), zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    const icon = (p) =>
      L.divIcon({ className: '', html: `<div class="pin ${p.category}${p.done ? ' done' : ''}"></div>`, iconSize: [22, 22], iconAnchor: [11, 22] });
    const bounds = [];
    valid.forEach((p) => {
      const m = L.marker([p.lat, p.lng], { icon: icon(p), title: p.title, keyboard: true }).addTo(map);
      if (p.popup) m.bindPopup(p.popup);
      if (onPick) m.on('click', () => onPick(p));
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length > 1 && !center) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    S.maps.push(map);
    setTimeout(() => map.invalidateSize(), 50);
    return map;
  }
  // Offline fallback: a schematic map with the same pins.
  const lats = valid.map((p) => p.lat);
  const lngs = valid.map((p) => p.lng);
  const [minLat, maxLat] = [Math.min(...lats, CENTER[0] - 0.002), Math.max(...lats, CENTER[0] + 0.002)];
  const [minLng, maxLng] = [Math.min(...lngs, CENTER[1] - 0.002), Math.max(...lngs, CENTER[1] + 0.002)];
  el.innerHTML = `<div class="fallback-map">
    <div class="road" style="top:42%;left:0;right:0;height:16px"></div>
    <div class="road" style="left:58%;top:0;bottom:0;width:16px"></div>
    ${valid
      .map((p, i) => {
        const x = 8 + ((p.lng - minLng) / (maxLng - minLng || 1)) * 84;
        const y = 8 + (1 - (p.lat - minLat) / (maxLat - minLat || 1)) * 84;
        return `<button class="fpin" data-i="${i}" style="left:${x}%;top:${y}%;background:none;border:none" title="${esc(p.title)}"><div class="pin ${p.category}${p.done ? ' done' : ''}"></div></button>`;
      })
      .join('')}
    <span class="pill" style="position:absolute;right:10px;bottom:10px">Offline map</span></div>`;
  el.querySelectorAll('.fpin').forEach((b) => b.addEventListener('click', () => onPick?.(valid[+b.dataset.i])));
}

const legend = `<div class="map-legend">${CAT_KEYS.map((c) => `<span>${catLabel(c)}</span>`).join('')}<span class="muted">Faded pins are resolved</span></div>`;

// ------------------------------------------------------------------ layout
function nav(active) {
  const item = (href, label, key, extra = '') =>
    `<a href="${href}" class="${active === key ? 'on' : ''}" ${active === key ? 'aria-current="page"' : ''}>${label}${extra}</a>`;
  return `<aside class="side">
    <div class="side-top"><a class="brand" href="#/dashboard">${LOGO(42)}<span><b>AccessLens</b><small>${isAdmin() ? 'Admin console' : 'Staff console'}</small></span></a>
      <button class="menu-btn" id="menuBtn" aria-expanded="false" aria-controls="sideMenu"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Menu</span></button></div>
    <div class="side-menu" id="sideMenu">
    <nav class="nav" aria-label="Main">
      ${item('#/dashboard', 'Dashboard', 'dashboard')}
      ${item('#/reports', 'Reports', 'reports', '<span class="count" id="newCount" hidden></span>')}
      ${item('#/my', 'My team’s work', 'my')}
      ${item('#/insights', 'Recurring issues & evaluation', 'insights')}
      ${
        isAdmin()
          ? `<div class="label muted group">Admin</div>
             ${item('#/admin/users', 'Staff accounts', 'users')}
             ${item('#/admin/teams', 'Maintenance teams', 'teams')}
             ${item('#/admin/residents', 'Residents', 'residents')}
             ${item('#/admin/activity', 'Activity log', 'activity')}`
          : ''
      }
    </nav>
    <div class="who">
      <span class="pill ${S.user.role} role-pill">${S.user.role === 'admin' ? 'Admin' : 'Staff'}</span>
      <div><b>${esc(S.user.name)}</b><div class="small muted">${esc(S.user.role === 'staff' && S.user.staffId ? `Staff ID ${S.user.staffId}` : S.user.email)}</div>${S.user.team ? `<div class="small">${esc(S.user.team)}</div>` : ''}</div>
      <button class="btn outline small" id="logout">Log out</button>
    </div>
    </div>
  </aside>`;
}

function shell(active, content) {
  $app.innerHTML = `<div class="shell">${nav(active)}<main id="main" tabindex="-1">${content}</main></div>`;
  document.getElementById('logout').addEventListener('click', () => logout());
  // phone: the sidebar folds into a "Menu" button
  const side = document.querySelector('.side');
  const menuBtn = document.getElementById('menuBtn');
  const setMenu = (open) => {
    side.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(!side.classList.contains('open'));
  });
  document.getElementById('sideMenu').addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenu(false);
  });
  if (!window.__menuOutside) {
    window.__menuOutside = true;
    document.addEventListener('click', (e) => {
      const sd = document.querySelector('.side.open');
      if (sd && !e.target.closest('#sideMenu') && !e.target.closest('#menuBtn')) {
        sd.classList.remove('open');
        document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelector('.side.open')?.classList.remove('open');
    });
  }
  updateNewCount();
}

// Phone layout: tables turn into stacked cards, so every cell needs its column name.
function labelTables(root = document) {
  root.querySelectorAll('table:not(.mini):not(.prio-table)').forEach((t) => {
    const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!heads.length) return;
    t.classList.add('cards');
    t.querySelectorAll('tbody tr').forEach((tr) =>
      [...tr.children].forEach((td, i) => {
        if (!td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i] ?? '');
      })
    );
  });
}
let labelQueued = false;
new MutationObserver(() => {
  if (labelQueued) return;
  labelQueued = true;
  requestAnimationFrame(() => {
    labelQueued = false;
    labelTables();
  });
}).observe(document.body, { childList: true, subtree: true });

function loading(active, title) {
  shell(active, `<div class="page-head"><h1 class="display">${esc(title)}</h1></div><p class="muted">Loading…</p>`);
}

// ------------------------------------------------------------------ polling for new reports from the app
async function poll() {
  if (!S.token) return;
  try {
    const { reports } = await api('/api/staff/reports?status=new');
    const ids = new Set(reports.map((r) => r.id));
    if (S.knownIds) {
      const fresh = reports.filter((r) => !S.knownIds.has(r.id));
      fresh.forEach((r) => toast(`New report ${r.code}: ${CAT[r.category]} at ${r.address ?? 'a pinned location'}`));
      if (fresh.length && ['dashboard', 'reports'].includes(currentRoute().name)) render();
    }
    S.knownIds = ids;
    S.newCount = ids.size;
    updateNewCount();
  } catch {
    // ignore — the next poll will try again
  }
}

function updateNewCount() {
  const el = document.getElementById('newCount');
  if (!el) return;
  el.hidden = !S.newCount;
  el.textContent = S.newCount ?? '';
}

async function loadRefs() {
  const [t, p] = await Promise.all([api('/api/staff/teams'), api('/api/staff/people')]);
  S.teams = t.teams;
  S.people = p.people;
}

function suggestedTeam(category) {
  return S.teams.find((t) => t.categories.includes(category))?.name ?? S.teams[0]?.name ?? '';
}

// ------------------------------------------------------------------ views: login
function viewLogin() {
  clearInterval(S.pollTimer);
  let role = 'admin';
  $app.innerHTML = `<div class="login">
    <section class="poster">
      <a class="brand" href="#/login" style="color:inherit">${LOGO(52).replace('#D62828', '#1E1614')}<span><b>AccessLens</b><small style="color:var(--cream)">Township management</small></span></a>
      <div>
        <h1>Clear the way,<br/>together.</h1>
        <p style="font-size:17px;max-width:460px">Residents report walkway barriers from the app. You verify them, send the right team and confirm the fix.</p>
      </div>
      <ol>
        <li><b>02</b> Review reports and AI suggestions on a map</li>
        <li><b>04</b> Confirm the issue and the responsible team</li>
        <li><b>06</b> Assign inspection or repair work</li>
        <li><b>08</b> Review completion evidence and recurring issues</li>
      </ol>
    </section>
    <section class="panel">
      <form id="loginForm" novalidate>
        <h2 class="display" style="font-size:30px">Log in</h2>
        <div class="tabs" role="tablist" aria-label="Account type">
          <button type="button" role="tab" aria-selected="true" data-role="admin">Admin<small>Township manager</small></button>
          <button type="button" role="tab" aria-selected="false" data-role="staff">Staff<small>Maintenance & officers</small></button>
        </div>
        <label class="field"><span id="emailLabel">Admin email</span>
          <input type="email" name="ident" id="ident" autocomplete="username" required placeholder="admin@accesslens.my" /></label>
        <p class="small muted" id="identHint" style="margin:-6px 0 0">Admins log in with their email address.</p>
        <label class="field"><span>Password</span>
          <input type="password" name="password" autocomplete="current-password" required /></label>
        <p class="error" id="loginError" role="alert"></p>
        <button class="btn block" type="submit">Log in as <span id="roleWord">admin</span></button>
        <div class="notice demo"><b>Demo accounts</b> (change them in Staff accounts)<br/>
          Admin email: <code>admin@accesslens.my</code> / <code>admin123</code><br/>
          Staff ID: <code>S1001</code> (Aina, Civil Maintenance) / <code>staff123</code><br/>
          Staff ID: <code>S1002</code> (Farid, Enforcement) / <code>staff123</code></div>
      </form>
    </section>
  </div>`;
  const form = document.getElementById('loginForm');
  form.querySelectorAll('[role=tab]').forEach((b) =>
    b.addEventListener('click', () => {
      role = b.dataset.role;
      form.querySelectorAll('[role=tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      const ident = form.ident;
      document.getElementById('emailLabel').textContent = role === 'admin' ? 'Admin email' : 'Staff ID';
      document.getElementById('identHint').textContent =
        role === 'admin' ? 'Admins log in with their email address.' : 'Staff log in with the staff ID from their admin, e.g. S1001.';
      ident.type = role === 'admin' ? 'email' : 'text';
      ident.placeholder = role === 'admin' ? 'admin@accesslens.my' : 'S1001';
      ident.autocapitalize = role === 'admin' ? 'off' : 'characters';
      ident.value = '';
      ident.focus();
      document.getElementById('roleWord').textContent = role;
      document.getElementById('loginError').textContent = '';
    })
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    if (!form.ident.value || !form.password.value) {
      errEl.textContent = role === 'admin' ? 'Enter your email and password.' : 'Enter your staff ID and password.';
      return;
    }
    try {
      const { token, user } = await api('/api/auth/login', {
        method: 'POST',
        json:
          role === 'admin'
            ? { role, email: form.ident.value.trim(), password: form.password.value }
            : { role, staffId: form.ident.value.trim(), password: form.password.value },
      });
      setSession(token, user);
      location.hash = '#/dashboard';
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}

// ------------------------------------------------------------------ views: dashboard
async function viewDashboard() {
  loading('dashboard', 'Dashboard');
  const [{ reports }, stats, ov] = await Promise.all([api('/api/staff/reports'), api('/api/staff/stats'), api('/api/staff/overview')]);
  const open = reports.filter((r) => !['confirmed', 'closed'].includes(r.status));
  const queue = [...open].sort((a, b) => {
    const order = { new: 0, awaiting_confirmation: 1, verified: 2, assigned: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9) || (b.createdAt > a.createdAt ? 1 : -1);
  });
  const k = stats.byStatus;
  const kpi = (key, label, n, hot) =>
    `<a class="kpi ${hot && n ? 'hot' : ''}" href="#/reports?status=${key}"><div class="num">${n}</div><div class="label">${label}</div></a>`;
  shell(
    'dashboard',
    `<div class="page-head"><div><h1 class="display">Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${esc(S.user.name.split(' ')[0])}</h1>
      <p class="muted">${open.length} open report${open.length === 1 ? '' : 's'} · ${stats.overdue} overdue · updated ${new Date().toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })}</p></div>
      <div class="row"><a class="btn outline" href="/api/staff/export.csv" id="exportBtn">Export CSV</a><a class="btn" href="#/reports?status=new">Review new reports</a></div></div>
    <div class="kpis">
      ${kpi('new', 'New · to verify', k.new, true)}
      ${kpi('verified', 'Verified · to assign', k.verified)}
      ${kpi('assigned', 'Work in progress', k.assigned)}
      ${kpi('awaiting_confirmation', 'Check completion', k.awaiting_confirmation, true)}
      ${kpi('confirmed', 'Resolved', k.confirmed)}
      ${kpi('open', 'Overdue', stats.overdue, true)}
    </div>
    <div class="grid two">
      <section class="card"><div class="row spread"><h2 class="display">Reports map</h2><span class="small muted">${reports.filter((r) => r.lat).length} pins</span></div><div class="rule"></div>
        <div class="map" id="map" role="region" aria-label="Map of reports"></div>${legend}</section>
      <section class="card"><div class="row spread"><h2 class="display">Needs action</h2><a class="small" href="#/reports?status=open">All open →</a></div><div class="rule"></div>
        ${queue.length ? `<div class="stack">${queue.slice(0, 6).map(queueItem).join('')}</div>` : '<p class="empty">Nothing waiting. Nice work.</p>'}</section>
    </div>
    ${insightsRow(ov)}`
  );
  document.getElementById('exportBtn').addEventListener('click', downloadCsv);
  renderMap(
    document.getElementById('map'),
    reports.map((r) => ({
      ...r,
      done: ['confirmed', 'closed'].includes(r.status),
      title: `${r.code} ${CAT[r.category]}`,
      popup: `<b>${esc(r.code)}</b> · ${esc(CAT[r.category])}<br/>${esc(r.address ?? '')}<div class="popup-pills">${statusPill(r)}${prioPill(r.priority)}</div>${
        r.priority ? `<div class="popup-why">${r.priority.score} pts · ${esc(r.priority.reasons.map((x) => x.text).join(', '))}</div>` : ''
      }<a href="#/report/${r.id}">Open report →</a>`,
    }))
  );
  document.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => (location.hash = `#/report/${el.dataset.open}`)));
}

// Dashboard: busiest areas, barrier types, performance so far.
function insightsRow(ov) {
  const maxArea = Math.max(1, ...ov.areas.map((a) => a.total));
  const totalTypes = Math.max(1, CAT_KEYS.reduce((n, c) => n + ov.types[c].total, 0));
  const p = ov.performance;
  const stat = (num, label, note = '') => `<div class="perf"><span class="num">${num}</span><span class="label">${label}</span>${note ? `<span class="small muted">${note}</span>` : ''}</div>`;
  return `<div class="grid three dash-insights">
    <section class="card"><div class="row spread"><h2 class="display">Busiest areas</h2><span class="small muted">most reports</span></div><div class="rule"></div>
      ${
        ov.areas.length
          ? `<ol class="areas">${ov.areas
              .map(
                (a, i) => `<li><a href="#/reports?q=${encodeURIComponent(a.area)}" class="${i === 0 ? 'top' : ''}">
              <span class="rank">${i + 1}</span>
              <span class="what"><b>${esc(a.area)}</b><span class="small muted">mostly ${esc(CAT[a.top].toLowerCase())} · ${a.open} open${a.high ? ` · <b class="red">${a.high} high priority</b>` : ''}</span>
                <span class="track"><span class="fill" style="width:${Math.round((a.total / maxArea) * 100)}%"></span></span></span>
              <span class="count">${a.total}</span></a></li>`
              )
              .join('')}</ol>`
          : '<p class="empty">No reports yet.</p>'
      }</section>
    <section class="card"><div class="row spread"><h2 class="display">Barrier types</h2><span class="small muted">all reports</span></div><div class="rule"></div>
      ${ov.mostCommon ? `<div class="headline"><span class="cat-dot cat-${ov.mostCommon}"></span><span><b>${esc(CAT[ov.mostCommon])}</b> is the most common barrier · ${pct(ov.types[ov.mostCommon].total / totalTypes)} of reports</span></div>` : ''}
      <div class="bars">${CAT_KEYS.map(
        (c) => `<div class="bar"><span>${catLabel(c)}</span><span class="track"><span class="fill" style="display:block;width:${Math.round((ov.types[c].total / totalTypes) * 100)}%"></span></span><span style="text-align:right">${ov.types[c].total}</span></div>`
      ).join('')}</div>
      <table class="mini"><thead><tr><th></th><th>Open</th><th>Last 30 days</th></tr></thead><tbody>${CAT_KEYS.map(
        (c) => `<tr><td>${esc(CAT[c])}</td><td>${ov.types[c].open}</td><td>${ov.types[c].last30}</td></tr>`
      ).join('')}</tbody></table></section>
    <section class="card"><div class="row spread"><h2 class="display">Performance so far</h2><a class="small" href="#/insights">Details →</a></div><div class="rule"></div>
      <div class="perf-grid">
        ${stat(`${p.resolved}/${p.total}`, 'Resolved', `${pct(p.resolutionRate)} of all reports`)}
        ${stat(hours(p.medianResolveHours), 'Median time to fix', 'report → confirmed')}
        ${stat(hours(p.medianVerifyHours), 'Median time to verify', 'report → staff check')}
        ${stat(pct(p.onTimeRate), 'Fixed by target date', p.withDue ? `${p.onTime} of ${p.withDue} jobs` : 'no target dates yet')}
        ${stat(pct(p.satisfaction), 'Residents say fixed', `${p.feedbackCount} answer${p.feedbackCount === 1 ? '' : 's'}`)}
        ${stat(pct(p.aiAccuracy), 'AI agrees with staff', `${p.aiChecked} checked`)}
      </div>
      <p class="small muted" style="margin:10px 0 0">Last 30 days: <b>${p.reported30}</b> reported · <b>${p.resolved30}</b> resolved.</p></section>
  </div>`;
}

function queueItem(r) {
  const next = {
    new: 'Verify the issue and team',
    verified: 'Assign inspection or repair',
    assigned: r.overdue ? 'Overdue — chase the team' : `With ${r.team}`,
    awaiting_confirmation: 'Review completion photo',
  }[r.status];
  return `<button class="card" data-open="${r.id}" style="text-align:left;cursor:pointer;display:grid;grid-template-columns:72px 1fr;gap:12px;align-items:center;padding:10px">
    <img src="${esc(r.photo)}" alt="" style="width:72px;height:54px;object-fit:cover;border-radius:10px;border:2px solid var(--ink)"/>
    <span><span class="row spread" style="gap:6px"><span class="label muted">${esc(r.code)} · ${ago(r.createdAt)}</span><span>${statusPill(r)}</span></span>
      <b>${catLabel(r.category)}</b> <span class="small muted">${esc(r.address ?? '')}</span><br/>
      <span class="small"><b>Next:</b> ${esc(next)}</span></span></button>`;
}

async function downloadCsv(e) {
  e.preventDefault();
  try {
    const res = await fetch('/api/staff/export.csv', { headers: { Authorization: `Bearer ${S.token}` } });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `accesslens-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (err) {
    toast(err.message, true);
  }
}

// How many filters differ from the defaults (shown on the phone's Filter button).
function activeFilters(f) {
  return (f.q ? 1 : 0) + (!['all', 'open'].includes(f.status) ? 1 : 0) + (f.category !== 'all' ? 1 : 0) + (f.team !== 'all' ? 1 : 0);
}

// ------------------------------------------------------------------ views: report list
async function viewReports(params, mine = false) {
  const key = mine ? 'my' : 'reports';
  loading(key, mine ? 'My team’s work' : 'Reports');
  const f = {
    status: params.get('status') || (mine ? 'open' : 'all'),
    category: params.get('category') || 'all',
    team: params.get('team') || 'all',
    q: params.get('q') || '',
  };
  const qs = new URLSearchParams({ ...f, ...(mine ? { mine: '1' } : {}) });
  const { reports } = await api(`/api/staff/reports?${qs}`);
  const opt = (map, val) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
  shell(
    key,
    `<div class="page-head"><div><h1 class="display">${mine ? 'My team’s work' : 'Reports'}</h1>
      <p class="muted">${mine ? `Reports assigned to you or to ${esc(S.user.team ?? 'your team')}.` : 'Every report from the resident app.'} ${reports.length} shown.</p></div>
      <div class="row" id="headActions">${mine ? '' : '<button class="btn danger-outline" id="deleteMode">Delete reports</button>'}<button class="btn outline" id="exportBtn">Export CSV</button>
        <button class="btn dark m-only filter-toggle" id="filterToggle" type="button" aria-expanded="false" aria-controls="filters">Filter${activeFilters(f) ? ` (${activeFilters(f)})` : ''}</button></div>
      <div class="row select-bar" id="selectBar" hidden><span class="small"><b id="selCount">0</b> selected</span>
        <button class="btn danger" id="deleteSelected" disabled>Delete selected</button><button class="btn outline" id="cancelSelect">Cancel</button></div></div>
    <form class="filters" id="filters">
      <label class="field"><span>Search</span><input type="search" name="q" value="${esc(f.q)}" placeholder="Code, place, description, team…"/></label>
      <label class="field"><span>Status</span><select name="status"><option value="all">All</option><option value="open" ${f.status === 'open' ? 'selected' : ''}>All open</option>${opt(STATUS, f.status)}</select></label>
      <label class="field"><span>Barrier type</span><select name="category"><option value="all">All</option>${opt(CAT, f.category)}</select></label>
      <label class="field"><span>Team</span><select name="team"><option value="all">All</option>${S.teams.map((t) => `<option ${f.team === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <button class="btn dark" type="submit">Filter</button>
    </form>
    <div class="table-wrap"><table>
      <thead><tr><th class="sel"><input type="checkbox" id="selAll" aria-label="Select all reports shown"/></th><th>Photo</th><th>Report</th><th>Barrier</th><th>AI</th><th>Location</th><th>Effect</th><th>Team</th><th>Status</th></tr></thead>
      <tbody>${
        reports.length
          ? reports
              .map(
                (r) => `<tr data-open="${r.id}" data-code="${esc(r.code)}" tabindex="0">
            <td class="sel"><input type="checkbox" class="selbox" value="${r.id}" aria-label="Select ${esc(r.code)}"/></td>
            <td><img class="thumb" src="${esc(r.photo)}" alt=""/></td>
            <td><b>${esc(r.code)}</b><div class="small muted">${fmtDate(r.createdAt)}</div></td>
            <td>${catLabel(r.category)}${r.categoryCorrected ? '<div class="small muted">Resident corrected AI</div>' : ''}</td>
            <td class="small">${r.ai ? (r.ai.noBarrier ? 'No barrier' : `${esc(CAT[r.ai.category] ?? r.ai.category)} · ${pct(r.ai.confidence)}`) : '—'}</td>
            <td class="small">${esc(r.address ?? '—')}${r.landmark ? `<div class="muted">${esc(r.landmark)}</div>` : ''}</td>
            <td class="small">${esc(SEVERITY[r.severity] ?? '—')}</td>
            <td class="small">${esc(r.team ?? '—')}${r.assignee ? `<div class="muted">${esc(r.assignee)}</div>` : ''}</td>
            <td>${statusPill(r)}<div style="margin-top:6px">${prioPill(r.priority)}</div></td></tr>`
              )
              .join('')
          : `<tr><td colspan="9" class="empty">No reports match these filters.</td></tr>`
      }</tbody></table></div>
    <dialog id="deleteDialog"><form method="dialog" class="stack"><h2 class="display">Delete reports?</h2>
      <p style="margin:0">This permanently deletes <b id="delCount"></b>: <span id="delCodes"></span>.</p>
      <p class="small muted" style="margin:0">Their photos, timeline and the residents’ updates are removed too. Residents will no longer see these reports in their app. This can’t be undone.</p>
      <div class="row"><button class="btn danger" value="ok">Delete permanently</button><button class="btn outline" value="cancel" formnovalidate>Cancel</button></div></form></dialog>`
  );
  setupDelete(params, mine);
  document.getElementById('exportBtn').addEventListener('click', downloadCsv);
  document.getElementById('filterToggle')?.addEventListener('click', (e) => {
    const open = document.getElementById('filters').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  document.getElementById('filters').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new URLSearchParams(new FormData(e.target));
    location.hash = `#/${mine ? 'my' : 'reports'}?${fd}`;
  });
  document.querySelectorAll('[data-open]').forEach((tr) => {
    const go = () => {
      if (document.querySelector('.table-wrap.selecting')) {
        const box = tr.querySelector('.selbox');
        box.checked = !box.checked;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      location.hash = `#/report/${tr.dataset.open}`;
    };
    tr.addEventListener('click', (e) => {
      if (e.target.classList.contains('selbox')) return; // the checkbox handles itself
      go();
    });
    tr.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  });
}

// Select-and-delete mode on the Reports page (staff and admin).
function setupDelete(params, mine) {
  const startBtn = document.getElementById('deleteMode');
  if (!startBtn) return;
  const wrap = document.querySelector('.table-wrap');
  const bar = document.getElementById('selectBar');
  const head = document.getElementById('headActions');
  const delBtn = document.getElementById('deleteSelected');
  const all = document.getElementById('selAll');
  const boxes = () => [...document.querySelectorAll('.selbox')];
  const chosen = () => boxes().filter((b) => b.checked);
  const refresh = () => {
    const n = chosen().length;
    document.getElementById('selCount').textContent = n;
    delBtn.disabled = n === 0;
    delBtn.textContent = n ? `Delete ${n} report${n > 1 ? 's' : ''}` : 'Delete selected';
    all.checked = n > 0 && n === boxes().length;
    all.indeterminate = n > 0 && n < boxes().length;
    boxes().forEach((b) => b.closest('tr').classList.toggle('picked', b.checked));
  };
  const setMode = (on) => {
    wrap.classList.toggle('selecting', on);
    bar.hidden = !on;
    head.hidden = on;
    if (!on) boxes().forEach((b) => (b.checked = false));
    refresh();
  };
  startBtn.addEventListener('click', () => setMode(true));
  document.getElementById('cancelSelect').addEventListener('click', () => setMode(false));
  document.addEventListener('keydown', function esc(e) {
    if (!document.body.contains(wrap)) return document.removeEventListener('keydown', esc);
    if (e.key === 'Escape' && wrap.classList.contains('selecting') && !document.getElementById('deleteDialog').open) setMode(false);
  });
  wrap.addEventListener('change', (e) => e.target.classList.contains('selbox') && refresh());
  all.addEventListener('change', () => {
    boxes().forEach((b) => (b.checked = all.checked));
    refresh();
  });
  const dlg = document.getElementById('deleteDialog');
  delBtn.addEventListener('click', () => {
    const picked = chosen();
    if (!picked.length) return;
    document.getElementById('delCount').textContent = `${picked.length} report${picked.length > 1 ? 's' : ''}`;
    document.getElementById('delCodes').textContent = picked.map((b) => b.closest('tr').dataset.code).join(', ');
    dlg.showModal();
  });
  dlg.addEventListener('close', async () => {
    if (dlg.returnValue !== 'ok') return; // cancelled: keep the selection
    try {
      const ids = chosen().map((b) => Number(b.value));
      const res = await api('/api/staff/reports/delete', { method: 'POST', json: { ids } });
      toast(`Deleted ${res.deleted.join(', ')}.`);
      viewReports(params, mine);
    } catch (e) {
      toast(e.message, true);
    }
  });
}

// ------------------------------------------------------------------ views: report detail
function aiPanel(r) {
  const ai = r.ai;
  if (!ai) return `<div class="notice">AI check wasn’t available when this was reported. The resident chose the category.</div>`;
  const keys = [...CAT_KEYS, ...(ai.scores?.none != null ? ['none'] : [])].sort((a, b) => (ai.scores?.[b] ?? 0) - (ai.scores?.[a] ?? 0));
  const label = ai.noBarrier ? 'No barrier spotted' : CAT[ai.category] ?? ai.category;
  const light = ai.uncertain || ai.noBarrier;
  return `<div class="card ${light ? 'paper' : 'red'}">
    <div class="label">${ai.noBarrier ? 'AI result' : ai.uncertain ? 'AI is not sure' : 'AI suggestion'}</div>
    <h2 class="display" style="margin-top:4px">${esc(label)}</h2>
    <div class="small">${pct(ai.confidence)} confidence${ai.model ? ` · ${esc(ai.model)}` : ''}</div>
    <div class="bars">${keys
      .map(
        (k) => `<div class="bar"><span>${k === 'none' ? 'No barrier' : esc(CAT[k])}</span><span class="track"><span class="fill" style="display:block;width:${Math.round(
          (ai.scores?.[k] ?? 0) * 100
        )}%"></span></span><span style="text-align:right">${pct(ai.scores?.[k] ?? 0)}</span></div>`
      )
      .join('')}</div>
    <p class="small" style="margin:12px 0 0">Resident chose <b>${esc(CAT[r.residentCategory])}</b>${r.categoryCorrected ? ' — they corrected the AI.' : '.'}</p>
  </div>`;
}

function photoWithBox(src, ai, alt) {
  const b = ai && !ai.noBarrier && ai.box;
  return `<figure class="photo" style="margin:0"><img src="${esc(src)}" alt="${esc(alt)}"/>${
    b
      ? `<div class="aibox" id="aibox" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%"><span>${esc(
          CAT[ai.category] ?? ''
        )} · ${pct(ai.confidence)}</span></div>`
      : ''
  }</figure>`;
}

function stepper(r) {
  const order = ['new', 'verified', 'assigned', 'awaiting_confirmation', 'confirmed'];
  const idx = order.indexOf(r.status);
  const steps = [
    ['Verify', 'Issue & team'],
    ['Assign', 'Inspection / repair'],
    ['Evidence', 'Completion photo'],
    ['Confirm', 'Close & update resident'],
  ];
  if (r.status === 'closed' && r.rejected) return `<div class="notice warn"><b>Rejected: no barrier.</b> ${esc(r.closedReason ?? '')}</div>`;
  if (r.status === 'closed') return `<div class="notice warn"><b>Closed.</b> ${esc(r.closedReason ?? '')}</div>`;
  return `<div class="steps">${steps
    .map(([t, s], i) => {
      const cls = i < idx ? 'done' : i === idx ? 'now' : '';
      return `<div class="s ${cls}"><small>Step ${i + 1}</small>${t}<small>${s}</small></div>`;
    })
    .join('')}</div>`;
}

function teamSelect(name, value) {
  return `<select name="${name}" required>${S.teams.map((t) => `<option ${t.name === value ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
}

// Priority (points-based, see api.py priority_for)
const prioPill = (p) => (p ? `<span class="pill prio-${p.level}" title="${p.score} points">${esc(p.label)} priority</span>` : '');
function priorityCard(r) {
  const p = r.priority;
  if (!p) return '';
  return `<section class="card prio-card"><div class="row spread"><h2 class="display">Priority</h2>${prioPill(p)}</div><div class="rule"></div>
    <table class="prio-table"><tbody>
      ${p.reasons.map((x) => `<tr><td>${esc(x.text.charAt(0).toUpperCase() + x.text.slice(1))}</td><td class="pts">+${x.points}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="pts">${p.score} pts</td></tr></tbody></table>
    <p class="small muted" style="margin:8px 0 0">High = 4+ points · Medium = 2–3 · Low = 0–1.
      ${p.overridden ? `<b>Set to ${esc(p.label)} by staff</b> (score suggests ${esc(p.auto)}).` : 'Staff can change it when verifying.'}</p></section>`;
}

// Signature: upload an image (website and phone) or draw with a finger (phone).
function sigField(label) {
  return `<div class="field sig" data-sig>
      <span>${esc(label)}</span>
      <div class="sig-pad m-only"><canvas aria-label="Draw your signature with your finger"></canvas>
        <div class="sig-hint small muted">Draw your signature here</div>
        <button type="button" class="btn ghost small" data-sig-clear>Clear</button></div>
      <div class="row"><label class="btn outline small sig-upload">Upload signature image<input type="file" accept="image/png,image/jpeg" hidden/></label>
        <span class="small muted">PNG or JPG of your signature</span></div>
      <div class="sig-preview" hidden><img alt="Your signature"/><button type="button" class="btn ghost small" data-sig-remove>Remove</button></div>
      <input type="hidden" name="signature"/>
    </div>`;
}

function initSignatures(root = document) {
  root.querySelectorAll('[data-sig]').forEach((box) => {
    const hidden = box.querySelector('input[name=signature]');
    const preview = box.querySelector('.sig-preview');
    const canvas = box.querySelector('canvas');
    const showPreview = (url) => {
      preview.hidden = !url;
      if (url) preview.querySelector('img').src = url;
    };
    // drawing (shown on phones)
    if (canvas) {
      const ctx = canvas.getContext('2d');
      let drawing = false;
      let drawn = false;
      const size = () => {
        const r = canvas.getBoundingClientRect();
        if (!r.width) return;
        canvas.width = r.width * 2;
        canvas.height = r.height * 2;
        ctx.scale(2, 2);
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#141428';
      };
      requestAnimationFrame(size);
      const pos = (e) => {
        const r = canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };
      canvas.addEventListener('pointerdown', (e) => {
        if (!canvas.width) size();
        drawing = true;
        canvas.setPointerCapture(e.pointerId);
        const [x, y] = pos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.1, y + 0.1);
        ctx.stroke();
        e.preventDefault();
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const [x, y] = pos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
        drawn = true;
        e.preventDefault();
      });
      const end = () => {
        if (!drawing) return;
        drawing = false;
        if (drawn) {
          hidden.value = canvas.toDataURL('image/png');
          box.querySelector('.sig-hint').hidden = true;
          showPreview(null);
        }
      };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      box.querySelector('[data-sig-clear]').addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawn = false;
        hidden.value = '';
        box.querySelector('.sig-hint').hidden = false;
      });
    }
    // upload (website and phone): shrink to a small PNG
    box.querySelector('input[type=file]').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 900 / img.width, 400 / img.height);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        hidden.value = c.toDataURL('image/png');
        showPreview(hidden.value);
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
      e.target.value = '';
    });
    box.querySelector('[data-sig-remove]').addEventListener('click', () => {
      hidden.value = '';
      showPreview(null);
    });
  });
}

// Shown only on new reports where the AI found no barrier: staff can agree and reject.
function rejectPanel(r) {
  const notWalkway = r.ai.reason === 'not_walkway';
  return `<form class="stack reject" data-action="reject">
      <div class="rule"></div>
      <h3>Or reject this report</h3>
      <div class="notice warn">AI found <b>${notWalkway ? 'no walkway' : 'no barrier'}</b> in this photo (${Math.round((r.ai.confidence ?? 0) * 100)}%). If you agree after checking the photo, reject it. The resident is told why.</div>
      <label class="field"><span>Reason the resident will see</span><select name="reason">
        <option value="no_barrier" ${notWalkway ? '' : 'selected'}>No barrier visible on the walkway</option>
        <option value="not_walkway" ${notWalkway ? 'selected' : ''}>Photo doesn’t show a walkway</option>
        <option value="unclear">Photo too dark or unclear, please resend</option></select></label>
      <label class="field"><span>Extra message (optional)</span><textarea name="extra" placeholder="e.g. If the barrier is further along the path, please send another photo."></textarea></label>
      <button class="btn danger">Reject report</button>
    </form>`;
}

function actionPanel(r) {
  const s = r.status;
  if (s === 'new' || (s === 'verified' && r._editVerify)) {
    const cat = r.staffCategory ?? r.residentCategory;
    return `<form class="stack" data-action="verify">
      <h3>Confirm the issue and the responsible team</h3>
      <p class="small muted" style="margin:0">Check the photo. AI and the resident only suggest — you decide.</p>
      <fieldset style="border:none;padding:0;margin:0" class="stack"><legend class="label" style="margin-bottom:6px">Barrier type</legend>
        ${CAT_KEYS.map(
          (k) => `<label class="check"><input type="radio" name="category" value="${k}" ${k === cat ? 'checked' : ''}/> ${catLabel(k)}
          <span class="small muted">${[r.ai && !r.ai.noBarrier && r.ai.category === k ? 'AI' : '', r.residentCategory === k ? 'Resident' : ''].filter(Boolean).join(' + ')}</span></label>`
        ).join('')}</fieldset>
      <label class="field"><span>Responsible maintenance team</span>${teamSelect('team', r.team ?? suggestedTeam(cat))}</label>
      <label class="field"><span>Priority</span><select name="priority">
        <option value="auto" ${!r.priority?.overridden ? 'selected' : ''}>Use the score: ${esc(r.priority?.auto ?? 'medium')} (${r.priority?.score ?? 0} pts)</option>
        ${['high', 'medium', 'low'].map((l) => `<option value="${l}" ${r.priority?.overridden && r.priority.level === l ? 'selected' : ''}>${l.charAt(0).toUpperCase() + l.slice(1)}</option>`).join('')}
      </select></label>
      <label class="field"><span>Internal note (optional)</span><textarea name="note" placeholder="Only staff can see this"></textarea></label>
      ${sigField('Your signature (Acknowledged by, on the defect report)')}
      <button class="btn">Verify report</button>
    </form>
    ${s === 'new' && r.ai?.noBarrier ? rejectPanel(r) : ''}`;
  }
  if (s === 'verified' || (s === 'assigned' && r._editAssign)) {
    const due = r.dueDate ?? new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    return `<form class="stack" data-action="assign">
      <h3>Assign inspection or repair work</h3>
      <div class="seg" role="radiogroup" aria-label="Work type">
        <button type="button" role="radio" data-work="inspection" aria-checked="${r.workType === 'inspection'}" class="${r.workType === 'inspection' ? 'on' : ''}">Inspection</button>
        <button type="button" role="radio" data-work="repair" aria-checked="${r.workType !== 'inspection'}" class="${r.workType !== 'inspection' ? 'on' : ''}">Repair</button>
      </div>
      <input type="hidden" name="workType" value="${r.workType === 'inspection' ? 'inspection' : 'repair'}"/>
      <label class="field"><span>Team</span>${teamSelect('team', r.team ?? suggestedTeam(r.category))}</label>
      <label class="field"><span>Person in charge (optional)</span><select name="assigneeId"><option value="">Anyone in the team</option>
        ${S.people.map((p) => `<option value="${p.id}" ${p.id === r.assigneeId ? 'selected' : ''}>${esc(p.name)}${p.team ? ` — ${esc(p.team)}` : ''}</option>`).join('')}</select></label>
      <label class="field"><span>Target date</span><input type="date" name="dueDate" value="${due}"/></label>
      <label class="field"><span>Instructions for the team</span><textarea name="note" placeholder="e.g. Install bollards; check drain cover size">${esc(r.workNote ?? '')}</textarea></label>
      <div class="row"><button class="btn">${s === 'assigned' ? 'Update assignment' : 'Assign work'}</button>
        ${s === 'verified' ? '<button type="button" class="btn ghost small" data-edit="verify">Change verification</button>' : ''}</div>
    </form>`;
  }
  if (s === 'assigned') {
    return `<form class="stack" data-action="completion">
      <h3>Submit completion evidence</h3>
      <div class="notice"><b>${esc(r.workType === 'inspection' ? 'Inspection' : 'Repair')}</b> by ${esc(r.team)}${r.assignee ? ` (${esc(r.assignee)})` : ''} · due ${fmtDay(r.dueDate)}
        ${r.overdue ? '<br/><b class="red">Overdue</b>' : ''}${r.workNote ? `<br/><span class="small">${esc(r.workNote)}</span>` : ''}</div>
      <div class="field"><span>Photo after the work</span>
        <input type="file" name="photo" accept="image/*" class="photo-input" id="photoGallery"/>
        <div class="photo-pick m-only">
          <label class="btn outline" for="photoCamera">Take photo</label>
          <label class="btn outline" for="photoGallery">Choose from gallery</label>
          <input type="file" name="photoCam" accept="image/*" capture="environment" id="photoCamera" hidden/>
        </div>
        <div class="photo-preview" id="photoPreview" hidden><img alt="Selected completion photo"/><span class="small"></span></div>
      </div>
      <label class="field"><span>What was done</span><textarea name="note" placeholder="e.g. Motorcycles removed, two bollards installed"></textarea></label>
      ${sigField('Maintenance signature (Agreed by, on the defect report)')}
      <div class="row"><button class="btn">Submit evidence</button><button type="button" class="btn ghost small" data-edit="assign">Change assignment</button></div>
    </form>`;
  }
  if (s === 'awaiting_confirmation') {
    return `<div class="stack">
      <h3>Review completion evidence</h3>
      <div class="compare"><div><div class="label">Before</div>${photoWithBox(r.photo, null, 'Before: resident photo')}</div>
        <div><div class="label red">After</div>${photoWithBox(r.completionPhoto, null, 'After: completion photo')}</div></div>
      ${r.completionNote ? `<p class="small" style="margin:0"><b>Team note:</b> ${esc(r.completionNote)}</p>` : ''}
      <form class="stack" data-action="confirm"><button class="btn">Confirm completion & update resident</button></form>
      <form class="stack" data-action="rework"><label class="field"><span>Not good enough? Tell the team why</span><textarea name="note" placeholder="e.g. Ramp is still too steep"></textarea></label>
        <button class="btn outline">Send back for more work</button></form>
    </div>`;
  }
  if (s === 'confirmed') {
    const fb = r.feedback;
    return `<div class="stack"><h3>Resolved ${ago(r.resolvedAt)}</h3>
      <p class="small" style="margin:0">Confirmed by ${esc(r.resolvedBy ?? 'staff')} on ${fmtDate(r.resolvedAt)}.</p>
      <div class="compare"><div><div class="label">Before</div>${photoWithBox(r.photo, null, 'Before')}</div><div><div class="label red">After</div>${photoWithBox(
        r.completionPhoto,
        null,
        'After'
      )}</div></div>
      <div class="notice ${fb && !fb.fixed ? 'warn' : ''}"><b>Resident feedback:</b> ${
        fb ? `${fb.fixed ? 'Walkway is usable now ✓' : 'Says it is NOT fixed'}${fb.comment ? ` — “${esc(fb.comment)}”` : ''}` : 'Not given yet.'
      }</div>
      <form data-action="rework" class="stack"><label class="field"><span>Reopen with a reason</span><textarea name="note"></textarea></label><button class="btn outline small">Reopen and send back</button></form></div>`;
  }
  if (r.rejected) return `<div class="stack"><h3>Report rejected</h3><p class="small">${esc(r.closedReason ?? '')}</p></div>`;
  return `<div class="stack"><h3>Report closed</h3><p class="small">${esc(r.closedReason ?? '')}</p></div>`;
}

async function viewReport(id) {
  loading('reports', 'Report');
  const { report: r } = await api(`/api/staff/reports/${id}`);
  renderReport(r);
}

const AUTO_KEYS = [
  ['location', 'Location'],
  ['category', 'Barrier type'],
  ['severity', 'Effect'],
  ['impacts', 'What happened'],
  ['affected', 'Who it affects'],
];

const LOC_SOURCE = {
  camera: 'GPS when the photo was taken',
  photo: 'GPS saved in the photo',
  current: 'Phone location when sending (photo had no GPS)',
  manual: 'Pin moved by the resident',
  none: 'Pin placed by the resident (no location access)',
};

// "AI suggested" when the resident kept what the app filled in, "Resident edited" when they changed it.
function autoTag(r, key) {
  const v = r.autoFields?.[key];
  if (v === 'accepted') return `<span class="tag ai">${key === 'location' ? 'From GPS' : 'AI suggested'}</span>`;
  if (v === 'edited') return '<span class="tag edited">Resident edited</span>';
  return '';
}

function renderReport(r) {
  clearMaps();
  shell(
    'reports',
    `<div class="page-head"><div><a href="#/reports" class="small">← All reports</a>
      <h1 class="display" style="margin-top:6px">${esc(r.code)} · ${esc(CAT[r.category])}</h1>
      <p class="muted">${esc(r.address ?? 'Pinned location')}${r.landmark ? ` · ${esc(r.landmark)}` : ''} · reported ${ago(r.createdAt)}</p></div>
      <div class="row">${statusPill(r)}${prioPill(r.priority)}${r.formalReport ? `<a class="btn outline small" href="report.html?id=${r.id}" target="_blank" rel="noopener" title="Formal defect report ${esc(r.formalReport.number)}, generated when the resident submitted">View report</a>` : ''}</div></div>
    ${stepper(r)}
    <div class="grid two">
      <div class="stack">
        ${photoWithBox(r.photo, r.ai, 'Resident photo of the barrier')}
        <div class="row spread"><label class="check small"><input type="checkbox" id="toggleBox" checked/> Show AI highlight</label>
          <button class="btn ghost small" id="reanalyse">Re-run AI on this photo</button></div>
        ${aiPanel(r)}
        ${priorityCard(r)}
        <section class="card"><h2 class="display">What the resident sent</h2><div class="rule"></div>
          ${Object.keys(r.autoFields ?? {}).length
            ? `<p class="small muted" style="margin-top:0">The app filled these in from the photo. <span class="tag ai">AI suggested</span> = resident kept it, <span class="tag edited">Resident edited</span> = resident changed it.</p>`
            : ''}
          <dl class="kv">
            <dt>Barrier type</dt><dd><b>${esc(CAT[r.residentCategory ?? r.category] ?? '—')}</b> ${autoTag(r, 'category')}</dd>
            <dt>Effect</dt><dd><b>${esc(SEVERITY[r.severity] ?? '—')}</b> ${autoTag(r, 'severity')}</dd>
            <dt>What happened</dt><dd>${list(r.impacts, IMPACTS)} ${autoTag(r, 'impacts')}</dd>
            <dt>Who it affects</dt><dd>${list(r.affected, AFFECTED)} ${autoTag(r, 'affected')}</dd>
            <dt>Location</dt><dd>${esc(LOC_SOURCE[r.locationSource] ?? 'Pinned by resident')} ${autoTag(r, 'location')}</dd>
            <dt>Description</dt><dd>${esc(r.description ?? '—')}</dd>
            ${r.voice ? `<dt>Voice note</dt><dd><audio controls src="${esc(r.voice)}"></audio></dd>` : ''}
            <dt>Resident</dt><dd>${esc(r.resident?.name ?? 'Anonymous')}${r.resident?.getAround?.length ? ` <span class="small muted">(${list(r.resident.getAround, AFFECTED)})</span>` : ''}</dd>
            <dt>Reported</dt><dd>${fmtDate(r.createdAt)}${r.reportSeconds ? ` <span class="small muted">· took ${r.reportSeconds}s in the app</span>` : ''}</dd>
          </dl></section>
      </div>
      <div class="stack">
        <section class="card">${actionPanel(r)}</section>
        <section class="card"><h2 class="display">Location</h2><div class="rule"></div><div class="map small" id="map"></div>
          ${r.lat != null ? `<div class="directions">
            <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}&travelmode=driving" target="_blank" rel="noopener">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>
              Directions in Google Maps</a>
            <a class="btn outline small" href="https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}" target="_blank" rel="noopener">View pin</a>
            <span class="small muted">${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}${r.landmark ? ` · ${esc(r.landmark)}` : ''}</span></div>` : ''}
          ${r.nearby.length
            ? `<div class="notice warn" style="margin-top:12px"><b>Recurring spot:</b> ${r.nearby.length} other report${r.nearby.length > 1 ? 's' : ''} within 60 m.<ul style="margin:6px 0 0;padding-left:18px">${r.nearby
                .slice(0, 5)
                .map((n) => `<li><a href="#/report/${n.id}">${esc(n.code)}</a> · ${esc(CAT[n.category])} · ${esc(STATUS[n.status])} · ${n.distance} m · ${ago(n.createdAt)}</li>`)
                .join('')}</ul></div>`
            : ''}</section>
        <section class="card"><h2 class="display">Talk to the resident</h2><div class="rule"></div>
          <form class="stack" data-action="message"><label class="field"><span>Message (appears in their app)</span><textarea name="text" placeholder="e.g. Our team will visit on Thursday morning."></textarea></label><button class="btn dark small">Send message</button></form></section>
        <section class="card"><h2 class="display">Timeline</h2><div class="rule"></div>
          <ul class="timeline">${r.events
            .map(
              (e) => `<li class="${e.public ? '' : 'private'}"><div><b>${esc(e.note)}</b><div class="small muted">${fmtDate(e.at)} · ${esc(
                e.by ?? { resident: 'Resident', ai: 'AI', system: 'System', staff: 'Staff', admin: 'Admin' }[e.actor]
              )}${e.public ? '' : ' · staff only'}</div></div></li>`
            )
            .join('')}</ul>
          <form class="stack" data-action="note"><label class="field"><span>Add internal note</span><input type="text" name="text" placeholder="Only staff can see this"/></label></form>
          ${!['confirmed', 'closed'].includes(r.status) ? `<button class="btn ghost small" id="closeBtn">Close report (duplicate or not a barrier)…</button>` : ''}
        </section>
      </div>
    </div>
    <dialog id="closeDialog"><form method="dialog" class="stack" id="closeForm"><h2 class="display">Close ${esc(r.code)}</h2>
      <p class="small muted" style="margin:0">The resident will see this reason in their app.</p>
      <label class="field"><span>Reason</span><select name="preset">
        <option>This is a duplicate of an earlier report at the same place.</option>
        <option>We checked on site and could not find a barrier.</option>
        <option>This is on private land, so we have passed it to the owner.</option>
        <option value="">Other (write below)</option></select></label>
      <label class="field"><span>Extra detail</span><textarea name="extra"></textarea></label>
      <div class="row"><button class="btn" value="ok">Close report</button><button class="btn outline" value="cancel" formnovalidate>Cancel</button></div></form></dialog>`
  );

  renderMap(document.getElementById('map'), [{ ...r, title: r.code }], { zoom: 17 });
  document.getElementById('toggleBox')?.addEventListener('change', (e) => {
    const box = document.getElementById('aibox');
    if (box) box.hidden = !e.target.checked;
  });
  document.getElementById('reanalyse')?.addEventListener('click', () => act(r, 'reanalyse', {}, 'AI re-checked the photo.'));
  document.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => renderReport({ ...r, [`_edit${b.dataset.edit === 'verify' ? 'Verify' : 'Assign'}`]: true }))
  );
  document.querySelectorAll('[data-work]').forEach((b) =>
    b.addEventListener('click', () => {
      const f = b.closest('form');
      f.workType.value = b.dataset.work;
      f.querySelectorAll('[data-work]').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
    })
  );
  document.querySelectorAll('input[name=category]').forEach((radio) =>
    radio.addEventListener('change', () => {
      const f = radio.closest('form');
      f.team.value = suggestedTeam(radio.value) || f.team.value;
    })
  );
  document.querySelectorAll('form[data-action]').forEach((f) =>
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = f.dataset.action;
      const fd = new FormData(f);
      if ((a === 'verify' || a === 'completion') && !fd.get('signature')) return toast('Add your signature first: upload it, or draw it on a phone.', true);
      if (a === 'completion') {
        if (fd.get('photoCam')?.size) fd.set('photo', fd.get('photoCam')); // taken with the camera
        fd.delete('photoCam');
        if (!fd.get('photo')?.size) return toast('Add a photo taken after the work.', true);
        return act(r, 'completion', fd, 'Completion evidence submitted.', true);
      }
      const data = Object.fromEntries(fd.entries());
      if (data.assigneeId) data.assigneeId = Number(data.assigneeId);
      const msg = {
        verify: 'Report verified. The resident has been updated.',
        assign: 'Work assigned. The resident has been updated.',
        confirm: 'Completion confirmed. The resident has been told it’s fixed.',
        rework: 'Sent back to the team.',
        message: 'Message sent to the resident’s app.',
        note: 'Note added.',
        reject: 'Report rejected. The resident has been told why.',
      }[a];
      if (a === 'reject' && !confirm(`Reject ${r.code}? The resident will be told it was not accepted.`)) return;
      act(r, a, data, msg);
    })
  );
  initSignatures();
  // completion photo: show which photo was picked (camera or gallery); the newest pick wins
  ['photoGallery', 'photoCamera'].forEach((id) =>
    document.getElementById(id)?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      const other = document.getElementById(id === 'photoGallery' ? 'photoCamera' : 'photoGallery');
      if (file && other) other.value = '';
      const box = document.getElementById('photoPreview');
      if (!box) return;
      box.hidden = !file;
      if (file) {
        box.querySelector('img').src = URL.createObjectURL(file);
        box.querySelector('span').textContent = file.name || 'Photo selected';
      }
    })
  );
  const dlg = document.getElementById('closeDialog');
  document.getElementById('closeBtn')?.addEventListener('click', () => dlg.showModal());
  dlg?.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return;
    const f = document.getElementById('closeForm');
    const reason = [f.preset.value, f.extra.value.trim()].filter(Boolean).join(' ');
    if (!reason) return toast('Give a reason so the resident understands.', true);
    act(r, 'close', { reason }, 'Report closed. The resident has been told why.');
  });
}

async function act(r, action, data, okMsg, isForm = false) {
  try {
    const res = await api(`/api/staff/reports/${r.id}/${action}`, {
      method: 'POST',
      ...(isForm ? { form: data } : { json: data }),
    });
    toast(okMsg);
    renderReport(res.report);
    poll();
  } catch (err) {
    toast(err.message, true);
  }
}

// ------------------------------------------------------------------ views: insights
function weekChart(weeks) {
  const max = Math.max(1, ...weeks.flatMap((w) => [w.reported, w.resolved]));
  const W = 560, H = 200, pad = 28, bw = (W - pad * 2) / weeks.length;
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  const bars = weeks
    .map((w, i) => {
      const x = pad + i * bw;
      const label = new Date(w.week).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
      return `<rect x="${x + 6}" y="${y(w.reported)}" width="${bw / 2 - 8}" height="${H - pad - y(w.reported)}" fill="#D62828" stroke="#1E1614" stroke-width="2"><title>${label}: ${w.reported} reported</title></rect>
        <rect x="${x + bw / 2}" y="${y(w.resolved)}" width="${bw / 2 - 8}" height="${H - pad - y(w.resolved)}" fill="#1E1614"><title>${label}: ${w.resolved} resolved</title></rect>
        <text x="${x + bw / 2}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#5E4E48">${label}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Reports and resolutions per week">
    <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#1E1614" stroke-width="2"/>
    <text x="${pad}" y="14" font-size="11" fill="#5E4E48">${max}</text>${bars}</svg>`;
}

async function viewInsights() {
  loading('insights', 'Recurring issues & evaluation');
  const [stats, { hotspots, radius }] = await Promise.all([api('/api/staff/stats'), api('/api/staff/hotspots')]);
  const ai = stats.ai;
  const metric = (num, label, note = '') => `<div class="metric"><span class="num">${num}</span><span class="label">${label}</span>${note ? `<span class="small muted">${note}</span>` : ''}</div>`;
  shell(
    'insights',
    `<div class="page-head"><div><h1 class="display">Recurring issues & evaluation</h1>
      <p class="muted">Live numbers for the evaluation plan: AI precision and recall, staff corrections, resolution time, verified closures and repeated issues by location.</p></div></div>
    <div class="grid three">
      <section class="card">${metric(pct(ai.accuracy), 'AI agrees with staff', `${ai.verified} staff-verified reports`)}</section>
      <section class="card">${metric(hours(stats.medianResolutionHours), 'Median resolution time', `${stats.verifiedClosures} verified closures with photo evidence`)}</section>
      <section class="card">${metric(stats.medianReportSeconds ? `${Math.round(stats.medianReportSeconds)} s` : '—', 'Median time to report', `Report completeness ${pct(stats.avgCompleteness)}`)}</section>
    </div>
    <div class="grid two" style="margin-top:18px">
      <section class="card"><h2 class="display">AI precision & recall</h2><div class="rule"></div>
        <p class="small muted" style="margin-top:0">Compared with the category staff confirmed. Updates as you verify reports.</p>
        <div class="table-wrap"><table><thead><tr><th>Category</th><th>Precision</th><th>Recall</th><th>Verified</th></tr></thead><tbody>
        ${CAT_KEYS.map((c) => `<tr style="cursor:default"><td>${catLabel(c)}</td><td>${pct(ai.perCategory[c].precision)}</td><td>${pct(ai.perCategory[c].recall)}</td><td>${ai.perCategory[c].support}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="grid three" style="margin-top:14px">
          ${metric(pct(stats.residentCorrectionRate), 'Residents corrected AI')}
          ${metric(pct(stats.staffOverrideRate), 'Staff changed category')}
          ${metric(`${stats.feedback.fixed}/${stats.feedback.total}`, 'Residents say fixed')}
        </div></section>
      <section class="card"><h2 class="display">Auto-filled reports</h2><div class="rule"></div>
        <p class="small muted" style="margin-top:0">After the resident snaps a photo, the app fills in the location, barrier type, effect and who it affects. How often did residents keep each one?</p>
        ${metric(pct(stats.autoFill.acceptedRate), 'Sent without any edits', `${stats.autoFill.acceptedUnchanged} of ${stats.autoFill.reports} auto-filled reports`)}
        <div class="bars" style="margin-top:14px">${AUTO_KEYS.map(([k, label]) => {
          const f = stats.autoFill.perField[k];
          return `<div class="bar"><span>${label}</span><span class="track"><span class="fill" style="display:block;width:${Math.round((f.keptRate ?? 0) * 100)}%"></span></span><span style="text-align:right">${pct(f.keptRate)}</span></div>`;
        }).join('')}</div>
        <p class="small muted">Bar = kept as suggested. A low bar means the AI guess for that field often needs correcting.</p></section>
      <section class="card chart"><h2 class="display">Reported vs resolved</h2><div class="rule"></div>${weekChart(stats.weeks)}
        <div class="legend"><span><span class="swatch" style="background:#D62828"></span>Reported</span><span><span class="swatch" style="background:#1E1614"></span>Resolved</span></div>
        <div class="bars" style="margin-top:16px">${CAT_KEYS.map(
          (c) => `<div class="bar"><span>${catLabel(c)}</span><span class="track"><span class="fill" style="display:block;width:${Math.round(
            (stats.byCategory[c] / Math.max(1, stats.total)) * 100
          )}%"></span></span><span style="text-align:right">${stats.byCategory[c]}</span></div>`
        ).join('')}</div></section>
    </div>
    <section class="card" style="margin-top:18px"><div class="row spread"><h2 class="display">Recurring barriers</h2><span class="small muted">Same type of barrier reported 2+ times within ${radius} m</span></div><div class="rule"></div>
      <div class="grid two"><div class="map" id="map"></div>
        <div class="stack">${
          hotspots.length
            ? hotspots
                .map(
                  (h, i) => `<div class="card ${i === 0 ? 'paper' : ''}" style="padding:12px">
              <div class="row spread"><b>${catLabel(h.category)}</b><span class="pill ${h.open ? 'assigned' : 'confirmed'}">${h.count} reports · ${h.open} open</span></div>
              <div class="small">${esc(h.address ?? '')}</div>
              <div class="small muted">First ${fmtDay(h.first)} · latest ${ago(h.last)}</div>
              <div class="small" style="margin-top:6px">${h.reports.map((x) => `<a href="#/report/${x.id}">${esc(x.code)}</a>`).join(' · ')}</div></div>`
                )
                .join('')
            : '<p class="empty">No repeated barriers yet.</p>'
        }</div></div></section>`
  );
  renderMap(
    document.getElementById('map'),
    hotspots.map((h) => ({ ...h, title: `${h.count} × ${CAT[h.category]}`, popup: `<b>${h.count} × ${esc(CAT[h.category])}</b><br/>${esc(h.address ?? '')}` }))
  );
}

// ------------------------------------------------------------------ views: admin
async function viewUsers() {
  loading('users', 'Staff accounts');
  const { users } = await api('/api/admin/users');
  shell(
    'users',
    `<div class="page-head"><div><h1 class="display">Staff accounts</h1><p class="muted">Admins manage the township console. Staff verify reports and handle repairs.</p></div>
      <button class="btn" id="addUser">Add account</button></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Logs in with</th><th>Email</th><th>Type</th><th>Team</th><th>Status</th><th>Last login</th><th></th></tr></thead><tbody>
      ${users
        .map(
          (u) => `<tr style="cursor:default"><td><b>${esc(u.name)}</b></td><td>${u.role === 'admin' ? 'Email' : `<code>${esc(u.staffId ?? '—')}</code>`}</td><td>${esc(u.email)}</td><td><span class="pill ${u.role}">${u.role}</span></td>
        <td>${esc(u.team ?? '—')}</td><td>${u.active ? 'Active' : '<span class="muted">Deactivated</span>'}</td><td class="small">${u.lastLogin ? ago(u.lastLogin) : 'Never'}</td>
        <td><button class="btn outline small" data-edit="${u.id}">Edit</button></td></tr>`
        )
        .join('')}</tbody></table></div>
    <dialog id="userDialog"><form class="stack" id="userForm" method="dialog"></form></dialog>`
  );
  const dlg = document.getElementById('userDialog');
  const form = document.getElementById('userForm');
  const open = (u) => {
    form.innerHTML = `<h2 class="display">${u ? 'Edit account' : 'Add account'}</h2>
      <div class="tabs" role="radiogroup" aria-label="Account type">
        <button type="button" data-r="staff" aria-selected="${(u?.role ?? 'staff') === 'staff'}">Staff<small>Reports & repairs</small></button>
        <button type="button" data-r="admin" aria-selected="${u?.role === 'admin'}">Admin<small>Full access</small></button></div>
      <input type="hidden" name="role" value="${u?.role ?? 'staff'}"/>
      <label class="field"><span>Full name</span><input type="text" name="name" required value="${esc(u?.name ?? '')}"/></label>
      <label class="field"><span id="emailLbl">Email</span><input type="email" name="email" required value="${esc(u?.email ?? '')}" ${u ? 'disabled' : ''}/></label>
      <label class="field" id="sidField"><span>Staff ID (used to log in)</span><input type="text" name="staffId" value="${esc(u?.staffId ?? '')}" placeholder="Leave empty to create one automatically" ${u ? 'disabled' : ''} style="text-transform:uppercase"/></label>
      <p class="small muted" id="roleHint"></p>
      <label class="field"><span>Team</span><select name="team"><option value="">No team</option>${S.teams.map((t) => `<option ${t.name === u?.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="field"><span>${u ? 'New password (leave empty to keep)' : 'Password'}</span><input type="password" name="password" ${u ? '' : 'required'} minlength="6" autocomplete="new-password"/></label>
      ${u ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}/> Account active</label>` : ''}
      <p class="error" id="userErr"></p>
      <div class="row"><button class="btn" value="save" type="submit">Save</button><button class="btn outline" type="button" id="cancelUser">Cancel</button></div>`;
    const syncRole = () => {
      const isStaff = form.role.value === 'staff';
      form.querySelector('#sidField').hidden = !isStaff;
      form.querySelector('#emailLbl').textContent = isStaff ? 'Email (for contact)' : 'Email (used to log in)';
      form.querySelector('#roleHint').textContent = isStaff
        ? 'Staff log in on the Staff tab with their staff ID and password.'
        : 'Admins log in on the Admin tab with their email and password.';
    };
    form.querySelectorAll('[data-r]').forEach((b) =>
      b.addEventListener('click', () => {
        form.role.value = b.dataset.r;
        form.querySelectorAll('[data-r]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        syncRole();
      })
    );
    syncRole();
    form.querySelector('#cancelUser').addEventListener('click', () => dlg.close());
    form.onsubmit = async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form).entries());
      const payload = { name: d.name, role: d.role, team: d.team || null };
      let created = null;
      if (d.password) payload.password = d.password;
      try {
        if (u) {
          payload.active = !!form.active?.checked;
          await api(`/api/admin/users/${u.id}`, { method: 'PATCH', json: payload });
        } else {
          const res = await api('/api/admin/users', { method: 'POST', json: { ...payload, email: d.email, staffId: d.staffId } });
          created = res.user;
        }
        dlg.close();
        toast(
          u
            ? 'Account updated.'
            : created.role === 'admin'
              ? `Admin account created. They log in on the Admin tab with ${created.email}.`
              : `Staff account created. They log in on the Staff tab with staff ID ${created.staffId}.`
        );
        await loadRefs();
        viewUsers();
      } catch (err) {
        form.querySelector('#userErr').textContent = err.message;
      }
    };
    dlg.showModal();
  };
  document.getElementById('addUser').addEventListener('click', () => open(null));
  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => open(users.find((u) => u.id === +b.dataset.edit))));
}

async function viewTeams() {
  loading('teams', 'Maintenance teams');
  await loadRefs();
  shell(
    'teams',
    `<div class="page-head"><div><h1 class="display">Maintenance teams</h1><p class="muted">The team ticked for a barrier type is suggested automatically when staff verify a report.</p></div></div>
    <div class="grid two"><div class="table-wrap"><table><thead><tr><th>Team</th>${CAT_KEYS.map((c) => `<th>${esc(CAT[c])}</th>`).join('')}<th>People</th><th></th></tr></thead><tbody>
      ${S.teams
        .map(
          (t) => `<tr style="cursor:default"><td><b>${esc(t.name)}</b></td>${CAT_KEYS.map(
            (c) => `<td><input type="checkbox" aria-label="${esc(t.name)} handles ${esc(CAT[c])}" data-team="${t.id}" data-cat="${c}" ${t.categories.includes(c) ? 'checked' : ''}/></td>`
          ).join('')}<td>${S.people.filter((p) => p.team === t.name).length}</td><td><button class="btn ghost small" data-del="${t.id}">Delete</button></td></tr>`
        )
        .join('')}</tbody></table></div>
    <form class="card stack" id="teamForm"><h2 class="display">Add a team</h2><div class="rule"></div>
      <label class="field"><span>Team name</span><input type="text" name="name" required placeholder="e.g. Drainage Unit"/></label>
      <fieldset style="border:none;padding:0;margin:0"><legend class="label">Handles</legend>${CAT_KEYS.map((c) => `<label class="check"><input type="checkbox" name="cat" value="${c}"/> ${catLabel(c)}</label>`).join('')}</fieldset>
      <button class="btn">Add team</button></form></div>`
  );
  document.querySelectorAll('[data-team]').forEach((cb) =>
    cb.addEventListener('change', async () => {
      const id = +cb.dataset.team;
      const cats = [...document.querySelectorAll(`[data-team="${id}"]`)].filter((x) => x.checked).map((x) => x.dataset.cat);
      try {
        const { teams } = await api(`/api/admin/teams/${id}`, { method: 'PATCH', json: { categories: cats } });
        S.teams = teams;
        toast('Team updated.');
      } catch (err) {
        toast(err.message, true);
      }
    })
  );
  document.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await api(`/api/admin/teams/${b.dataset.del}`, { method: 'DELETE' });
        toast('Team deleted.');
        viewTeams();
      } catch (err) {
        toast(err.message, true);
      }
    })
  );
  document.getElementById('teamForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/admin/teams', { method: 'POST', json: { name: fd.get('name'), categories: fd.getAll('cat') } });
      toast('Team added.');
      viewTeams();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

async function viewResidents() {
  loading('residents', 'Residents');
  const { residents } = await api('/api/admin/residents');
  shell(
    'residents',
    `<div class="page-head"><div><h1 class="display">Residents</h1><p class="muted">Phones that use the AccessLens app. Residents don’t need an account; a first name is optional.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>Resident</th><th>Gets around</th><th>Reports</th><th>Resolved</th><th>Joined</th><th>Last active</th></tr></thead><tbody>
      ${residents
        .map(
          (r) => `<tr data-q="${r.id}"><td><b>${esc(r.name)}</b></td><td class="small">${list(r.getAround, AFFECTED)}</td><td>${r.reports}</td><td>${r.resolved}</td>
          <td class="small">${fmtDay(r.createdAt)}</td><td class="small">${ago(r.lastSeen)}</td></tr>`
        )
        .join('')}</tbody></table></div>`
  );
}

async function viewActivity() {
  loading('activity', 'Activity log');
  const { activity } = await api('/api/admin/activity');
  shell(
    'activity',
    `<div class="page-head"><div><h1 class="display">Activity log</h1><p class="muted">The latest 100 actions by residents, the AI and staff.</p></div>
      <button class="btn outline" id="resetDemo">Reset demo data…</button></div>
    <section class="card"><ul class="timeline">${activity
      .map(
        (a) => `<li><div><a href="#/report/${a.reportId}"><b>${esc(a.code)}</b></a> · ${esc(a.note)}<div class="small muted">${fmtDate(a.at)} · ${esc(
          a.by ?? { resident: 'Resident', ai: 'AI', staff: 'Staff', admin: 'Admin', system: 'System' }[a.actor] ?? a.actor
        )}</div></div></li>`
      )
      .join('')}</ul></section>
    <dialog id="resetDlg"><form method="dialog" class="stack"><h2 class="display">Reset demo data?</h2>
      <p>This deletes every report, resident and account and restores the sample data. Residents’ phones will register again automatically.</p>
      <div class="row"><button class="btn" value="ok">Reset everything</button><button class="btn outline" value="no">Cancel</button></div></form></dialog>`
  );
  const dlg = document.getElementById('resetDlg');
  document.getElementById('resetDemo').addEventListener('click', () => dlg.showModal());
  dlg.addEventListener('close', async () => {
    if (dlg.returnValue !== 'ok') return;
    try {
      await api('/api/admin/reset-demo', { method: 'POST' });
    } catch {
      // the reset logs everyone out
    }
    toast('Demo data restored. Please log in again.');
    logout(false);
  });
}

// ------------------------------------------------------------------ router
function currentRoute() {
  const h = location.hash.replace(/^#/, '') || '/dashboard';
  const [path, query] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query || '');
  if (parts[0] === 'report' && parts[1]) return { name: 'report', id: parts[1] };
  if (parts[0] === 'admin') return { name: parts[1] || 'users', params };
  return { name: parts[0] || 'dashboard', params };
}

async function render() {
  clearMaps();
  if (!S.token) {
    viewLogin();
    return;
  }
  if (!S.pollTimer) {
    S.pollTimer = setInterval(poll, POLL_MS);
    poll();
  }
  const r = currentRoute();
  try {
    if (!S.teams.length) await loadRefs();
    if (r.name === 'login') location.hash = '#/dashboard';
    else if (r.name === 'report') await viewReport(r.id);
    else if (r.name === 'reports') await viewReports(r.params);
    else if (r.name === 'my') await viewReports(r.params, true);
    else if (r.name === 'insights') await viewInsights();
    else if (['users', 'teams', 'residents', 'activity'].includes(r.name)) {
      if (!isAdmin()) {
        toast('Only admins can open that page.', true);
        location.hash = '#/dashboard';
        return;
      }
      await { users: viewUsers, teams: viewTeams, residents: viewResidents, activity: viewActivity }[r.name]();
    } else await viewDashboard();
    document.getElementById('main')?.focus({ preventScroll: true });
  } catch (err) {
    if (!S.token) return;
    shell(r.name, `<div class="notice warn"><b>Something went wrong.</b> ${esc(err.message)}</div>`);
  }
}

window.addEventListener('hashchange', render);

// Branded loading screen (in index.html): fade it out once the first page has drawn,
// but keep it at least ~1.2 s so it doesn't just flash.
const LOADER_SHOWN_AT = performance.now();
function hideLoader() {
  const el = document.getElementById('loader');
  if (!el || el.classList.contains('out')) return;
  const wait = Math.max(0, 1200 - (performance.now() - LOADER_SHOWN_AT));
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 800);
  }, wait);
}
render().finally(hideLoader);
