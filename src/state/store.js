import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATEGORIES, STAGES } from '../lib/catalog';
import { notifyUpdate } from '../lib/notify';
import { seedReports, seedUpdates } from './seed';

const KEY = 'accesslens/v1';

const DEFAULT_SETTINGS = {
  onboarded: false,
  textScale: 'standard',
  largeControls: false,
  readAloud: false, // speak AI results and step instructions
  haptics: true,
  notifications: true,
  getAround: [], // optional: how the resident gets around (pre-fills "who it affects")
  name: '',
};

const EMPTY_DRAFT = {
  photoUri: null,
  location: null, // { latitude, longitude, address, confirmed }
  landmark: '',
  ai: null, // AI suggestion
  aiState: 'idle', // idle | running | done | error
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

function nextCode(reports) {
  const n = reports.reduce((m, r) => Math.max(m, parseInt(r.code.split('-')[1], 10) || 0), 140) + 1;
  return `AL-${String(n).padStart(4, '0')}`;
}

export function StoreProvider({ children }) {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [reports, setReports] = useState(seedReports);
  const [updates, setUpdates] = useState(seedUpdates);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const firstSave = useRef(true);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
        if (data.reports) setReports(data.reports);
        if (data.updates) setUpdates(data.updates);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    AsyncStorage.setItem(KEY, JSON.stringify({ settings, reports, updates })).catch(() => {});
  }, [loaded, settings, reports, updates]);

  const updateSettings = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);
  const updateDraft = useCallback((patch) => setDraft((d) => ({ ...d, ...patch })), []);
  const resetDraft = useCallback(() => setDraft(EMPTY_DRAFT), []);

  const pushUpdate = useCallback(
    (reportId, title, body) => {
      const item = { id: `u${Date.now()}${Math.random().toString(36).slice(2, 6)}`, reportId, title, body, at: nowIso(), read: false };
      setUpdates((u) => [item, ...u]);
      if (settings.notifications) notifyUpdate(title, body, reportId);
    },
    [settings.notifications]
  );

  const submitDraft = useCallback(() => {
    const at = nowIso();
    const created = {
        id: `r${Date.now()}`,
        code: nextCode(reports),
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
        description: draft.description,
        voiceUri: draft.voiceUri,
        voiceSeconds: draft.voiceSeconds,
        stage: 'ai',
        assignedTo: null,
        completionPhotoUri: null,
        timeline: [
          { stage: 'report', at, note: 'Photo and location submitted.' },
          {
            stage: 'ai',
            at,
            note: draft.categoryCorrected
              ? `AI suggested ${CATEGORIES[draft.ai?.category]?.label ?? 'a category'}; you corrected it to ${CATEGORIES[draft.category].label}.`
              : `AI flagged possible ${CATEGORIES[draft.category].noun.replace(/^an? /, '')}; you confirmed it.`,
          },
        ],
      };
    setReports((list) => [created, ...list]);
    pushUpdate(created.id, `${created.code} received`, 'Thanks. Township staff will review your report and assign the right team.');
    return created;
  }, [draft, reports, pushUpdate]);

  // Prototype-only: plays the staff side of the journey so the full
  // report-to-resolution workflow can be demonstrated without the website.
  const simulateStaffStep = useCallback(
    (id, completionPhotoUri) => {
      const r = reports.find((x) => x.id === id);
      if (!r) return;
      const at = nowIso();
      let patch;
      let msg;
      if (r.stage === 'report' || r.stage === 'ai') {
        patch = { stage: 'review', assignedTo: null };
        msg = ['Report verified', `Staff checked ${r.code} and confirmed it is ${CATEGORIES[r.category].noun}.`];
      } else if (r.stage === 'review' && !r.assignedTo) {
        const team = CATEGORIES[r.category].team;
        patch = { assignedTo: team };
        msg = ['Repair work assigned', `${r.code} has been assigned to the ${team} team for inspection and repair.`];
      } else if (r.stage === 'review') {
        patch = { stage: 'completion', completionPhotoUri: completionPhotoUri ?? 'illustration:fixed' };
        msg = ['Fix submitted', `The ${r.assignedTo} team uploaded a completion photo for ${r.code}. Staff are checking it.`];
      } else if (r.stage === 'completion') {
        patch = { stage: 'confirmed', resolvedAt: at };
        msg = ['Barrier resolved', `Staff confirmed ${r.code} is fixed. Thank you for making the walkway better for everyone.`];
      } else {
        return;
      }
      const stage = patch.stage ?? r.stage;
      setReports((list) =>
        list.map((x) => (x.id === id ? { ...x, ...patch, timeline: [...x.timeline, { stage, at, note: msg[1] }] } : x))
      );
      pushUpdate(id, msg[0], msg[1]);
    },
    [reports, pushUpdate]
  );

  const markAllRead = useCallback(() => setUpdates((u) => u.map((x) => ({ ...x, read: true }))), []);
  const markRead = useCallback((reportId) => setUpdates((u) => u.map((x) => (x.reportId === reportId ? { ...x, read: true } : x))), []);

  const resetDemo = useCallback(() => {
    setReports(seedReports);
    setUpdates(seedUpdates);
    setDraft(EMPTY_DRAFT);
  }, []);

  const value = useMemo(
    () => ({
      loaded,
      settings,
      updateSettings,
      reports,
      updates,
      unread: updates.filter((u) => !u.read).length,
      draft,
      updateDraft,
      resetDraft,
      submitDraft,
      simulateStaffStep,
      markAllRead,
      markRead,
      resetDemo,
      stages: STAGES,
    }),
    [loaded, settings, updateSettings, reports, updates, draft, updateDraft, resetDraft, submitDraft, simulateStaffStep, markAllRead, markRead, resetDemo]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be inside StoreProvider');
  return v;
}
