import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { Screen, Section, Wrap } from '../../components/Layout';
import { LogoMark } from '../../components/Logo';
import Txt from '../../components/Txt';
import { AFFECTED } from '../../lib/catalog';
import { setupNotifications } from '../../lib/notify';
import { colors, fonts, radius, border, TEXT_SCALES } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { useStore } from '../../state/store';

export default function Settings() {
  const { settings, updateSettings, resetDemo } = useStore();
  const { say, fs, target } = useUI();

  const confirmReset = () => {
    const run = () => resetDemo();
    if (Platform.OS === 'web') return run();
    Alert.alert('Reset demo data?', 'This restores the sample reports and removes reports you added.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <Screen>
      <Txt v="display" style={{ marginTop: 8 }}>
        Settings
      </Txt>

      <Section title="Text size">
        <View style={{ gap: 10 }} accessibilityRole="radiogroup">
          {TEXT_SCALES.map((t) => (
            <Chip key={t.key} block multi={false} label={t.label} selected={settings.textScale === t.key} onPress={() => updateSettings({ textScale: t.key })} />
          ))}
        </View>
        <Txt v="small" color={colors.muted} style={{ marginTop: 8 }}>
          This adds to your phone’s own text size setting.
        </Txt>
      </Section>

      <Section title="Accessibility">
        <View style={{ gap: 10 }}>
          <Chip block label="Large controls" hint="Bigger buttons, tabs and touch areas" selected={settings.largeControls} onPress={() => updateSettings({ largeControls: !settings.largeControls })} />
          <Chip
            block
            label="Read things aloud"
            hint="Speaks each report step and the AI result"
            selected={settings.readAloud}
            onPress={() => {
              const on = !settings.readAloud;
              updateSettings({ readAloud: on });
              if (on) say('Read aloud is on.', { force: true });
            }}
          />
          <Chip block label="Vibration feedback" hint="A small tap when you press buttons" selected={settings.haptics} onPress={() => updateSettings({ haptics: !settings.haptics })} />
        </View>
        <View style={styles.tip}>
          <Icon name="mic" size={20} />
          <Txt v="small" style={{ flex: 1 }}>
            Voice input: record a voice description in step 2 of a report, or use your keyboard’s microphone to dictate. Screen readers (TalkBack, VoiceOver) are fully supported.
          </Txt>
        </View>
      </Section>

      <Section title="Notifications">
        <Chip
          block
          label="Report updates"
          hint="Tell me when staff review, assign or fix my reports"
          selected={settings.notifications}
          onPress={async () => {
            const on = !settings.notifications;
            updateSettings({ notifications: on });
            if (on) await setupNotifications();
          }}
        />
      </Section>

      <Section title="About you (optional)">
        <TextInput
          value={settings.name}
          onChangeText={(name) => updateSettings({ name })}
          placeholder="Your first name"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Your first name, optional"
          style={[styles.input, { fontSize: fs(16), minHeight: target }]}
        />
        <Txt v="small" color={colors.muted} style={{ marginTop: 14, marginBottom: 10 }}>
          How you get around — used to pre-fill who a barrier affects.
        </Txt>
        <Wrap>
          {AFFECTED.map((a) => {
            const on = settings.getAround.includes(a.key);
            return (
              <Chip
                key={a.key}
                label={a.label}
                selected={on}
                onPress={() => updateSettings({ getAround: on ? settings.getAround.filter((k) => k !== a.key) : [...settings.getAround, a.key] })}
              />
            );
          })}
        </Wrap>
      </Section>

      <Section title="About AccessLens">
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <LogoMark size={56} />
          <View style={{ flex: 1 }}>
            <Txt v="h2">AccessLens</Txt>
            <Txt v="small" color={colors.muted}>
              AI-assisted accessibility reporting for inclusive townships. By Trinity Tech.
            </Txt>
          </View>
        </View>
        <Button small variant="outline" label="Reset demo data" icon={<Icon name="refresh" size={18} />} onPress={confirmReset} style={{ marginTop: 16 }} />
        <Button small variant="ghost" label="Show welcome again" onPress={() => updateSettings({ onboarded: false })} style={{ marginTop: 6 }} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tip: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: 12, borderRadius: radius.md, backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink },
  input: { borderWidth: border, borderColor: colors.ink, borderRadius: radius.md, paddingHorizontal: 14, fontFamily: fonts.body, color: colors.ink },
});
