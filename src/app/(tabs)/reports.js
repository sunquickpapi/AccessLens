import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { Screen, Wrap } from '../../components/Layout';
import Photo from '../../components/Photo';
import StatusPill from '../../components/StatusPill';
import Txt from '../../components/Txt';
import { CATEGORIES, STAGES, stageIndex } from '../../lib/catalog';
import { colors, radius, border } from '../../lib/theme';
import { timeAgo } from '../../lib/ui';
import { useStore } from '../../state/store';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'In progress' },
  { key: 'done', label: 'Resolved' },
];

export default function MyReports() {
  const { reports, resetDraft, sync, connection } = useStore();
  const [filter, setFilter] = useState('all');
  const finished = (r) => ['confirmed', 'closed'].includes(r.stage);
  const list = reports.filter((r) => (filter === 'all' ? true : filter === 'open' ? !finished(r) : finished(r)));

  return (
    <Screen onRefresh={sync}>
      <Txt v="display" style={{ marginTop: 8 }}>
        My reports
      </Txt>
      <Txt v="body" color={colors.muted} style={{ marginTop: 4, marginBottom: 16 }}>
        Track progress from report to fix. Pull down to refresh.
      </Txt>
      {connection.ok === false ? (
        <Txt v="small" color={colors.red} style={{ marginBottom: 12 }}>
          Offline: showing the last saved copy. {connection.error}
        </Txt>
      ) : null}
      <Wrap>
        {FILTERS.map((f) => (
          <Chip key={f.key} multi={false} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </Wrap>

      <View style={{ gap: 14, marginTop: 18 }}>
        {list.map((r) => {
          const closed = r.stage === 'closed';
          const idx = Math.max(0, stageIndex(r));
          const code = r.synced === false ? 'New' : r.code;
          return (
            <Pressable
              key={r.id}
              onPress={() => router.push(`/track/${r.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${code}, ${CATEGORIES[r.category].label}, ${r.location?.address ?? ''}. ${closed ? 'Closed' : `Stage ${idx + 1} of 5, ${STAGES[idx].label}`}.`}
              accessibilityHint="Opens the report tracker"
              style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.paper }]}
            >
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 96 }}>
                  <Photo uri={r.photoUri} aspect={1} style={{ borderRadius: radius.sm }} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt v="label" color={colors.muted}>
                    {code} · {timeAgo(r.createdAt)}
                  </Txt>
                  <Txt v="h2">{CATEGORIES[r.category].label}</Txt>
                  <Txt v="small" color={colors.muted} numberOfLines={2}>
                    {r.location?.address}
                  </Txt>
                  <StatusPill report={r} />
                </View>
                <Icon name="chevron" />
              </View>
              <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {STAGES.map((s, i) => (
                  <View key={s.key} style={[styles.seg, !closed && i <= idx && { backgroundColor: r.stage === 'confirmed' ? colors.ink : colors.red }]} />
                ))}
              </View>
              <Txt v="small" style={{ marginTop: 6 }}>
                {closed ? 'Closed' : STAGES[idx].label}
              </Txt>
            </Pressable>
          );
        })}
        {list.length === 0 ? (
          <View style={styles.empty}>
            <Txt v="h2" center>
              Nothing here yet
            </Txt>
            <Txt v="small" center color={colors.muted} style={{ marginVertical: 8 }}>
              Reports you send will show up here with their progress.
            </Txt>
            <Button
              label="Report a barrier"
              icon={<Icon name="camera" color={colors.cream} />}
              onPress={() => {
                resetDraft();
                router.push('/report/photo');
              }}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: border, borderColor: colors.ink, borderRadius: radius.lg, padding: 12, backgroundColor: colors.cream },
  progress: { flexDirection: 'row', gap: 4, marginTop: 12 },
  seg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.paper, borderWidth: 1.5, borderColor: colors.ink },
  empty: { padding: 20, borderWidth: border, borderStyle: 'dashed', borderColor: colors.ink, borderRadius: radius.lg },
});
