import { Text } from 'react-native';
import { colors, fonts } from '../lib/theme';
import { useUI } from '../lib/ui';

const VARIANTS = {
  hero: { fontFamily: fonts.display, size: 38, lh: 1.02, ls: -0.5, upper: true },
  display: { fontFamily: fonts.display, size: 28, lh: 1.08, ls: -0.3, upper: true },
  h1: { fontFamily: fonts.display, size: 22, lh: 1.15, ls: -0.2 },
  h2: { fontFamily: fonts.bold, size: 18, lh: 1.3 },
  body: { fontFamily: fonts.body, size: 16, lh: 1.45 },
  bodyStrong: { fontFamily: fonts.semibold, size: 16, lh: 1.45 },
  small: { fontFamily: fonts.medium, size: 14, lh: 1.4 },
  label: { fontFamily: fonts.bold, size: 12, lh: 1.3, ls: 1.4, upper: true },
};

export default function Txt({ v = 'body', color = colors.ink, style, children, center, ...rest }) {
  const { fs } = useUI();
  const s = VARIANTS[v];
  const size = fs(s.size);
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      style={[
        {
          fontFamily: s.fontFamily,
          fontSize: size,
          lineHeight: Math.round(size * s.lh),
          letterSpacing: s.ls ?? 0,
          textTransform: s.upper ? 'uppercase' : 'none',
          color,
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
      accessibilityRole={v === 'hero' || v === 'display' || v === 'h1' ? 'header' : undefined}
      {...rest}
    >
      {children}
    </Text>
  );
}
