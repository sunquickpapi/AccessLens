import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Button from '../components/Button';
import Chip from '../components/Chip';
import Icon from '../components/Icon';
import { Screen, Wrap } from '../components/Layout';
import { LogoMark } from '../components/Logo';
import Txt from '../components/Txt';
import { AFFECTED } from '../lib/catalog';
import { colors, radius, border, TEXT_SCALES } from '../lib/theme';
import { useStore } from '../state/store';

// First launch: brand, the promise, and accessibility setup up front, so
// residents who need large text or controls get them before anything else.
export default function Welcome() {
  const { settings, updateSettings } = useStore();
  const [page, setPage] = useState(0);

  const finish = () => {
    updateSettings({ onboarded: true });
    router.replace('/');
  };

  if (page === 0) {
    return (
      <Screen
        footer={<Button label="Get started" onPress={() => setPage(1)} icon={<Icon name="chevron" color={colors.cream} />} />}
      >
        <View style={styles.hero}>
          <LogoMark size={96} />
          <Txt v="hero" style={{ marginTop: 28 }}>
            Spot it.{'\n'}Snap it.{'\n'}
            <Txt v="hero" color={colors.red}>
              Clear the way.
            </Txt>
          </Txt>
          <Txt v="body" color={colors.muted} style={{ marginTop: 16 }}>
            AccessLens helps you report blocked or damaged walkways in your township, so the people who fix them
            can find and resolve them faster.
          </Txt>
        </View>
        {[
          ['camera', 'Snap a photo and confirm where it is'],
          ['spark', 'AI suggests the type of barrier — you confirm'],
          ['bell', 'Follow the fix until it is resolved'],
        ].map(([icon, text]) => (
          <View key={icon} style={styles.point}>
            <View style={styles.pointIcon}>
              <Icon name={icon} color={colors.cream} />
            </View>
            <Txt v="bodyStrong" style={{ flex: 1 }}>
              {text}
            </Txt>
          </View>
        ))}
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button label="Continue" onPress={finish} />
          <Button label="Skip for now" variant="ghost" onPress={finish} small />
        </>
      }
    >
      <Txt v="display" style={{ marginTop: 12 }}>
        Make it comfortable
      </Txt>
      <Txt v="body" color={colors.muted} style={{ marginTop: 6 }}>
        You can change these any time in Settings. AccessLens also works with TalkBack and VoiceOver.
      </Txt>

      <Txt v="label" style={{ marginTop: 26, marginBottom: 10 }}>
        Text size
      </Txt>
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        {TEXT_SCALES.map((t) => (
          <Chip key={t.key} block multi={false} label={t.label} selected={settings.textScale === t.key} onPress={() => updateSettings({ textScale: t.key })} />
        ))}
      </View>

      <Txt v="label" style={{ marginTop: 26, marginBottom: 10 }}>
        Controls
      </Txt>
      <View style={{ gap: 10 }}>
        <Chip block label="Large controls" hint="Bigger buttons and touch areas" selected={settings.largeControls} onPress={() => updateSettings({ largeControls: !settings.largeControls })} />
        <Chip block label="Read things aloud" hint="Speaks AI results and key steps" selected={settings.readAloud} onPress={() => updateSettings({ readAloud: !settings.readAloud })} />
      </View>

      <Txt v="label" style={{ marginTop: 26, marginBottom: 4 }}>
        How do you get around? (optional)
      </Txt>
      <Txt v="small" color={colors.muted} style={{ marginBottom: 10 }}>
        We use this to pre-fill who a barrier affects. It stays on your phone.
      </Txt>
      <Wrap>
        {AFFECTED.map((a) => {
          const on = settings.getAround.includes(a.key);
          return (
            <Chip
              key={a.key}
              label={a.label}
              selected={on}
              onPress={() =>
                updateSettings({ getAround: on ? settings.getAround.filter((k) => k !== a.key) : [...settings.getAround, a.key] })
              }
            />
          );
        })}
      </Wrap>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: 36, paddingBottom: 24 },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderTopWidth: border,
    borderColor: colors.ink,
    paddingVertical: 14,
  },
  pointIcon: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.ink },
});
