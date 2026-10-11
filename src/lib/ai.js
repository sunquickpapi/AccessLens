// AI-assisted photo assessment.
//
// The prototype ships with an on-device stand-in so the full flow can be
// demonstrated without a trained model. Set AI_ENDPOINT to a server that
// accepts a multipart "photo" field and returns the same JSON shape
// (category, confidence, scores, box) and the app will use it instead.
//
// The AI only *suggests*. The resident confirms or corrects the category,
// and staff verify before any action is taken.

import { CATEGORY_KEYS } from './catalog';

export const AI_ENDPOINT = null; // e.g. 'https://your-server/analyse'
export const UNCERTAIN_BELOW = 0.6;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function remoteAnalyse(uri) {
  const body = new FormData();
  body.append('photo', { uri, name: 'barrier.jpg', type: 'image/jpeg' });
  const res = await fetch(AI_ENDPOINT, { method: 'POST', body });
  if (!res.ok) throw new Error(`AI service returned ${res.status}`);
  return res.json();
}

function simulatedAnalyse(uri) {
  const r = rng(hash(uri));
  const raw = CATEGORY_KEYS.map(() => 0.15 + r());
  const top = Math.floor(r() * raw.length);
  raw[top] += 0.4 + r() * 1.4; // sometimes clear-cut, sometimes not
  const total = raw.reduce((a, b) => a + b, 0);
  const scores = Object.fromEntries(CATEGORY_KEYS.map((k, i) => [k, raw[i] / total]));
  const w = 0.35 + r() * 0.25;
  const h = 0.3 + r() * 0.25;
  return {
    category: CATEGORY_KEYS[top],
    confidence: scores[CATEGORY_KEYS[top]],
    scores,
    // Suspected feature, as fractions of the image (x, y, width, height).
    box: { x: 0.1 + r() * (0.8 - w), y: 0.25 + r() * (0.65 - h), w, h },
    model: 'prototype-simulated',
  };
}

export async function analysePhoto(uri) {
  if (AI_ENDPOINT) {
    try {
      const result = await remoteAnalyse(uri);
      return { ...result, uncertain: result.confidence < UNCERTAIN_BELOW };
    } catch {
      // fall through to the stand-in so the resident is never blocked
    }
  }
  await new Promise((done) => setTimeout(done, 1600));
  const result = simulatedAnalyse(uri);
  return { ...result, uncertain: result.confidence < UNCERTAIN_BELOW };
}

export function confidenceWords(confidence) {
  if (confidence >= 0.8) return 'High confidence';
  if (confidence >= UNCERTAIN_BELOW) return 'Medium confidence';
  return 'Low confidence — please check';
}
