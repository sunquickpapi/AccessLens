import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { Card, Screen, StepHeader } from '../../components/Layout';
import AIScoreCard, { aiSentence } from '../../components/AIScoreCard';
import Photo from '../../components/Photo';
import Txt from '../../components/Txt';
import { analysePhoto } from '../../lib/ai';
import { applyAI, withEdit } from '../../lib/autofill';
import { CATEGORIES, CATEGORY_KEYS } from '../../lib/catalog';
import { colors, radius, border } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { useStore } from '../../state/store';

// Edit sheet — confirm or correct the AI-suggested barrier type.
export default function CategoryStep() {
  const { draft, updateDraft, settings } = useStore();
  const { say } = useUI();
  const [showBox, setShowBox] = useState(true);
  const ai = draft.ai;

  const summary = aiSentence(ai);

  useEffect(() => {
    if (draft.aiState === 'done') say(`Barrier type. ${summary}`);
    else say('Barrier type. The AI is still checking your photo.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.aiState]);

  const retry = () => {
    const uri = draft.photoUri;
    updateDraft({ aiState: 'running', aiError: null, ai: null });
    analysePhoto(uri)
      .then((r) => updateDraft((d) => applyAI(d, r, settings.getAround)))
      .catch((e) => updateDraft({ aiState: 'error', aiError: e?.message ?? null }));
  };

  const choose = (key) =>
    updateDraft((d) => withEdit(d, { category: key, categoryCorrected: ai && !ai.noBarrier ? key !== ai.category : false }, settings.getAround));


  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Button
          label={draft.categoryCorrected ? 'Use my correction' : 'Confirm barrier type'}
          disabled={!draft.category}
          onPress={() => router.back()}
        />
      }
    >
      <StepHeader edit title="Barrier type" subtitle="AI looked at your photo and suggests a barrier type. You have the final say." />

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
            {draft.aiError ? `${draft.aiError} ` : ''}You can try again, check Settings → Server connection, or choose the category yourself. Staff will still review it.
          </Txt>
          <Button
            small
            variant="outline"
            style={{ marginTop: 12 }}
            label="Try the AI again"
            icon={<Icon name="refresh" size={18} />}
            onPress={retry}
          />
        </Card>
      ) : null}

      <AIScoreCard ai={ai} style={{ marginTop: 8 }} />

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
      {ai?.noBarrier ? (
        <Txt v="small" color={colors.muted} style={{ marginTop: 10 }}>
          The AI didn’t see a barrier, but you know the route. Pick the closest category.
        </Txt>
      ) : null}
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
