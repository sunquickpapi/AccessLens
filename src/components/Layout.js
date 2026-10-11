import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, radius, border } from '../lib/theme';
import { useStore } from '../state/store';
import Icon from './Icon';
import Txt from './Txt';

export function Screen({ children, footer, scroll = true, edges = ['top'], pad = true }) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <Body
        style={{ flex: 1 }}
        contentContainerStyle={scroll ? [pad && styles.pad, { paddingBottom: 32 }] : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {scroll ? children : <View style={[{ flex: 1 }, pad && styles.pad]}>{children}</View>}
      </Body>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({ children, style, tone = 'cream' }) {
  const bg = { cream: colors.cream, paper: colors.paper, red: colors.red, ink: colors.ink }[tone];
  return <View style={[styles.card, { backgroundColor: bg }, style]}>{children}</View>;
}

export function Section({ title, children, right }) {
  return (
    <View style={{ marginTop: 28 }}>
      <View style={styles.sectionHead}>
        <Txt v="label">{title}</Txt>
        {right}
      </View>
      <View style={styles.rule} />
      {children}
    </View>
  );
}

// Progress header for the 4-part report flow.
export function StepHeader({ step, total = 4, title, subtitle }) {
  const { resetDraft } = useStore();
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={styles.stepTop}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          style={styles.iconBtn}
        >
          <Icon name="back" />
        </Pressable>
        <Txt v="label" accessibilityLabel={`Step ${step} of ${total}`}>
          Step {step} / {total}
        </Txt>
        <Pressable
          onPress={() => {
            resetDraft();
            router.dismissTo('/');
          }}
          accessibilityRole="button"
          accessibilityLabel="Cancel report"
          hitSlop={12}
          style={styles.iconBtn}
        >
          <Icon name="close" />
        </Pressable>
      </View>
      <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={[styles.bar, i < step && { backgroundColor: colors.red }]} />
        ))}
      </View>
      <Txt v="display" style={{ marginTop: 18 }}>
        {title}
      </Txt>
      {subtitle ? (
        <Txt v="body" color={colors.muted} style={{ marginTop: 6 }}>
          {subtitle}
        </Txt>
      ) : null}
    </View>
  );
}

export function Row({ children, style, gap = 10 }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Wrap({ children, gap = 10 }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  pad: { paddingHorizontal: 20, paddingTop: 12 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: border,
    borderTopColor: colors.ink,
    backgroundColor: colors.cream,
    gap: 10,
  },
  card: { borderWidth: border, borderColor: colors.ink, borderRadius: radius.lg, padding: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rule: { height: 3, backgroundColor: colors.ink, marginTop: 8, marginBottom: 14 },
  stepTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: border,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: { flexDirection: 'row', gap: 6, marginTop: 14 },
  bar: { flex: 1, height: 8, borderRadius: 4, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.cream },
});
