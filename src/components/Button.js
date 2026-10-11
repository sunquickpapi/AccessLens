import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, radius, border } from '../lib/theme';
import { useUI } from '../lib/ui';
import Txt from './Txt';

// variants: primary (red), dark (ink), outline (cream with ink rule), ghost
export default function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  hint,
  disabled,
  loading,
  style,
  small,
  accessibilityLabel,
}) {
  const { target, tap } = useUI();
  const palette = {
    primary: { bg: colors.red, fg: colors.cream, bd: colors.ink, pressed: colors.redDark },
    dark: { bg: colors.ink, fg: colors.cream, bd: colors.ink, pressed: '#000' },
    outline: { bg: colors.cream, fg: colors.ink, bd: colors.ink, pressed: colors.paper },
    ghost: { bg: 'transparent', fg: colors.ink, bd: 'transparent', pressed: colors.paper },
  }[variant];

  return (
    <Pressable
      onPress={() => {
        tap();
        onPress?.();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: small ? 48 : target,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.bd,
          opacity: disabled ? 0.45 : 1,
          transform: [{ translateY: pressed && variant !== 'ghost' ? 2 : 0 }],
        },
        variant !== 'ghost' && !pressed && styles.offset,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={palette.fg} /> : icon}
        {label ? (
          <Txt v="bodyStrong" color={palette.fg} style={{ fontFamily: fonts.bold }}>
            {label}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: border,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  // flat "printed" offset shadow — a solid block, no blur
  offset: { borderBottomWidth: 5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
});
