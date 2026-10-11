import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { colors } from '../lib/theme';
import Txt from './Txt';

// The AccessLens mark: a lens that finds the step-free path.
export function LogoMark({ size = 44, bg = colors.red, fg = colors.cream }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="AccessLens logo">
      {bg ? <Rect width="100" height="100" rx="24" fill={bg} /> : null}
      <Circle cx="45" cy="45" r="24" fill="none" stroke={fg} strokeWidth={7} />
      <Line x1="62.5" y1="62.5" x2="77" y2="77" stroke={fg} strokeWidth={8} strokeLinecap="round" />
      <Path d="M31 53 H39 L51 41 H59" fill="none" stroke={fg} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Wordmark({ size = 40, color = colors.ink }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityLabel="AccessLens">
      <LogoMark size={size} />
      <Txt v="h1" color={color} style={{ letterSpacing: -0.4 }}>
        AccessLens
      </Txt>
    </View>
  );
}
