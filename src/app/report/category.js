import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { Card, Screen, StepHeader } from '../../components/Layout';
import Photo from '../../components/Photo';
import Txt from '../../components/Txt';
import { confidenceWords } from '../../lib/ai';
import { CATEGORIES, CATEGORY_KEYS } from '../../lib/catalog';
import { colors, radius, border } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { useStore } from '../../state/store';

// Step 3 — Confirm or correct the AI-suggested category.
export default function CategoryStep() {
  const { draft, updateDraft } = useStore();
  const { say } = useUI();
  const [showBox, setShowBox] = useState(true);
  const ai = draft.ai;

  const summary = ai
    ? ai.uncertain
      ? `The AI is not sure. Its best guess is ${CATEGORIES[ai.category].label}, at ${Math.round(ai.confidence * 100)} percent. Please choose the right category.`
      : `The AI suggests ${CATEGORIES[ai.category].label}, ${confidenceWords(ai.confidence).toLowerCase()}, ${Math.round(ai.confidence * 100)} percent. Confirm it or choose another.`
    : '';

  useEffect(() => {
    if (draft.aiState === 'done') say(`Step 3 of 4. ${summary}`);
    else say('Step 3 of 4. The AI is still checking your photo.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.aiState]);

  const choose = (key) => updateDraft({ category: key, categoryCorrected: ai ? key !== ai.category : false });

  const ordered = ai ? [...CATEGORY_KEYS].sort((a, b) => (ai.scores?.[b] ?? 0) - (ai.scores?.[a] ?? 0)) : CATEGORY_KEYS;

  return (
    <Screen
      footer={
        <Button
          label={draft.categoryCorrected ? 'Use my correction' : 'Confirm category'}
          disabled={!draft.category}
          onPress={() => router.push('/report/review')}
        />
      }
    >
      <StepHeader step={3} title="Is this right?" subtitle="AI looked at your photo and suggests a barrier type. You have the final say." />

      <Photo uri={draft.photoUri} ai={ai} showBox={showBox && !!ai} />
      {ai?.box ? (
        <Pressable onPress={() => setShowBox((v) => !v)} style={styles.toggle} accessibilityRole="switch" accessibilityState={{ checked: showBox }} accessibilityLabel="Show AI highlight on photo">
          <Icon name="eye" size={20} />
          <Txt v="small">{showBox ? 'Hide' : 'Show'} AI highlight</Txt>
        </Pressable>
      ) : null}

      {draft.aiState === 'running' || draft.aiState === 'idle' ? (
        <Card tone="paper" style={styles.loading}>
          <ActivityIndicator color={colors.red} />
          <Txt v="bodyStrong" accessibilityLiveRegion="polite">
            AI is checking your photo…
          </Txt>
        </Card>
      ) : null}

      {draft.aiState === 'error' ? (
        <Card tone="paper" style={{ marginTop: 14 }}>
          <Txt v="bodyStrong">AI check isn’t available right now.</Txt>
          <Txt v="small" color={colors.muted}>
            Please choose the category yourself. Staff will still review it.
          </Txt>
        </Card>
      ) : null}

      {ai ? (
        <View style={[styles.suggest, ai.uncertain && { backgroundColor: colors.paper }]} accessible accessibilityLabel={summary} accessibilityLiveRegion="polite">
          <View style={styles.suggestTop}>
            <Icon name="spark" color={ai.uncertain ? colors.red : colors.cream} />
            <Txt v="label" color={ai.uncertain ? colors.ink : colors.cream}>
              {ai.uncertain ? 'AI is not sure' : 'AI suggestion'}
            </Txt>
          </View>
          <Txt v="display" color={ai.uncertain ? colors.ink : colors.cream} style={{ marginTop: 6 }}>
            {CATEGORIES[ai.category].label}
          </Txt>
          <Txt v="small" color={ai.uncertain ? colors.ink : colors.cream}>
            {confidenceWords(ai.confidence)} · {Math.round(ai.confidence * 100)}%
          </Txt>
          <View style={{ marginTop: 12, gap: 8 }}>
            {ordered.map((k) => (
              <View key={k} style={styles.scoreRow}>
                <Txt v="small" color={ai.uncertain ? colors.ink : colors.cream} style={{ width: 118 }}>
                  {CATEGORIES[k].label}
                </Txt>
                <View style={[styles.track, ai.uncertain && { borderColor: colors.ink }]}>
                  <View style={[styles.fill, { width: `${Math.round((ai.scores?.[k] ?? 0) * 100)}%` }, ai.uncertain && { backgroundColor: colors.red }]} />
                </View>
                <Txt v="small" color={ai.uncertain ? colors.ink : colors.cream} style={{ width: 40, textAlign: 'right' }}>
                  {Math.round((ai.scores?.[k] ?? 0) * 100)}%
                </Txt>
              </View>
            ))}
          </View>
          <Pressable onPress={() => say(summary, { force: true })} style={[styles.speak, ai.uncertain && { borderColor: colors.ink }]} accessibilityRole="button" accessibilityLabel="Read the AI suggestion aloud">
            <Icon name="speaker" size={20} color={ai.uncertain ? colors.ink : colors.cream} />
            <Txt v="small" color={ai.uncertain ? colors.ink : colors.cream}>
              Read aloud
            </Txt>
          </Pressable>
        </View>
      ) : null}

      <Txt v="label" style={{ marginTop: 26, marginBottom: 10 }}>
        {ai ? 'Confirm or correct' : 'Choose a category'}
      </Txt>
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        {CATEGORY_KEYS.map((k) => (
          <Chip
            key={k}
            block
            multi={false}
            label={ai?.category === k ? `${CATEGORIES[k].label}  (AI suggestion)` : CATEGORIES[k].label}
            hint={CATEGORIES[k].description}
            selected={draft.category === k}
            onPress={() => choose(k)}
          />
        ))}
      </View>
      {draft.categoryCorrected ? (
        <Txt v="small" color={colors.red} style={{ marginTop: 10 }}>
          Thanks — your correction is sent with the report and helps the AI improve.
        </Txt>
      ) : null}

      <View style={styles.note}>
        <Icon name="shield" size={22} />
        <Txt v="small" style={{ flex: 1 }}>
          AI highlights what it suspects and how unsure it is. Township staff verify every report before any action is taken.
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-end', paddingVertical: 10, minHeight: 44 },
  loading: { marginTop: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  suggest: { marginTop: 8, backgroundColor: colors.red, borderWidth: border, borderColor: colors.ink, borderRadius: radius.lg, padding: 18 },
  suggestTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.cream, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.cream },
  speak: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 14, borderWidth: 2, borderColor: colors.cream, borderRadius: radius.pill, paddingHorizontal: 14, minHeight: 44 },
  note: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 22, padding: 14, borderTopWidth: border, borderBottomWidth: border, borderColor: colors.ink },
});
