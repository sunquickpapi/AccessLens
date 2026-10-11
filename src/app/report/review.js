import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import { Screen, StepHeader } from '../../components/Layout';
import Photo from '../../components/Photo';
import Txt from '../../components/Txt';
import { AFFECTED, CATEGORIES, IMPACTS, SEVERITY } from '../../lib/catalog';
import { colors, border } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { useStore } from '../../state/store';

function Row({ label, value, edit }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="label" color={colors.muted}>
          {label}
        </Txt>
        <Txt v="bodyStrong">{value || '—'}</Txt>
      </View>
      {edit ? (
        <Pressable onPress={() => router.navigate(edit)} accessibilityRole="button" accessibilityLabel={`Edit ${label}`} hitSlop={10} style={styles.edit}>
          <Icon name="edit" size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

// Step 4 — Check everything, then send.
export default function ReviewStep() {
  const { draft, submitDraft } = useStore();
  const { say, tap } = useUI();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    say('Step 4 of 4. Check your report, then send it.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const names = (keys, list) => keys.map((k) => list.find((x) => x.key === k)?.label).filter(Boolean).join(', ');
  const ready = draft.photoUri && draft.location?.confirmed && draft.category && draft.severity;

  const send = () => {
    setSending(true);
    const created = submitDraft();
    tap('success');
    router.replace({ pathname: '/report/sent', params: { id: created.id } });
  };

  return (
    <Screen footer={<Button label="Send report" disabled={!ready} loading={sending} onPress={send} icon={<Icon name="check" color={colors.cream} />} />}>
      <StepHeader step={4} title="Check and send" subtitle="Make sure everything looks right." />
      <Photo uri={draft.photoUri} ai={draft.ai} showBox={!!draft.ai} />

      <View style={{ marginTop: 18 }}>
        <Row
          label="Barrier type"
          value={draft.category ? `${CATEGORIES[draft.category].label}${draft.categoryCorrected ? ' (you corrected the AI)' : draft.ai ? ' (AI suggestion, confirmed)' : ''}` : null}
          edit="/report/category"
        />
        <Row label="Location" value={[draft.location?.address ?? 'Pinned on map', draft.landmark].filter(Boolean).join(' · ')} edit="/report/photo" />
        <Row label="Effect on journey" value={SEVERITY.find((s) => s.key === draft.severity)?.label} edit="/report/describe" />
        {draft.impacts.length ? <Row label="What happened" value={names(draft.impacts, IMPACTS)} edit="/report/describe" /> : null}
        {draft.affected.length ? <Row label="Who it affects" value={names(draft.affected, AFFECTED)} edit="/report/describe" /> : null}
        {draft.description ? <Row label="Your description" value={draft.description} edit="/report/describe" /> : null}
        {draft.voiceUri ? <Row label="Voice description" value={`Attached · ${draft.voiceSeconds}s`} edit="/report/describe" /> : null}
      </View>

      <Txt v="small" color={colors.muted} style={{ marginTop: 16 }}>
        Your report goes to the township management team. Your photo and location are only used to fix this barrier.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: border, borderColor: colors.ink },
  edit: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
