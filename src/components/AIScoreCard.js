import { Pressable, StyleSheet, View } from 'react-native';
import { SCORE_LABELS, confidenceWords } from '../lib/ai';
import { CATEGORIES, CATEGORY_KEYS } from '../lib/catalog';
import { colors, radius, border } from '../lib/theme';
import { useUI } from '../lib/ui';
import Icon from './Icon';
import Txt from './Txt';

// One sentence describing the AI result (also read aloud).
export function aiSentence(ai) {
  if (!ai) return '';
  const pct = Math.round(ai.confidence * 100);
  if (ai.noBarrier && ai.reason === 'not_walkway') {
    return `This doesn’t look like a walkway, so the AI found no barrier (${pct} percent). If there is a barrier, retake the photo outdoors or choose the type yourself.`;
  }
  if (ai.noBarrier) return `The AI did not spot a barrier in this photo, at ${pct} percent. If there is one, please choose the type.`;
  if (ai.uncertain) return `The AI is not sure. Its best guess is ${CATEGORIES[ai.category].label}, at ${pct} percent. Please check the type.`;
  return `The AI suggests ${CATEGORIES[ai.category].label}, ${confidenceWords(ai.confidence).toLowerCase()}, ${pct} percent.`;
}

// The AI's result with a percentage bar for every barrier type and "No barrier".
export default function AIScoreCard({ ai, style }) {
  const { say } = useUI();
  if (!ai) return null;
  const light = ai.uncertain || ai.noBarrier;
  const fg = light ? colors.ink : colors.cream;
  const pct = Math.round(ai.confidence * 100);
  const sentence = aiSentence(ai);
  const keys = [...CATEGORY_KEYS, ...(ai.scores?.none != null ? ['none'] : [])].sort((a, b) => (ai.scores?.[b] ?? 0) - (ai.scores?.[a] ?? 0));

  return (
    <View style={[styles.card, light && { backgroundColor: colors.paper }, style]} accessible accessibilityLabel={sentence} accessibilityLiveRegion="polite">
      <View style={styles.top}>
        <Icon name="spark" color={light ? colors.red : colors.cream} />
        <Txt v="label" color={fg}>
          {ai.noBarrier ? 'AI result' : ai.uncertain ? 'AI is not sure' : 'AI suggestion'}
        </Txt>
      </View>
      <Txt v="display" color={fg} style={{ marginTop: 6 }}>
        {ai.noBarrier ? (ai.reason === 'not_walkway' ? 'Not a walkway' : 'No barrier spotted') : CATEGORIES[ai.category].label}
      </Txt>
      <Txt v="small" color={fg}>
        {ai.noBarrier ? 'No barrier' : confidenceWords(ai.confidence)} · {pct}%{ai.model === 'simulated' ? ' · simulated' : ''}
      </Txt>
      <View style={{ marginTop: 12, gap: 8 }}>
        {keys.map((k) => {
          const v = Math.round((ai.scores?.[k] ?? 0) * 100);
          return (
            <View key={k} style={styles.scoreRow}>
              <Txt v="small" color={fg} style={{ width: 118 }}>
                {SCORE_LABELS[k]}
              </Txt>
              <View style={[styles.track, light && { borderColor: colors.ink }]}>
                <View style={[styles.fill, { width: `${v}%` }, light && { backgroundColor: colors.red }]} />
              </View>
              <Txt v="small" color={fg} style={{ width: 40, textAlign: 'right' }}>
                {v}%
              </Txt>
            </View>
          );
        })}
      </View>
      {ai.walkway != null ? (
        <Txt v="small" color={fg} style={{ marginTop: 10 }}>
          Looks like a walkway: {Math.round(ai.walkway * 100)}%
        </Txt>
      ) : null}
      <Pressable onPress={() => say(sentence, { force: true })} style={[styles.speak, light && { borderColor: colors.ink }]} accessibilityRole="button" accessibilityLabel="Read the AI result aloud">
        <Icon name="speaker" size={18} color={fg} />
        <Txt v="small" color={fg}>
          Read aloud
        </Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.red, borderWidth: border, borderColor: colors.ink, borderRadius: radius.lg, padding: 18 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.cream, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.cream },
  speak: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 12, borderWidth: 2, borderColor: colors.cream, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 40 },
});
