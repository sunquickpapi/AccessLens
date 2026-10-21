// AI-assisted photo assessment.
//
// The photo is sent to the AccessLens AI server (ai-server/ in this project),
// which runs two free, open-source zero-shot models on your laptop:
//   CLIP     → which barrier type the photo matches, and how confidently
//   OWL-ViT  → where the suspected barrier is (the dashed box)
//
// The app finds the server automatically: it's on the same computer that runs
// `npx expo start`, port 8000. To point somewhere else, start Expo with
//   EXPO_PUBLIC_AI_URL=http://192.168.1.20:8000 npx expo start
//
// The AI only *suggests*. The resident confirms or corrects the category,
// and staff verify before any action is taken. If the server can't be
// reached, the resident simply chooses the category themselves.

import { Platform } from 'react-native';
import Constants from 'expo-constants';

export const AI_PORT = 8000;
export const UNCERTAIN_BELOW = 0.5;
const TIMEOUT_MS = 30000;

// Prototype-only switch: if true, a random stand-in is used when the server is
// unreachable (clearly labelled "simulated"). Leave false for honest demos.
export const SIMULATE_WHEN_OFFLINE = false;

// Address typed in Settings → Server connection (wins over everything else).
let manualUrl = null;
export function setManualAIUrl(url) {
  manualUrl = url && url.trim() ? url.trim() : null;
}

function cleanUrl(u) {
  let url = u.trim().replace(/\/+$/, '').replace(/\/(analyse|health)$/, '');
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (!/:\d+$/.test(url.replace(/^https?:\/\//i, ''))) url = `${url}:${AI_PORT}`;
  return url;
}

function hostFrom(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.replace(/^[a-z]+:\/\//i, '').match(/^([^/:?#]+)/);
  const host = m?.[1];
  // Tunnel addresses (…exp.direct) point at Expo's servers, not your laptop.
  if (!host || /exp\.direct|ngrok|expo\.dev|expo\.io/.test(host)) return null;
  return host;
}

// Every place Expo Go might tell us which computer the app was loaded from.
export function detectedHosts() {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    Constants.manifest2?.extra?.expoGo?.debuggerHost,
    Constants.manifest?.debuggerHost,
    Constants.linkingUri,
    Constants.experienceUrl,
  ];
  try {
    const getDevServer = require('react-native/Libraries/Core/Devtools/getDevServer').default;
    candidates.push(getDevServer()?.url);
  } catch {
    // not available in this build
  }
  return [...new Set(candidates.map(hostFrom).filter(Boolean))];
}

export function aiBaseUrl() {
  if (manualUrl) return cleanUrl(manualUrl);
  const envUrl = process.env.EXPO_PUBLIC_AI_URL;
  if (envUrl) return cleanUrl(envUrl);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `http://${window.location.hostname || 'localhost'}:${AI_PORT}`;
  }
  const host = detectedHosts()[0];
  return host ? `http://${host}:${AI_PORT}` : null;
}

async function withTimeout(promiseFactory, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export class AIUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AIUnavailableError';
  }
}

export async function checkAI() {
  const base = aiBaseUrl();
  if (!base) return { ok: false, url: null, reason: 'Couldn’t work out your laptop’s address. Type it in below.' };
  try {
    const res = await withTimeout((signal) => fetch(`${base}/health`, { signal }), 8000);
    const body = await res.json();
    return { ok: !!body.ok, url: base, model: body.model, aiOn: body.ai !== false && !!body.model, database: !!body.database };
  } catch (e) {
    const why = e?.name === 'AbortError' ? 'timed out after 8 s' : e?.message || 'network error';
    return { ok: false, url: base, reason: `Not reachable (${why}). Is “npm run ai” running, and is this phone on the same Wi-Fi?` };
  }
}

// Expo SDK 57 replaces global fetch with expo/fetch, which can't upload a
// React Native { uri, name, type } file part. XMLHttpRequest still uses React
// Native's own networking, which streams the photo from disk, so we upload with it.
export function xhrUpload(url, form, ms, headers = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.timeout = ms;
    xhr.onload = () => {
      let json = {};
      try {
        json = JSON.parse(xhr.responseText || '{}');
      } catch {
        // non-JSON reply
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.ontimeout = () => reject(new Error(`timed out after ${ms / 1000} s`));
    xhr.send(form);
  });
}

async function remoteAnalyse(uri) {
  const base = aiBaseUrl();
  if (!base) throw new AIUnavailableError('Couldn’t work out the AI server’s address. Set it in Settings → Server connection.');
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('photo', blob, 'barrier.jpg');
  } else {
    form.append('photo', { uri, name: 'barrier.jpg', type: 'image/jpeg' });
  }
  let res;
  try {
    res = await xhrUpload(`${base}/analyse`, form, TIMEOUT_MS);
  } catch (e) {
    throw new AIUnavailableError(`Couldn’t reach the AI at ${base} (${e?.message || 'network error'}).`);
  }
  if (!res.ok) throw new Error(res.json.error || `AI server returned ${res.status}`);
  return res.json;
}

// ----- prototype stand-in (only used if SIMULATE_WHEN_OFFLINE) -----
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function simulated(uri) {
  let s = hash(uri) || 1;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const keys = ['obstruction', 'surface', 'steps'];
  const raw = keys.map(() => 0.15 + r());
  const top = Math.floor(r() * keys.length);
  raw[top] += 0.4 + r() * 1.4;
  const total = raw.reduce((a, b) => a + b, 0);
  const scores = Object.fromEntries(keys.map((k, i) => [k, raw[i] / total]));
  return { category: keys[top], confidence: scores[keys[top]], scores, box: null, noBarrier: false, severity: 'difficult', model: 'simulated' };
}

function normalise(raw) {
  const confidence = Number(raw.confidence) || 0;
  return {
    category: raw.noBarrier ? null : raw.category,
    confidence,
    scores: raw.scores ?? {},
    box: raw.box ?? null,
    noBarrier: !!raw.noBarrier,
    uncertain: raw.uncertain ?? confidence < UNCERTAIN_BELOW,
    severity: raw.noBarrier ? null : raw.severity ?? null,
    severityScores: raw.severityScores ?? null,
    walkway: raw.walkway ?? null, // how sure the AI is the photo shows a walkway at all
    reason: raw.reason ?? null, // not_walkway | clear_walkway when there's no barrier
    model: raw.model ?? 'unknown',
  };
}

export async function analysePhoto(uri) {
  try {
    return normalise(await remoteAnalyse(uri));
  } catch (e) {
    if (SIMULATE_WHEN_OFFLINE && e instanceof AIUnavailableError) {
      await new Promise((done) => setTimeout(done, 1200));
      return normalise(simulated(uri));
    }
    throw e;
  }
}

export function confidenceWords(confidence) {
  if (confidence >= 0.75) return 'High confidence';
  if (confidence >= UNCERTAIN_BELOW) return 'Medium confidence';
  return 'Low confidence — please check';
}

export const SCORE_LABELS = { obstruction: 'Obstruction', surface: 'Surface damage', steps: 'Steps', none: 'No barrier' };
