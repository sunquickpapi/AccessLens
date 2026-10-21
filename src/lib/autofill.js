// Snap → auto-fill → check.
//
// After the resident takes a photo, the app fills in the report for them:
//   location         GPS when the photo was taken (or the GPS saved in a gallery photo)
//   barrier type     AI (CLIP) — see lib/ai.js
//   effect           AI (CLIP), "blocks / difficult / minor"
//   what happened    suggested from barrier type + effect (rules below)
//   who it affects   suggested from barrier type + effect, plus how the resident gets around
//
// Everything stays editable on "Check and send". We remember what was suggested
// so the app (and staff) can tell "AI suggested" apart from "edited by you".

import { AFFECTED, CATEGORIES, IMPACTS, SEVERITY } from './catalog';

export const AUTO_KEYS = ['location', 'category', 'severity', 'impacts', 'affected'];

const IMPACT_RULES = {
  obstruction: { blocked: ['cannot_pass', 'road'], difficult: ['road'], minor: ['longer_route'] },
  surface: { blocked: ['turn_back', 'risk_fall'], difficult: ['risk_fall'], minor: ['risk_fall'] },
  steps: { blocked: ['cannot_pass', 'turn_back'], difficult: ['needed_help'], minor: ['risk_fall'] },
};

const AFFECTED_RULES = {
  obstruction: { blocked: ['wheelchair', 'stroller', 'walking_aid'], difficult: ['wheelchair', 'stroller'], minor: ['wheelchair'] },
  surface: { blocked: ['wheelchair', 'walking_aid', 'older', 'stroller'], difficult: ['walking_aid', 'older', 'wheelchair'], minor: ['walking_aid', 'older'] },
  steps: { blocked: ['wheelchair', 'stroller', 'walking_aid', 'older'], difficult: ['wheelchair', 'stroller', 'walking_aid'], minor: ['wheelchair', 'stroller'] },
};

const order = (keys, list) => list.map((x) => x.key).filter((k) => keys.includes(k));

export function suggestImpacts(category, severity) {
  return [...(IMPACT_RULES[category]?.[severity] ?? [])];
}

export function suggestAffected(category, severity, getAround = []) {
  const keys = new Set([...(AFFECTED_RULES[category]?.[severity] ?? []), ...getAround]);
  return order([...keys], AFFECTED);
}

function sameList(a = [], b = []) {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

function sameValue(key, a, b) {
  if (key === 'impacts' || key === 'affected') return sameList(a, b);
  if (key === 'location') return !!a && !!b && Math.abs(a.latitude - b.latitude) < 1e-6 && Math.abs(a.longitude - b.longitude) < 1e-6;
  return a === b;
}

// null = not auto-filled · 'accepted' = still what the app suggested · 'edited' = the resident changed it
export function fieldStatus(draft, key) {
  const s = draft.suggested ?? {};
  if (!(key in s) || s[key] == null) return null;
  return sameValue(key, draft[key], s[key]) ? 'accepted' : 'edited';
}

export function autoFieldsFor(draft) {
  const out = {};
  AUTO_KEYS.forEach((k) => {
    const st = fieldStatus(draft, k);
    if (st) out[k] = st;
  });
  return out;
}

// Applies an edit. If barrier type or effect changes, "what happened" and
// "who it affects" follow along — unless the resident already changed those.
export function withEdit(draft, patch, getAround = []) {
  const next = { ...draft, ...patch };
  const changedBasis = ('category' in patch && patch.category !== draft.category) || ('severity' in patch && patch.severity !== draft.severity);
  if (changedBasis && next.category && next.severity) {
    const suggested = { ...(draft.suggested ?? {}) };
    if (!('impacts' in patch) && fieldStatus(draft, 'impacts') !== 'edited') {
      next.impacts = suggestImpacts(next.category, next.severity);
      suggested.impacts = next.impacts;
    }
    if (!('affected' in patch) && fieldStatus(draft, 'affected') !== 'edited') {
      next.affected = suggestAffected(next.category, next.severity, getAround);
      suggested.affected = next.affected;
    }
    next.suggested = suggested;
  }
  return next;
}

// What the AI result fills in. Fields the resident already changed are left alone.
export function applyAI(draft, ai, getAround = []) {
  const keep = (k) => fieldStatus(draft, k) === 'edited';
  const suggested = { ...(draft.suggested ?? {}) };
  const patch = { ai, aiState: 'done', aiError: null };
  const category = ai.noBarrier ? null : ai.category;
  const severity = ai.noBarrier ? null : ai.severity ?? null;
  if (!keep('category')) {
    patch.category = category;
    patch.categoryCorrected = false;
    suggested.category = category;
  }
  if (!keep('severity')) {
    patch.severity = severity;
    suggested.severity = severity;
  }
  const cat = patch.category ?? draft.category;
  const sev = patch.severity ?? draft.severity;
  if (cat && sev) {
    if (!keep('impacts')) {
      patch.impacts = suggestImpacts(cat, sev);
      suggested.impacts = patch.impacts;
    }
    if (!keep('affected')) {
      patch.affected = suggestAffected(cat, sev, getAround);
      suggested.affected = patch.affected;
    }
  }
  patch.suggested = suggested;
  return patch;
}

// ---------- the one-paragraph summary at the top of "Check and send"
// Each phrase is [plain lead-in, key words]; the key words are shown in bold.
const IMPACT_PHRASE = {
  cannot_pass: ['people may ', 'not be able to get past'],
  road: ['people may have to ', 'walk on the road'],
  turn_back: ['people may have to ', 'turn back'],
  longer_route: ['people may have to take a ', 'longer route'],
  needed_help: ['people may ', 'need someone to help them'],
  risk_fall: ['there is a ', 'risk of tripping or falling'],
};
const SEVERITY_PHRASE = {
  blocked: ['It probably ', 'blocks the journey'],
  difficult: ['It probably makes the journey ', 'difficult'],
  minor: ['It looks like a ', 'minor inconvenience'],
};

// Joins lists of segments with ", " and " and ".
function joinSegs(items) {
  const out = [];
  items.forEach((segs, i) => {
    if (i > 0) out.push({ text: i === items.length - 1 ? ' and ' : ', ' });
    out.push(...segs);
  });
  return out;
}

// The summary as segments: [{ text, bold }]. Key words (barrier type, place,
// effect, what happened, who) are bold so the resident can scan it.
export function summaryParts(draft) {
  const out = [];
  const t = (text) => out.push({ text });
  const b = (text) => out.push({ text, bold: true });
  const cat = draft.category ? CATEGORIES[draft.category] : null;
  const address = draft.location?.address;
  const seen = draft.ai?.box?.label && draft.ai.category === draft.category ? draft.ai.box.label : null;
  if (cat) {
    t('Looks like ');
    b(cat.noun);
    if (seen) t(` (${seen})`);
    if (address) {
      t(' at ');
      b(address);
    }
    t('.');
  } else if (draft.ai?.noBarrier && draft.ai.reason === 'not_walkway') {
    t('This photo ');
    b('doesn’t look like a walkway');
    t(', so the AI found ');
    b('no barrier');
    t('. Retake the photo, or choose the barrier type yourself.');
  } else if (draft.ai?.noBarrier) {
    t('The AI ');
    b('didn’t spot a barrier');
    t(' in this photo. If there is one, choose the barrier type.');
  } else {
    t('Barrier');
    if (address) {
      t(' at ');
      b(address);
    }
    t('. Please choose the barrier type.');
  }
  if (draft.severity) {
    const [lead, key] = SEVERITY_PHRASE[draft.severity];
    t(` ${lead}`);
    b(key);
    const what = draft.impacts.slice(0, 2).map((k) => IMPACT_PHRASE[k]).filter(Boolean);
    if (what.length) {
      t(': ');
      out.push(...joinSegs(what.map(([l, k]) => [{ text: l }, { text: k, bold: true }])));
    }
    t('.');
  }
  if (draft.affected.length) {
    const who = draft.affected.map((k) => AFFECTED.find((a) => a.key === k)?.label.toLowerCase()).filter(Boolean);
    t(' Likely to affect ');
    out.push(...joinSegs(who.map((w) => [{ text: w, bold: true }])));
    t('.');
  }
  return out;
}

export function summaryText(draft) {
  return summaryParts(draft)
    .map((p) => p.text)
    .join('');
}

export const labelOf = {
  severity: (k) => SEVERITY.find((s) => s.key === k)?.label,
  list: (keys, list) => (keys ?? []).map((k) => list.find((x) => x.key === k)?.label).filter(Boolean).join(', '),
  impacts: (keys) => labelOf.list(keys, IMPACTS),
  affected: (keys) => labelOf.list(keys, AFFECTED),
};

// ---------- GPS saved inside a gallery photo (EXIF)
function toNumber(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) {
    const [d = 0, m = 0, s = 0] = v.map(toNumber);
    return d + m / 60 + s / 3600;
  }
  if (typeof v === 'string') {
    if (v.includes(',')) return toNumber(v.split(',').map((x) => x.trim()));
    if (v.includes('/')) {
      const [a, b] = v.split('/').map(Number);
      return b ? a / b : NaN;
    }
    return Number(v);
  }
  return NaN;
}

export function gpsFromExif(exif) {
  if (!exif) return null;
  const g = exif['{GPS}'] || exif.GPS || null;
  let lat = toNumber(g ? g.Latitude : exif.GPSLatitude);
  let lng = toNumber(g ? g.Longitude : exif.GPSLongitude);
  const latRef = String((g ? g.LatitudeRef : exif.GPSLatitudeRef) ?? '').toUpperCase();
  const lngRef = String((g ? g.LongitudeRef : exif.GPSLongitudeRef) ?? '').toUpperCase();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (latRef === 'S' && lat > 0) lat = -lat;
  if (lngRef === 'W' && lng > 0) lng = -lng;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { latitude: lat, longitude: lng };
}
