import { useCallback } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useStore } from '../state/store';
import { TEXT_SCALES, targets } from './theme';

// Shared accessibility helpers: text scale, control size, read-aloud, haptics.
export function useUI() {
  const { settings } = useStore();
  const scale = TEXT_SCALES.find((s) => s.key === settings.textScale)?.scale ?? 1;
  const target = settings.largeControls ? targets.large : targets.normal;

  const fs = useCallback((size) => Math.round(size * scale), [scale]);

  const say = useCallback(
    (text, { force = false } = {}) => {
      if (!text) return;
      // Screen reader users already hear announcements; read-aloud is for everyone else.
      AccessibilityInfo.announceForAccessibility?.(text);
      if (settings.readAloud || force) {
        Speech.stop();
        Speech.speak(text, { language: 'en-GB', rate: 0.95 });
      }
    },
    [settings.readAloud]
  );

  const tap = useCallback(
    (kind = 'light') => {
      if (!settings.haptics || Platform.OS === 'web') return;
      if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
    [settings.haptics]
  );

  return { scale, fs, target, say, tap, large: settings.largeControls };
}

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) +
    ', ' + d.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' });
}
