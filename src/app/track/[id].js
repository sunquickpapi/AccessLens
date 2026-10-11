import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import { Card, Screen, Section } from '../../components/Layout';
import MapPreview from '../../components/MapPreview';
import Photo from '../../components/Photo';
import StatusPill from '../../components/StatusPill';
import Tracker from '../../components/Tracker';
import Txt from '../../components/Txt';
import { AFFECTED, CATEGORIES, IMPACTS, SEVERITY, stageIndex } from '../../lib/catalog';
import { colors, radius, border } from '../../lib/theme';
import { formatDate, timeAgo, useUI } from '../../lib/ui';
import { useStore } from '../../state/store';

function VoicePlayback({ uri, seconds }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  return (
    <Button
      small
      variant="outline"
      label={status.playing ? 'Pause voice description' : `Play voice description (${seconds}s)`}
      icon={<Icon name={status.playing ? 'stop' : 'play'} size={18} />}
      onPress={() => {
        if (status.playing) player.pause();
        else {
          if (status.didJustFinish) player.seekTo(0);
          player.play();
        }
      }}
    />
  );
}

function Detail({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.detail}>
      <Txt v="label" color={colors.muted}>
        {label}
      </Txt>
      <Txt v="body">{value}</Txt>
    </View>
  );
}

function nextStaffAction(r) {
  if (r.stage === 'report' || r.stage === 'ai') return 'Staff verify the report';
  if (r.stage === 'review' && !r.assignedTo) return 'Staff assign repair work';
  if (r.stage === 'review') return 'Worker submits completion photo';
  if (r.stage === 'completion') return 'Staff confirm completion';
  return null;
}

export default function TrackReport() {
  const { id } = useLocalSearchParams();
  const { reports, updates, markRead, simulateStaffStep } = useStore();
  const { say } = useUI();
  const r = reports.find((x) => x.id === id);

  useEffect(() => {
    if (r) markRead(r.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, r?.stage, r?.assignedTo]);

  if (!r) {
    return (
      <Screen>
        <Txt v="h1">Report not found</Txt>
        <Button label="Back" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  const cat = CATEGORIES[r.category];
  const idx = stageIndex(r);
  const reportUpdates = updates.filter((u) => u.reportId === r.id);
  const names = (keys, list) => keys.map((k) => list.find((x) => x.key === k)?.label).filter(Boolean).join(', ');
  const next = nextStaffAction(r);

  const needsPhoto = r.stage === 'review' && !!r.assignedTo;

  const simulate = async (pickPhoto) => {
    let photo;
    if (pickPhoto) {
      try {
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (res.canceled) return;
        photo = res.assets?.[0]?.uri;
      } catch {
        return;
      }
    }
    simulateStaffStep(r.id, photo);
    say(`Update: ${next}.`);
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/reports'))} accessibilityRole="button" accessibilityLabel="Go back" style={styles.iconBtn} hitSlop={10}>
          <Icon name="back" />
        </Pressable>
        <Txt v="label">Report {r.code}</Txt>
        <View style={{ width: 48 }} />
      </View>

      <Txt v="display" style={{ marginTop: 16 }}>
        {cat.label}
      </Txt>
      <Txt v="body" color={colors.muted} style={{ marginTop: 4, marginBottom: 10 }}>
        {r.location?.address ?? 'Pinned location'}
        {r.landmark ? ` · ${r.landmark}` : ''}
      </Txt>
      <StatusPill report={r} />

      <Section title={`Progress · stage ${Math.min(idx + 1, 5)} of 5`}>
        <Tracker report={r} />
      </Section>

      {r.completionPhotoUri ? (
        <Section title="Completion evidence">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Txt v="label">Before</Txt>
              <Photo uri={r.photoUri} aspect={1} label="Before: your original photo" />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Txt v="label" color={colors.red}>
                After
              </Txt>
              <Photo uri={r.completionPhotoUri} aspect={1} label="After: completion photo from the maintenance team" />
            </View>
          </View>
          <Txt v="small" color={colors.muted} style={{ marginTop: 8 }}>
            {r.stage === 'confirmed' ? `Confirmed by staff ${r.resolvedAt ? timeAgo(r.resolvedAt) : ''}.` : 'Staff are checking this photo before closing the report.'}
          </Txt>
        </Section>
      ) : null}

      <Section title="Your report">
        <Photo uri={r.photoUri} ai={r.ai} showBox={!!r.ai} />
        {r.ai ? (
          <Card tone="paper" style={{ marginTop: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Icon name="spark" color={colors.red} />
            <Txt v="small" style={{ flex: 1 }}>
              AI suggested <Txt v="small" style={{ fontWeight: '700' }}>{CATEGORIES[r.ai.category].label}</Txt> ({Math.round(r.ai.confidence * 100)}%).{' '}
              {r.categoryCorrected ? `You corrected it to ${cat.label}.` : 'You confirmed it.'}
            </Txt>
          </Card>
        ) : null}
        <Detail label="Effect on journey" value={SEVERITY.find((s) => s.key === r.severity)?.label} />
        <Detail label="What happened" value={names(r.impacts, IMPACTS)} />
        <Detail label="Who it affects" value={names(r.affected, AFFECTED)} />
        <Detail label="Description" value={r.description} />
        <Detail label="Sent" value={formatDate(r.createdAt)} />
        {r.voiceUri ? (
          <View style={{ marginTop: 12 }}>
            <VoicePlayback uri={r.voiceUri} seconds={r.voiceSeconds} />
          </View>
        ) : null}
        {r.location ? (
          <View style={{ marginTop: 14 }}>
            <MapPreview
              region={{ latitude: r.location.latitude, longitude: r.location.longitude, latitudeDelta: 0.004, longitudeDelta: 0.004 }}
              height={170}
              label={`Map of the barrier at ${r.location.address ?? 'the pinned location'}`}
              pins={[{ id: r.id, latitude: r.location.latitude, longitude: r.location.longitude, title: r.code, active: true }]}
            />
          </View>
        ) : null}
      </Section>

      {reportUpdates.length ? (
        <Section title="Updates">
          {reportUpdates.map((u) => (
            <View key={u.id} style={styles.update}>
              <View style={styles.updDot} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">{u.title}</Txt>
                <Txt v="small" color={colors.muted}>
                  {u.body}
                </Txt>
                <Txt v="small">{timeAgo(u.at)}</Txt>
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      {next ? (
        <View style={styles.demo}>
          <Txt v="label">Prototype demo</Txt>
          <Txt v="small" color={colors.muted} style={{ marginTop: 4, marginBottom: 12 }}>
            The staff website is not built yet. Use this to play the staff side and show the full report-to-resolution workflow.
          </Txt>
          <Button
            variant="dark"
            label={`Next: ${next}`}
            icon={<Icon name="chevron" color={colors.cream} size={20} />}
            onPress={() => simulate(false)}
            hint={needsPhoto ? 'Uses a sample after photo' : undefined}
          />
          {needsPhoto ? (
            <Button
              small
              variant="outline"
              style={{ marginTop: 10 }}
              label="Use a real after photo instead"
              icon={<Icon name="image" size={18} />}
              onPress={() => simulate(true)}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: border, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  detail: { paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.ink, gap: 2 },
  update: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.ink },
  updDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.red, marginTop: 6, borderWidth: 2, borderColor: colors.ink },
  demo: { marginTop: 32, padding: 16, borderWidth: border, borderStyle: 'dashed', borderColor: colors.ink, borderRadius: radius.lg },
});
