import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts, radius } from '../lib/theme';
import Txt from './Txt';

// Draw a signature with a finger. Calls onChange({ strokes, width, height })
// with the raw points; the server turns them into a PNG for the defect report.
export default function SignaturePad({ onChange, onDrawStart, onDrawEnd, height = 170 }) {
  const [strokes, setStrokes] = useState([]);
  const box = useRef({ width: 0, height, done: [], current: null, origin: [0, 0], onChange, onDrawStart, onDrawEnd });
  useEffect(() => {
    box.current.onChange = onChange;
    box.current.onDrawStart = onDrawStart;
    box.current.onDrawEnd = onDrawEnd;
    box.current.height = height;
  }, [onChange, onDrawStart, onDrawEnd, height]);

  // PanResponder only reads the ref inside touch handlers, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    const emit = (next) => {
      const b = box.current;
      b.done = next;
      setStrokes(next);
      b.onChange?.(next.length ? { strokes: next, width: b.width, height: b.height } : null);
    };
    // Page coordinates minus the pad's corner. (locationX alone jumps around on iOS
    // when the finger passes over the drawn lines.)
    const point = (e) => {
      const [ox, oy] = box.current.origin;
      const x = Math.max(0, Math.min(box.current.width || 9999, e.nativeEvent.pageX - ox));
      const y = Math.max(0, Math.min(box.current.height, e.nativeEvent.pageY - oy));
      return [Math.round(x), Math.round(y)];
    };
    const finish = () => {
      const b = box.current;
      if (b.current) emit([...b.done, b.current]);
      b.current = null;
      b.onDrawEnd?.();
    };
    const r = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        const b = box.current;
        // the first touch lands on the pad itself, so locationX is reliable here
        b.origin = [e.nativeEvent.pageX - e.nativeEvent.locationX, e.nativeEvent.pageY - e.nativeEvent.locationY];
        b.onDrawStart?.();
        b.current = [point(e)];
        setStrokes([...b.done, b.current]);
      },
      onPanResponderMove: (e) => {
        const b = box.current;
        if (!b.current) return;
        b.current.push(point(e));
        setStrokes([...b.done, b.current]);
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    });
    r.clear = () => emit([]);
    return r;
  });

  const d = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ') + (pts.length === 1 ? ' l0.1 0.1' : '');

  return (
    <View>
      <View
        style={[styles.pad, { height }]}
        onLayout={(e) => {
          box.current.width = e.nativeEvent.layout.width;
        }}
        accessible
        accessibilityLabel="Signature pad. Draw your signature with one finger."
        {...responder.panHandlers}
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            {strokes.map((s, i) => (
              <Path key={i} d={d(s)} stroke="#141428" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
        </View>
        {!strokes.length ? (
          <View style={styles.hint} pointerEvents="none">
            <Txt v="small" color={colors.muted}>
              Sign here with your finger
            </Txt>
          </View>
        ) : null}
      </View>
      {strokes.length ? (
        <Txt v="small" color={colors.red} style={styles.clear} onPress={responder.clear} accessibilityRole="button">
          Clear signature
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.ink, borderRadius: radius.md, backgroundColor: '#fff', overflow: 'hidden' },
  hint: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  clear: { alignSelf: 'flex-end', paddingVertical: 8, fontFamily: fonts.bold },
});
