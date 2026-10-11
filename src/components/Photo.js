import { Image, StyleSheet, View } from 'react-native';
import { CATEGORIES } from '../lib/catalog';
import { colors, radius, border } from '../lib/theme';
import Illustration from './Illustration';
import Txt from './Txt';

// A report photo (or demo illustration), optionally with the AI's
// suspected-feature box drawn on top.
export default function Photo({ uri, ai, showBox, label, aspect = 4 / 3, style }) {
  const isIllustration = typeof uri === 'string' && uri.startsWith('illustration:');
  const box = showBox && ai?.box;
  const a11y =
    label ??
    (ai ? `Photo of the barrier. AI suspects ${CATEGORIES[ai.category]?.label.toLowerCase()} in the highlighted area.` : 'Photo of the barrier');

  return (
    <View style={[styles.frame, { aspectRatio: aspect }, style]} accessible accessibilityRole="image" accessibilityLabel={a11y}>
      {isIllustration ? (
        <Illustration kind={uri.split(':')[1]} />
      ) : uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      {box ? (
        <View
          pointerEvents="none"
          style={[
            styles.box,
            { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` },
          ]}
        >
          <View style={styles.tag}>
            <Txt v="label" color={colors.cream} style={{ letterSpacing: 0.6 }}>
              {CATEGORIES[ai.category]?.label} · {Math.round(ai.confidence * 100)}%
            </Txt>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: border,
    borderColor: colors.ink,
    overflow: 'hidden',
    backgroundColor: colors.paper,
  },
  box: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: colors.red,
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: 'rgba(214,40,40,0.10)',
  },
  tag: {
    position: 'absolute',
    top: -14,
    left: -3,
    backgroundColor: colors.red,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.ink,
  },
});
