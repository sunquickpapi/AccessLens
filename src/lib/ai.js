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

export function aiBaseUrl() {
  const override = process.env.EXPO_PUBLIC_AI_URL;
  if (override) return override.replace(/\/+$/, '').replace(/\/analyse$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `http://${window.location.hostname || 'localhost'}:${AI_PORT}`;
  }
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? '';
  const host = hostUri.split(':')[0];
  // Tunnel addresses (…exp.direct) point at Expo's servers, not your laptop.
  if (!host || host.includes('exp.direct') || host.includes('ngrok')) return null;
  return `http://${host}:${AI_PORT}`;
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
  if (!base) return { ok: false, url: null, reason: 'No AI server address (tunnel mode). Set EXPO_PUBLIC_AI_URL.' };
  try {
    const res = await withTimeout((signal) => fetch(`${base}/health`, { signal }), 5000);
    const body = await res.json();
    return { ok: !!body.ok, url: base, model: body.model };
  } catch {
    return { ok: false, url: base, reason: 'Not reachable. Is ./start-ai.sh running on the same Wi-Fi?' };
  }
}

async function remoteAnalyse(uri) {
  const base = aiBaseUrl();
  if (!base) throw new AIUnavailableError('No AI server address');
  const body = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    body.append('photo', blob, 'barrier.jpg');
  } else {
    body.append('photo', { uri, name: 'barrier.jpg', type: 'image/jpeg' });
  }
  let res;
  try {
    res = await withTimeout((signal) => fetch(`${base}/analyse`, { method: 'POST', body, signal }), TIMEOUT_MS);
  } catch {
    throw new AIUnavailableError('AI server not reachable');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `AI server returned ${res.status}`);
  return json;
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
  return { category: keys[top], confidence: scores[keys[top]], scores, box: null, noBarrier: false, model: 'simulated' };
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
