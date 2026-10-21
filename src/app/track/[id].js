import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import { Card, Section } from '../../components/Layout';
import MapPreview from '../../components/MapPreview';
import Photo from '../../components/Photo';
import SignaturePad from '../../components/SignaturePad';
import StatusPill from '../../components/StatusPill';
import Tracker from '../../components/Tracker';
import Txt from '../../components/Txt';
import { AFFECTED, CATEGORIES, IMPACTS, SEVERITY, stageIndex } from '../../lib/catalog';
import { colors, fonts, radius, border } from '../../lib/theme';
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

// "Is the walkway usable now?" — resident feedback after staff confirm the fix.
// "Yes, it's fixed" asks the resident to sign the defect report (Confirmed by),
// by drawing with a finger or uploading a picture of their signature.
function Feedback({ report }) {
  const { sendFeedback, settings } = useStore();
  const { fs, say, tap } = useUI();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [signing, setSigning] = useState(false);
  const [strokes, setStrokes] = useState(null);
  const [upload, setUpload] = useState(null); // data URL
  const [name, setName] = useState(settings.name || '');
  const [padKey, setPadKey] = useState(0);
  const [scrollOn, setScrollOn] = useState(true);

  if (report.feedback) {
    return (
      <Card tone="paper" style={{ gap: 4 }}>
        <Txt v="bodyStrong">
          {report.feedback.fixed ? 'You said the walkway is usable now. Thank you!' : 'You said it’s not fixed yet, so the report was reopened for the team.'}
        </Txt>
        {report.feedback.fixed ? (
          <Txt v="small" color={colors.muted}>
            {report.feedback.signed ? 'You signed the defect report as “Confirmed by”.' : 'Sent without a signature.'}
          </Txt>
        ) : null}
        {report.feedback.comment ? (
          <Txt v="small" color={colors.muted}>
            “{report.feedback.comment}”
          </Txt>
        ) : null}
      </Card>
    );
  }

  const send = async (fixed, extra) => {
    setBusy(fixed ? 'yes' : 'no');
    setError(null);
    try {
      await sendFeedback(report.id, fixed, comment, extra);
      setSigning(false);
      tap('success');
      say('Thanks for your feedback.');
    } catch (e) {
      setError(e?.message ?? 'Couldn’t send your feedback.');
    } finally {
      setBusy(null);
    }
  };

  const pickSignature = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.3, base64: true, allowsEditing: true });
      const a = res.assets?.[0];
      if (res.canceled || !a?.base64) return;
      const type = a.mimeType && a.mimeType.includes('png') ? 'image/png' : 'image/jpeg'; // iOS converts HEIC to JPEG
      setUpload(`data:${type};base64,${a.base64}`);
      setStrokes(null);
      setPadKey((k) => k + 1);
    } catch {
      setError('Couldn’t open your photos.');
    }
  };

  const signature = upload || strokes;

  return (
    <Card style={{ gap: 12 }}>
      <Txt v="h2">Is the walkway usable now?</Txt>
      <Txt v="small" color={colors.muted}>
        Your answer tells staff whether the fix really worked.
      </Txt>
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder="Anything to add? (optional)"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Comment, optional"
        style={[styles.input, { fontSize: fs(16) }]}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button style={{ flex: 1 }} label="Yes, it’s fixed" onPress={() => setSigning(true)} icon={<Icon name="check" color={colors.cream} size={20} />} />
        <Button style={{ flex: 1 }} variant="outline" label="Not yet" loading={busy === 'no'} onPress={() => send(false)} />
      </View>
      {error && !signing ? (
        <Txt v="small" color={colors.red}>
          {error}
        </Txt>
      ) : null}

      <Modal visible={signing} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setSigning(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled" scrollEnabled={scrollOn}>
              <View style={styles.top}>
                <Pressable onPress={() => setSigning(false)} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.iconBtn} hitSlop={10}>
                  <Icon name="close" />
                </Pressable>
                <Txt v="label">Defect report {report.code}</Txt>
                <View style={{ width: 48 }} />
              </View>
              <Txt v="display">Sign to confirm</Txt>
              <Txt v="body" color={colors.muted}>
                Your signature goes on the formal defect report as{' '}
                <Txt v="body" style={{ fontFamily: fonts.bold }}>
                  Confirmed by: Resident (report sender)
                </Txt>
                . It shows the walkway was really fixed.
              </Txt>
              <Txt v="label">Your name</Txt>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Name on the report"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Your name for the report"
                style={[styles.input, { fontSize: fs(16) }]}
              />
              <Txt v="label">Signature</Txt>
              {upload ? (
                <View style={{ gap: 8 }}>
                  <Image source={{ uri: upload }} style={styles.uploaded} resizeMode="contain" accessibilityLabel="Your uploaded signature" />
                  <Txt
                    v="small"
                    color={colors.red}
                    style={{ fontFamily: fonts.bold, alignSelf: 'flex-end' }}
                    onPress={() => setUpload(null)}
                    accessibilityRole="button"
                  >
                    Remove and draw instead
                  </Txt>
                </View>
              ) : (
                <SignaturePad key={padKey} onChange={setStrokes} onDrawStart={() => setScrollOn(false)} onDrawEnd={() => setScrollOn(true)} />
              )}
              <Button variant="outline" small label="Upload a photo of my signature" icon={<Icon name="image" size={18} />} onPress={pickSignature} />
              {error ? (
                <Txt v="small" color={colors.red}>
                  {error}
                </Txt>
              ) : null}
              <Button
                label="Sign and send"
                disabled={!signature}
                loading={busy === 'yes'}
                onPress={() => send(true, { signature, name: name.trim() })}
                icon={<Icon name="check" color={colors.cream} size={20} />}
              />
              <Button variant="ghost" small label="Send without signing" onPress={() => send(true)} />
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </Card>
  );
}

export default function TrackReport() {
  const { id } = useLocalSearchParams();
  const { findReport, updates, markRead, sync, connection } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const r = findReport(id);

  useEffect(() => {
    if (r && r.synced !== false) markRead(r.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, r?.stage, r?.assignedTo, updates.length]);

  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  };

  if (!r) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ padding: 20 }}>
          <Txt v="h1">Report not found</Txt>
          <Button label="Back" onPress={() => router.back()} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  const cat = CATEGORIES[r.category];
  const idx = stageIndex(r);
  const waiting = r.synced === false;
  const reportUpdates = updates.filter((u) => u.reportId === r.id);
  const names = (keys, list) =>
    (keys ?? [])
      .map((k) => list.find((x) => x.key === k)?.label)
      .filter(Boolean)
      .join(', ');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.red} />}
      >
        <View style={styles.top}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/reports'))}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.iconBtn}
            hitSlop={10}
          >
            <Icon name="back" />
          </Pressable>
          <Txt v="label">{waiting ? 'New report' : `Report ${r.code}`}</Txt>
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

        {waiting ? (
          <Card tone="paper" style={{ marginTop: 16, gap: 4 }}>
            <Txt v="bodyStrong">Waiting to upload</Txt>
            <Txt v="small" color={colors.muted}>
              {r.uploadError
                ? `The server didn’t accept this report: ${r.uploadError}`
                : connection.ok === false
                  ? 'We can’t reach township staff right now. This report will send automatically when the connection is back.'
                  : 'Sending to township staff…'}
            </Txt>
          </Card>
        ) : null}

        {r.stage === 'confirmed' && !waiting ? (
          <View style={{ marginTop: 20 }}>
            <Feedback report={r} />
          </View>
        ) : null}

        <Section title={r.stage === 'closed' ? 'Status' : `Progress · stage ${Math.min(Math.max(idx, 0) + 1, 5)} of 5`}>
          <Tracker report={r} />
          {r.assignedTo && r.dueDate && r.stage === 'review' ? (
            <Txt v="small" color={colors.muted}>
              {r.workType === 'inspection' ? 'Inspection' : 'Repair'} target date:{' '}
              {new Date(r.dueDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
            </Txt>
          ) : null}
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
              {r.stage === 'confirmed'
                ? `Confirmed by staff ${r.resolvedAt ? timeAgo(r.resolvedAt) : ''}.`
                : 'Staff are checking this photo before closing the report.'}
            </Txt>
          </Section>
        ) : null}

        {reportUpdates.length ? (
          <Section title="Updates">
            {reportUpdates.map((u) => (
              <View key={u.id} style={styles.update}>
                <View style={[styles.updDot, u.read && { backgroundColor: colors.cream }]} />
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

        <Section title="Your report">
          <Photo uri={r.photoUri} ai={r.ai} showBox={!!r.ai} />
          {r.ai && r.ai.category ? (
            <Card tone="paper" style={{ marginTop: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Icon name="spark" color={colors.red} />
              <Txt v="small" style={{ flex: 1 }}>
                AI suggested{' '}
                <Txt v="small" style={{ fontFamily: fonts.bold }}>
                  {CATEGORIES[r.ai.category]?.label}
                </Txt>{' '}
                ({Math.round(r.ai.confidence * 100)}%). {r.categoryCorrected ? `You corrected it to ${cat.label}.` : 'You confirmed it.'}
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

        {!waiting ? (
          <Txt v="small" color={colors.muted} style={{ marginTop: 20 }}>
            Pull down to refresh. Updates also arrive automatically.
          </Txt>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: border, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  detail: { paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.ink, gap: 2 },
  update: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.ink },
  updDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.red, marginTop: 6, borderWidth: 2, borderColor: colors.ink },
  uploaded: { height: 150, borderWidth: 2, borderColor: colors.ink, borderRadius: radius.md, backgroundColor: '#fff' },
  input: {
    borderWidth: border,
    borderColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 52,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.cream,
  },
});
