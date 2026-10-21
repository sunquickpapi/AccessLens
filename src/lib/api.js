// Talks to the AccessLens server (the same server that runs the AI and the
// staff website). Reports, updates and staff actions all live in its database.

import { Platform } from 'react-native';
import { aiBaseUrl, xhrUpload } from './ai';

const TIMEOUT_MS = 12000;
const UPLOAD_TIMEOUT_MS = 60000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function serverUrl() {
  return aiBaseUrl();
}

async function request(path, { method = 'GET', json, token } = {}) {
  const base = serverUrl();
  if (!base) throw new ApiError('No server address. Set it in Settings → Server connection.', 0);
  const headers = {};
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Resident-Token'] = token;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    throw new ApiError(e?.name === 'AbortError' ? 'The server took too long to reply.' : 'Can’t reach the AccessLens server.', 0);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Server error ${res.status}`, res.status);
  return data;
}

export const api = {
  register: (profile) => request('/api/residents', { method: 'POST', json: profile }),
  updateProfile: (token, profile) => request('/api/residents/me', { method: 'PATCH', json: profile, token }),
  myReports: (token) => request('/api/residents/me/reports', { token }),
  myUpdates: (token) => request('/api/residents/me/updates', { token }),
  markRead: (token, reportId) => request('/api/residents/me/updates/read', { method: 'POST', json: reportId ? { reportId } : {}, token }),
  feedback: (token, id, fixed, comment, extra = {}) => request(`/api/reports/${id}/feedback`, { method: 'POST', json: { fixed, comment, ...extra }, token }),
  publicReports: () => request('/api/public/reports'),
};

async function filePart(uri, name, type) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return [blob, name];
  }
  return [{ uri, name, type }];
}

// Sends a finished report with its photo and optional voice note.
export async function uploadReport(token, report) {
  const base = serverUrl();
  if (!base) throw new ApiError('No server address.', 0);
  const form = new FormData();
  form.append('photo', ...(await filePart(report.photoUri, 'barrier.jpg', 'image/jpeg')));
  if (report.voiceUri) {
    const ext = report.voiceUri.split('.').pop()?.toLowerCase() || 'm4a';
    form.append('voice', ...(await filePart(report.voiceUri, `voice.${ext}`, ext === 'webm' ? 'audio/webm' : 'audio/m4a')));
  }
  form.append(
    'data',
    JSON.stringify({
      createdAt: report.createdAt,
      location: report.location,
      landmark: report.landmark,
      ai: report.ai,
      category: report.category,
      affected: report.affected,
      impacts: report.impacts,
      severity: report.severity,
      autoFields: report.autoFields,
      locationSource: report.locationSource,
      description: report.description,
      voiceSeconds: report.voiceSeconds,
      reportSeconds: report.reportSeconds,
    })
  );
  let res;
  try {
    res = await xhrUpload(`${base}/api/reports`, form, UPLOAD_TIMEOUT_MS, { 'X-Resident-Token': token });
  } catch (e) {
    throw new ApiError(`Can’t reach the AccessLens server (${e?.message ?? 'network error'}).`, 0);
  }
  if (!res.ok) throw new ApiError(res.json.error || `Server error ${res.status}`, res.status);
  return res.json.report;
}
