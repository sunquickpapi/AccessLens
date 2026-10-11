import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { colors } from '../lib/theme';

// Flat poster-style scenes used for demo reports (stand-ins for real photos).
const INK = colors.ink;
const RED = colors.red;
const SKY = '#F6D9B0';
const PAVE = '#E9C99D';
const GRASS = '#C9B37A';

function Ground() {
  return (
    <>
      <Rect width="400" height="300" fill={SKY} />
      <Rect x="0" y="150" width="400" height="150" fill={GRASS} />
      {/* pavement in perspective */}
      <Path d="M150 150 L250 150 L400 300 L0 300 Z" fill={PAVE} stroke={INK} strokeWidth="3" />
      <Path d="M175 175 L225 175 M140 215 L260 215 M95 260 L305 260" stroke={INK} strokeWidth="2" opacity="0.35" />
      {/* covered walkway pillars */}
      <Rect x="40" y="60" width="10" height="150" fill={INK} />
      <Rect x="350" y="60" width="10" height="150" fill={INK} />
      <Rect x="20" y="50" width="360" height="14" fill={INK} />
    </>
  );
}

export default function Illustration({ kind, style }) {
  return (
    <Svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={[{ width: '100%', height: '100%' }, style]}>
      <Ground />
      {kind === 'obstruction' && (
        <G>
          {/* motorcycle parked across the path */}
          <Circle cx="140" cy="235" r="30" fill={INK} />
          <Circle cx="140" cy="235" r="12" fill={PAVE} />
          <Circle cx="270" cy="235" r="30" fill={INK} />
          <Circle cx="270" cy="235" r="12" fill={PAVE} />
          <Path d="M130 225 L170 180 L245 180 L280 225 Z" fill={RED} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <Rect x="180" y="165" width="70" height="16" rx="8" fill={INK} />
          <Path d="M265 180 L285 150 L300 150" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />
        </G>
      )}
      {kind === 'surface' && (
        <G>
          {/* broken, sinking drain cover */}
          <Path d="M150 215 L260 205 L285 260 L130 270 Z" fill="#8C6A44" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <Path d="M165 230 L200 245 L190 262 M225 215 L240 240 L270 248" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
          <Path d="M205 160 L215 185 L200 205" stroke={INK} strokeWidth="3" fill="none" />
          <Circle cx="175" cy="250" r="7" fill={INK} />
        </G>
      )}
      {kind === 'steps' && (
        <G>
          {/* high kerb with no ramp */}
          <Rect x="0" y="232" width="400" height="68" fill="#B9A586" />
          <Path d="M0 232 L400 232 L400 248 L0 248 Z" fill="#F2DFC2" stroke={INK} strokeWidth="4" />
          <Path d="M60 248 L60 300 M340 248 L340 300" stroke={INK} strokeWidth="2" opacity="0.4" />
          <Path d="M178 210 L178 228 M222 210 L222 228" stroke={RED} strokeWidth="5" strokeLinecap="round" />
          <Path d="M168 214 L178 202 L188 214 M212 214 L222 202 L232 214" stroke={RED} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      {kind === 'fixed' && (
        <G>
          {/* clear path, bollards and dropped kerb */}
          {[110, 290].map((x) => (
            <G key={x}>
              <Rect x={x - 9} y="175" width="18" height="70" rx="9" fill={INK} />
              <Rect x={x - 9} y="190" width="18" height="10" fill={RED} />
            </G>
          ))}
          <Circle cx="200" cy="210" r="34" fill={colors.cream} stroke={INK} strokeWidth="4" />
          <Path d="M183 211 L196 224 L219 198" stroke={INK} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      <Line x1="0" y1="1.5" x2="400" y2="1.5" stroke={INK} strokeWidth="3" />
    </Svg>
  );
}
