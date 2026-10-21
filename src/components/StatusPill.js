import { View } from 'react-native';
import { statusLabel } from '../lib/catalog';
import { colors, radius } from '../lib/theme';
import Txt from './Txt';

export default function StatusPill({ report }) {
  const done = report.stage === 'confirmed';
  const light = report.synced === false || report.stage === 'ai' || report.stage === 'report' || report.stage === 'closed';
  const bg = done ? colors.ink : light ? colors.cream : colors.red;
  const fg = light ? colors.ink : colors.cream;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: bg,
        borderColor: colors.ink,
        borderWidth: 2,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Txt v="label" color={fg} style={{ letterSpacing: 0.8 }} numberOfLines={1}>
        {statusLabel(report)}
      </Txt>
    </View>
  );
}
