import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, border } from '../lib/theme';
import Icon from './Icon';
import Txt from './Txt';

// Web preview fallback: react-native-maps is native-only, so the browser
// build draws a simple schematic map with the same pins.
export default function MapPreview({ region, pins = [], height = 200, onPressPin, label }) {
  const toXY = (p) => ({
    left: `${50 + ((p.longitude - region.longitude) / region.longitudeDelta) * 100}%`,
    top: `${50 - ((p.latitude - region.latitude) / region.latitudeDelta) * 100}%`,
  });
  return (
    <View style={[styles.frame, { height }]} accessibilityLabel={label}>
      <View style={[styles.road, { top: '42%', left: 0, right: 0, height: 18 }]} />
      <View style={[styles.road, { left: '58%', top: 0, bottom: 0, width: 18 }]} />
      <View style={[styles.road, { top: '75%', left: 0, width: '58%', height: 12 }]} />
      {pins.map((p) => (
        <Pressable key={p.id} onPress={() => onPressPin?.(p.id)} style={[styles.pin, toXY(p)]} accessibilityLabel={p.title}>
          <Icon name="pin" size={p.active ? 34 : 28} color={p.active ? colors.red : colors.ink} />
        </Pressable>
      ))}
      <View style={styles.badge}>
        <Txt v="label" style={{ fontSize: 10 }}>
          Map preview
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    borderWidth: border,
    borderColor: colors.ink,
    overflow: 'hidden',
    backgroundColor: '#F3DDBA',
  },
  road: { position: 'absolute', backgroundColor: colors.cream, borderColor: '#D9BE96', borderWidth: 1 },
  pin: { position: 'absolute', marginLeft: -15, marginTop: -30 },
  badge: { position: 'absolute', right: 10, bottom: 10, backgroundColor: colors.cream, borderWidth: 2, borderColor: colors.ink, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
});
