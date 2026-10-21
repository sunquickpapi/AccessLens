import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATEGORIES, STAGES } from '../lib/catalog';
import { setManualAIUrl } from '../lib/ai';
import { api, uploadReport } from '../lib/api';
import { notifyUpdate } from '../lib/notify';
import { autoFieldsFor } from '../lib/autofill';

// Reports and updates live in the AccessLens server database. The app keeps a
// copy on the phone so it still opens offline, and queues new reports until
// the server can be reached.

const KEY = 'accesslens/v2';
const POLL_MS = 10000;

const DEFAULT_SETTINGS = {
  onboarded: false,
  textScale: 'standard',
  largeControls: false,
  readAloud: false, // speak AI results and step instructions
  haptics: true,
  notifications: true,
  getAround: [], // optional: how the resident gets around (pre-fills "who it affects")
  name: '',
  aiUrl: '', // optional manual server address
  residentToken: null, // this phone's anonymous ID on the server
};

const EMPTY_DRAFT = {
  startedAt: null,
  photoUri: null,
  location: null, // { latitude, longitude, address, confirmed }
  locationSource: null, // camera | photo | current | manual | none
  locState: 'idle', // idle | finding | ready
  suggested: {}, // what the app filled in from the photo (see lib/autofill.js)
  landmark: '',
  ai: null, // AI suggestion
  aiState: 'idle', // idle | running | done | error
  aiError: null,
  category: null, // final category the resident confirms
  categoryCorrected: false,
  affected: [],
  impacts: [],
  severity: null,
  description: '',
  voiceUri: null,
  voiceSeconds: 0,
};

const Ctx = createContext(null);

function nowIso() {
  return new Date().toISOString();
}

export function StoreProvider({ children }) {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [reports, setReports] = useState([]); // server reports
  const [pending, setPending] = useState([]); // reports waiting to upload
  const [updates, setUpdates] = useState([]);
  const [publicReports, setPublicReports] = useState([]);
  const [idMap, setIdMap] = useState({}); // local id -> server id after upload
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [connection, setConnection] = useState({ ok: null, error: null, lastSync: null, syncing: false });

  const tokenRef = useRef(null);
  const seenUpdates = useRef(null);
  const syncing = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  // ---------- load & save the phone's copy
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(async (raw) => {
        if (!raw) {
          // Upgrading from the first version: keep the resident's settings, drop the old demo reports.
          const old = await AsyncStorage.getItem('accesslens/v1').catch(() => null);
          const oldSettings = old ? JSON.parse(old)?.settings : null;
          if (oldSettings) setSettings({ ...DEFAULT_SETTINGS, ...oldSettings, residentToken: null });
          return;
        }
        const data = JSON.parse(raw);
        if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
        if (data.reports) setReports(data.reports);
        if (data.pending) setPending(data.pending);
        if (data.updates) setUpdates(data.updates);
        if (data.idMap) setIdMap(data.idMap);
        if (data.updates) seenUpdates.current = new Set(data.updates.map((u) => u.id));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(KEY, JSON.stringify({ settings, reports, pending, updates, idMap })).catch(() => {});
  }, [loaded, settings, reports, pending, updates, idMap]);

  useEffect(() => {
    setManualAIUrl(settings.aiUrl);
  }, [settings.aiUrl]);

  tokenRef.current = settings.residentToken;

  const updateSettings = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);
  // patch can be an object or a function of the current draft
  const updateDraft = useCallback((patch) => setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) })), []);
  const resetDraft = useCallback(() => setDraft({ ...EMPTY_DRAFT, startedAt: nowIso() }), []);

  // ---------- server sync
  const ensureToken = useCallback(async (force = false) => {
    if (tokenRef.current && !force) return tokenRef.current;
    const s = settingsRef.current;
    const { token } = await api.register({ name: s.name, getAround: s.getAround });
    tokenRef.current = token;
    setSettings((cur) => ({ ...cur, residentToken: token }));
    return token;
  }, []);

  const withToken = useCallback(
    async (fn) => {
      const token = await ensureToken();
      try {
        return await fn(token);
      } catch (e) {
        // The server's database was reset: register this phone again.
        if (e?.status === 401) return fn(await ensureToken(true));
        throw e;
      }
    },
    [ensureToken]
  );

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setConnection((c) => ({ ...c, syncing: true }));
    try {
      // 1. upload anything that was waiting
      const queue = pendingRef.current;
      for (const item of queue) {
        try {
          const created = await withToken((t) => uploadReport(t, item));
          setPending((p) => p.filter((x) => x.id !== item.id));
          setIdMap((m) => ({ ...m, [item.id]: created.id }));
        } catch (e) {
          if (e?.status && e.status >= 400 && e.status < 500 && e.status !== 401) {
            // the server refused this report; keep it but mark the problem
            setPending((p) => p.map((x) => (x.id === item.id ? { ...x, uploadError: e.message } : x)));
          } else {
            throw e;
          }
        }
      }
      // 2. download my reports and updates
      const [{ reports: mine }, { updates: ups }] = await withToken((t) => Promise.all([api.myReports(t), api.myUpdates(t)]));
      setReports(mine);
      setUpdates(ups);
      // 3. phone notifications for updates we haven't seen before
      if (seenUpdates.current) {
        const fresh = ups.filter((u) => !u.read && !seenUpdates.current.has(u.id));
        if (settingsRef.current.notifications) fresh.slice(0, 3).forEach((u) => notifyUpdate(u.title, u.body, u.reportId));
      }
      seenUpdates.current = new Set(ups.map((u) => u.id));
      api.publicReports().then((d) => setPublicReports(d.reports)).catch(() => {});
      setConnection({ ok: true, error: null, lastSync: nowIso(), syncing: false });
    } catch (e) {
      setConnection((c) => ({ ...c, ok: false, error: e?.message ?? 'Can’t reach the server', syncing: false }));
    } finally {
      syncing.current = false;
    }
  }, [withToken]);

  // poll while the app is open
  useEffect(() => {
    if (!loaded || !settings.onboarded) return undefined;
    sync();
    let timer = setInterval(sync, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      clearInterval(timer);
      if (state === 'active') {
        sync();
        timer = setInterval(sync, POLL_MS);
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [loaded, settings.onboarded, settings.aiUrl, sync]);

  // keep the resident's optional profile in step with the server
  useEffect(() => {
    if (!loaded || !settings.residentToken) return undefined;
    const t = setTimeout(() => {
      api.updateProfile(settings.residentToken, { name: settings.name, getAround: settings.getAround }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [loaded, settings.residentToken, settings.name, settings.getAround]);

  // ---------- reporting
  const submitDraft = useCallback(() => {
    const at = nowIso();
    const started = draft.startedAt ? new Date(draft.startedAt).getTime() : null;
    const local = {
      id: `local-${Date.now()}`,
      code: 'Sending…',
      createdAt: at,
      photoUri: draft.photoUri,
      location: draft.location,
      landmark: draft.landmark,
      ai: draft.ai,
      category: draft.category,
      categoryCorrected: draft.categoryCorrected,
      affected: draft.affected,
      impacts: draft.impacts,
      severity: draft.severity,
      autoFields: autoFieldsFor(draft),
      locationSource: draft.locationSource,
      description: draft.description,
      voiceUri: draft.voiceUri,
      voiceSeconds: draft.voiceSeconds,
      reportSeconds: started ? Math.round((Date.now() - started) / 1000) : null,
      stage: 'report',
      assignedTo: null,
      completionPhotoUri: null,
      synced: false,
      timeline: [{ stage: 'report', at, note: `Photo and location ready to send (${CATEGORIES[draft.category].label}).` }],
    };
    setPending((p) => [local, ...p]);
    setDraft(EMPTY_DRAFT);
    setTimeout(sync, 0);
    return local;
  }, [draft, sync]);

  const sendFeedback = useCallback(
    async (id, fixed, comment, extra) => {
      const { report } = await withToken((t) => api.feedback(t, id, fixed, comment, extra));
      setReports((list) => list.map((r) => (r.id === report.id ? report : r)));
    },
    [withToken]
  );

  const markAllRead = useCallback(() => {
    setUpdates((u) => u.map((x) => ({ ...x, read: true })));
    withToken((t) => api.markRead(t)).catch(() => {});
  }, [withToken]);

  const markRead = useCallback(
    (reportId) => {
      let changed = false;
      setUpdates((u) =>
        u.map((x) => {
          if (x.reportId === reportId && !x.read) {
            changed = true;
            return { ...x, read: true };
          }
          return x;
        })
      );
      if (changed && !String(reportId).startsWith('local-')) withToken((t) => api.markRead(t, reportId)).catch(() => {});
    },
    [withToken]
  );

  // Forget this phone's data (the server keeps its records).
  const resetDemo = useCallback(() => {
    setReports([]);
    setPending([]);
    setUpdates([]);
    setIdMap({});
    setDraft(EMPTY_DRAFT);
    seenUpdates.current = null;
    tokenRef.current = null;
    setSettings((s) => ({ ...s, residentToken: null }));
    setTimeout(sync, 0);
  }, [sync]);

  const allReports = useMemo(() => [...pending, ...reports], [pending, reports]);
  const findReport = useCallback(
    (id) => {
      const real = idMap[id] ?? id;
      return allReports.find((r) => r.id === real || r.id === id);
    },
    [allReports, idMap]
  );

  const value = useMemo(
    () => ({
      loaded,
      settings,
      updateSettings,
      reports: allReports,
      publicReports,
      updates,
      unread: updates.filter((u) => !u.read).length,
      connection,
      sync,
      findReport,
      draft,
      updateDraft,
      resetDraft,
      submitDraft,
      sendFeedback,
      markAllRead,
      markRead,
      resetDemo,
      stages: STAGES,
    }),
    [loaded, settings, updateSettings, allReports, publicReports, updates, connection, sync, findReport, draft, updateDraft, resetDraft, submitDraft, sendFeedback, markAllRead, markRead, resetDemo]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be inside StoreProvider');
  return v;
}
