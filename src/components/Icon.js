import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { colors } from '../lib/theme';

// Small hand-drawn line icon set (24px grid, 2.2px stroke) so the app
// needs no icon font. Decorative by default: hidden from screen readers.
const P = {
  camera: (
    <>
      <Path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2l1.6-2.2h5.8L16.5 6h2A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
      <Circle cx="12" cy="13" r="3.8" />
    </>
  ),
  image: (
    <>
      <Rect x="3" y="4" width="18" height="16" rx="2.5" />
      <Circle cx="8.5" cy="9.5" r="1.8" />
      <Path d="M21 16l-5-5-9 9" />
    </>
  ),
  pin: (
    <>
      <Path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <Circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  locate: (
    <>
      <Circle cx="12" cy="12" r="6.5" />
      <Circle cx="12" cy="12" r="2" />
      <Line x1="12" y1="2" x2="12" y2="5" />
      <Line x1="12" y1="19" x2="12" y2="22" />
      <Line x1="2" y1="12" x2="5" y2="12" />
      <Line x1="19" y1="12" x2="22" y2="12" />
    </>
  ),
  home: <Path d="M3.5 10.5L12 4l8.5 6.5V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" />,
  list: (
    <>
      <Line x1="9" y1="6" x2="20" y2="6" />
      <Line x1="9" y1="12" x2="20" y2="12" />
      <Line x1="9" y1="18" x2="20" y2="18" />
      <Circle cx="4.5" cy="6" r="1" />
      <Circle cx="4.5" cy="12" r="1" />
      <Circle cx="4.5" cy="18" r="1" />
    </>
  ),
  bell: (
    <>
      <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <Path d="M10 21h4" />
    </>
  ),
  sliders: (
    <>
      <Line x1="4" y1="7" x2="20" y2="7" />
      <Line x1="4" y1="17" x2="20" y2="17" />
      <Circle cx="9" cy="7" r="2.4" fill={colors.cream} />
      <Circle cx="15" cy="17" r="2.4" fill={colors.cream} />
    </>
  ),
  mic: (
    <>
      <Rect x="9" y="3" width="6" height="11" rx="3" />
      <Path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <Line x1="12" y1="17.5" x2="12" y2="21" />
    </>
  ),
  stop: <Rect x="6" y="6" width="12" height="12" rx="2" />,
  play: <Path d="M8 5l11 7-11 7z" />,
  check: <Polyline points="4.5 12.5 9.5 17.5 19.5 6.5" />,
  chevron: <Polyline points="9 5 16 12 9 19" />,
  back: <Polyline points="15 5 8 12 15 19" />,
  close: (
    <>
      <Line x1="6" y1="6" x2="18" y2="18" />
      <Line x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  speaker: (
    <>
      <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <Path d="M15.5 9a4 4 0 0 1 0 6" />
      <Path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  spark: (
    <>
      <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <Path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  wrench: <Path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 1-2-2zM14.5 6.5L17 4" />,
  shield: (
    <>
      <Path d="M12 3l7.5 3v6c0 4.5-3.2 7.8-7.5 9-4.3-1.2-7.5-4.5-7.5-9V6z" />
      <Polyline points="8.5 12 11 14.5 15.5 9.5" />
    </>
  ),
  plus: (
    <>
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  edit: <Path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  refresh: (
    <>
      <Path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" />
      <Polyline points="4 3.5 4 8 8.5 8" />
      <Path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" />
      <Polyline points="20 20.5 20 16 15.5 16" />
    </>
  ),
  eye: (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  user: (
    <>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
};

export default function Icon({ name, size = 24, color = colors.ink, stroke = 2.2 }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {P[name]}
    </Svg>
  );
}
