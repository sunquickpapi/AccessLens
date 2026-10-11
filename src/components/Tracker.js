import { StyleSheet, View } from 'react-native';
import { STAGES, stageIndex } from '../lib/catalog';
import { colors } from '../lib/theme';
import { formatDate } from '../lib/ui';
import Icon from './Icon';
import Txt from './Txt';

// Vertical five-stage tracker: Report → AI assessment → Staff review →
// Completion photo → Confirmation.
export default function Tracker({ report }) {
  const current = stageIndex(report);
  const done = report.stage === 'confirmed';
  return (
    <View>
      {STAGES.map((s, i) => {
        const complete = i < current || (done && i === current);
        const active = i === current && !done;
        const when = [...report.timeline].reverse().find((e) => e.stage === s.key)?.at;
        let detail = s.detail;
        if (s.key === 'review' && report.assignedTo && i <= current) detail = `Verified and assigned to ${report.assignedTo}.`;
        const state = complete ? 'completed' : active ? 'in progress' : 'not started';
        return (
          <View
            key={s.key}
            style={styles.row}
            accessible
            accessibilityLabel={`Stage ${i + 1} of 5, ${s.label}, ${state}. ${detail}${when ? ` ${formatDate(when)}` : ''}`}
          >
            <View style={styles.rail}>
              <View style={[styles.dot, complete && styles.dotDone, active && styles.dotActive]}>
                {complete ? (
                  <Icon name="check" size={16} color={colors.cream} stroke={3} />
                ) : (
                  <Txt v="label" color={active ? colors.cream : colors.ink} style={{ letterSpacing: 0 }}>
                    {i + 1}
                  </Txt>
                )}
              </View>
              {i < STAGES.length - 1 ? <View style={[styles.line, i < current && { backgroundColor: colors.ink }]} /> : null}
            </View>
            <View style={styles.body}>
              <Txt v="bodyStrong" color={i > current ? colors.muted : colors.ink}>
                {s.label}
                {active ? '  ·  now' : ''}
              </Txt>
              <Txt v="small" color={colors.muted}>
                {detail}
              </Txt>
              {when && i <= current ? (
                <Txt v="small" color={colors.ink} style={{ marginTop: 2 }}>
                  {formatDate(when)}
                </Txt>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14 },
  rail: { alignItems: 'center', width: 34 },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.ink },
  dotActive: { backgroundColor: colors.red },
  line: { width: 3, flex: 1, minHeight: 22, backgroundColor: colors.paper, marginVertical: 2 },
  body: { flex: 1, paddingBottom: 18, paddingTop: 5, gap: 2 },
});
