import { useEffect } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import { Screen, StepHeader, Wrap } from '../../components/Layout';
import Txt from '../../components/Txt';
import VoiceNote from '../../components/VoiceNote';
import { AFFECTED, IMPACTS, SEVERITY } from '../../lib/catalog';
import { fieldStatus, withEdit } from '../../lib/autofill';
import { colors, fonts, radius, border } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { useStore } from '../../state/store';

function toggle(list, key) {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

// Edit sheet — how the barrier affects the journey (pre-filled from the photo).
export default function DescribeStep() {
  const { draft, updateDraft, settings } = useStore();
  const { say, fs } = useUI();

  const edit = (patch) => updateDraft((d) => withEdit(d, patch, settings.getAround));
  const aiNote = (key) => (fieldStatus(draft, key) === 'accepted' ? '  · AI suggested' : '');

  useEffect(() => {
    say('Edit how this barrier affects the journey. You can also type or record your voice.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canContinue = true; // "Check and send" asks for anything still missing

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Button
          label="Done"
          disabled={!canContinue}
          hint={canContinue ? undefined : 'Choose how much it affects the journey first'}
          onPress={() => router.back()}
        />
      }
    >
      <StepHeader edit title="Effect on the journey" subtitle="The app guessed these from your photo. Change anything that isn’t right. It helps staff decide how urgent it is." />

      <Txt v="label" style={styles.q}>
        How much does it affect the journey? *{aiNote('severity')}
      </Txt>
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        {SEVERITY.map((s) => (
          <Chip key={s.key} block multi={false} label={s.label} hint={s.hint} selected={draft.severity === s.key} onPress={() => edit({ severity: s.key })} />
        ))}
      </View>

      <Txt v="label" style={styles.q}>
        What happened?{aiNote('impacts')}
      </Txt>
      <Wrap>
        {IMPACTS.map((i) => (
          <Chip key={i.key} label={i.label} selected={draft.impacts.includes(i.key)} onPress={() => edit({ impacts: toggle(draft.impacts, i.key) })} />
        ))}
      </Wrap>

      <Txt v="label" style={styles.q}>
        Who does it affect?{aiNote('affected')}
      </Txt>
      <Wrap>
        {AFFECTED.map((a) => (
          <Chip key={a.key} label={a.label} selected={draft.affected.includes(a.key)} onPress={() => edit({ affected: toggle(draft.affected, a.key) })} />
        ))}
      </Wrap>

      <Txt v="label" style={styles.q}>
        In your own words (optional)
      </Txt>
      <TextInput
        value={draft.description}
        onChangeText={(description) => updateDraft({ description })}
        placeholder="e.g. Motorcycles park across the pavement every morning, so I have to use the road."
        placeholderTextColor={colors.muted}
        multiline
        maxLength={500}
        textAlignVertical="top"
        accessibilityLabel="Describe the barrier in your own words, optional"
        accessibilityHint="Your keyboard's microphone also works for dictation"
        style={[styles.input, { fontSize: fs(16), minHeight: 120 }]}
      />
      <Txt v="small" color={colors.muted} style={{ marginTop: 6, marginBottom: 12, alignSelf: 'flex-end' }}>
        {draft.description.length}/500
      </Txt>

      <VoiceNote uri={draft.voiceUri} seconds={draft.voiceSeconds} onChange={updateDraft} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  q: { marginTop: 24, marginBottom: 10 },
  input: {
    borderWidth: border,
    borderColor: colors.ink,
    borderRadius: radius.md,
    padding: 14,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.cream,
  },
});
