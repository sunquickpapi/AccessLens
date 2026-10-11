import { useEffect } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import { Screen, StepHeader, Wrap } from '../../components/Layout';
import Txt from '../../components/Txt';
import VoiceNote from '../../components/VoiceNote';
import { AFFECTED, IMPACTS, SEVERITY } from '../../lib/catalog';
import { colors, fonts, radius, border } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { useStore } from '../../state/store';

function toggle(list, key) {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

// Step 2 — Describe how the barrier affects the journey.
export default function DescribeStep() {
  const { draft, updateDraft, settings } = useStore();
  const { say, fs } = useUI();

  useEffect(() => {
    if (draft.affected.length === 0 && settings.getAround.length) updateDraft({ affected: settings.getAround });
    say('Step 2 of 4. Tell us how this barrier affects your journey. You can type or record your voice.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canContinue = !!draft.severity;

  return (
    <Screen
      footer={
        <Button
          label="Next: check the AI suggestion"
          disabled={!canContinue}
          hint={canContinue ? undefined : 'Choose how much it affects the journey first'}
          onPress={() => router.push('/report/category')}
        />
      }
    >
      <StepHeader step={2} title="How does it affect your journey?" subtitle="This helps staff understand who is affected and how urgent it is." />

      <Txt v="label" style={styles.q}>
        How much does it affect the journey? *
      </Txt>
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        {SEVERITY.map((s) => (
          <Chip key={s.key} block multi={false} label={s.label} hint={s.hint} selected={draft.severity === s.key} onPress={() => updateDraft({ severity: s.key })} />
        ))}
      </View>

      <Txt v="label" style={styles.q}>
        What happened?
      </Txt>
      <Wrap>
        {IMPACTS.map((i) => (
          <Chip key={i.key} label={i.label} selected={draft.impacts.includes(i.key)} onPress={() => updateDraft({ impacts: toggle(draft.impacts, i.key) })} />
        ))}
      </Wrap>

      <Txt v="label" style={styles.q}>
        Who does it affect?
      </Txt>
      <Wrap>
        {AFFECTED.map((a) => (
          <Chip key={a.key} label={a.label} selected={draft.affected.includes(a.key)} onPress={() => updateDraft({ affected: toggle(draft.affected, a.key) })} />
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
