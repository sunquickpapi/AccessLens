import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, border } from '../lib/theme';
import { useUI } from '../lib/ui';
import Icon from './Icon';
import Txt from './Txt';

// Selectable option. multi=true behaves as a checkbox, otherwise a radio.
export default function Chip({ label, hint, selected, onPress, multi = true, block }) {
  const { target, tap } = useUI();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress?.();
      }}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? { checked: !!selected } : { selected: !!selected }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.chip,
        block && styles.block,
        { minHeight: block ? target : Math.max(48, target - 8) },
        selected && styles.on,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.tick, selected && styles.tickOn, !multi && { borderRadius: 12 }]}>
        {selected ? <Icon name="check" size={14} color={colors.cream} stroke={3} /> : null}
      </View>
      <View style={{ flexShrink: 1 }}>
        <Txt v="bodyStrong" color={selected ? colors.cream : colors.ink}>
          {label}
        </Txt>
        {hint && block ? (
          <Txt v="small" color={selected ? colors.cream : colors.muted}>
            {hint}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: border,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
  },
  block: { borderRadius: radius.md, width: '100%', paddingVertical: 14 },
  on: { backgroundColor: colors.ink },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  tickOn: { backgroundColor: colors.red, borderColor: colors.cream },
});
