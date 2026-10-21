import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import { Screen } from '../../components/Layout';
import Tracker from '../../components/Tracker';
import Txt from '../../components/Txt';
import { colors, radius, border } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { useStore } from '../../state/store';

export default function Sent() {
  const { id } = useLocalSearchParams();
  const { findReport, resetDraft, connection } = useStore();
  const { say } = useUI();
  const report = findReport(id);
  const waiting = report?.synced === false;

  useEffect(() => {
    resetDraft();
    say('Report saved. It is being sent to township staff. We will update you at every step.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!report) return null;

  return (
    <Screen
      footer={
        <>
          <Button label="Track this report" onPress={() => router.replace(`/track/${id}`)} />
          <Button label="Back to home" variant="outline" onPress={() => router.dismissTo('/')} />
        </>
      }
    >
      <View style={styles.badge}>
        <Icon name="check" size={56} color={colors.cream} stroke={3.4} />
      </View>
      <Txt v="hero" center style={{ marginTop: 22 }}>
        {waiting ? 'Report saved' : 'Report sent'}
      </Txt>
      <Txt v="body" center color={colors.muted} style={{ marginTop: 8 }} accessibilityLiveRegion="polite">
        {waiting
          ? connection.ok === false
            ? 'We couldn’t reach township staff yet. It will send automatically when you’re connected.'
            : 'Sending it to township staff…'
          : 'Township staff can see it now. Thank you for helping clear the way.'}
      </Txt>
      <View style={styles.code} accessible accessibilityLabel={waiting ? 'Reference not ready yet' : `Reference ${report.code}`}>
        <Txt v="label">Reference</Txt>
        <Txt v="display" color={waiting ? colors.muted : colors.red}>
          {waiting ? '…' : report.code}
        </Txt>
      </View>

      <Txt v="label" style={{ marginTop: 28 }}>
        What happens next
      </Txt>
      <View style={styles.rule} />
      <Tracker report={report} />
      <Txt v="small" color={colors.muted}>
        You’ll get an update in the app at each step.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: {
    marginTop: 28,
    alignSelf: 'center',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.red,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: { marginTop: 22, alignItems: 'center', borderWidth: border, borderColor: colors.ink, borderStyle: 'dashed', borderRadius: radius.md, padding: 14, gap: 4 },
  rule: { height: 3, backgroundColor: colors.ink, marginTop: 8, marginBottom: 14 },
});
