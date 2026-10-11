import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { colors, radius, border } from '../lib/theme';

// Native map. `pins` = [{ id, latitude, longitude, title, active }]
export default function MapPreview({ region, pins = [], height = 200, onPressPin, onRegionChangeComplete, draggable, onDragEnd, label }) {
  return (
    <View style={[styles.frame, { height }]} accessible={!draggable} accessibilityLabel={label}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        region={draggable ? undefined : region}
        onRegionChangeComplete={onRegionChangeComplete}
        toolbarEnabled={false}
        showsPointsOfInterest={false}
      >
        {pins.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            title={p.title}
            description={p.subtitle}
            pinColor={p.active ? colors.red : colors.ink}
            draggable={draggable && p.active}
            onDragEnd={(e) => onDragEnd?.(e.nativeEvent.coordinate)}
            onCalloutPress={() => onPressPin?.(p.id)}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    borderWidth: border,
    borderColor: colors.ink,
    overflow: 'hidden',
    backgroundColor: colors.paper,
  },
});
