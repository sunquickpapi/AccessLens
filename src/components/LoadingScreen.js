import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, border } from '../lib/theme';
import { LogoMark } from './Logo';
import Txt from './Txt';

const LINES = ['Clearing the way…', 'Checking the walkways…', 'Connecting to township staff…'];

// Branded launch screen: the logo drops in, the lens gently scans, a poster-style
// progress bar runs underneath. Fades away once the app is ready.
export default function LoadingScreen({ ready, onDone }) {
  const pop = useState(() => new Animated.Value(0))[0]; // logo + text entrance
  const scan = useState(() => new Animated.Value(0))[0]; // lens sway
  const bar = useState(() => new Animated.Value(0))[0]; // progress stripe
  const out = useState(() => new Animated.Value(1))[0]; // exit fade
  const [line, setLine] = useState(0);
  const [minShown, setMinShown] = useState(false);

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start();
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(scan, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(scan, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      ),
      Animated.loop(Animated.timing(bar, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })),
    ];
    loops.forEach((l) => l.start());
    const t = setTimeout(() => setMinShown(true), 1600); // long enough to see, short enough not to annoy
    const lines = setInterval(() => setLine((n) => (n + 1) % LINES.length), 1100);
    return () => {
      loops.forEach((l) => l.stop());
      clearTimeout(t);
      clearInterval(lines);
    };
  }, [pop, scan, bar]);

  useEffect(() => {
    if (ready && minShown) {
      Animated.timing(out, { toValue: 0, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => onDone?.());
    }
  }, [ready, minShown, out, onDone]);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const rise = pop.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const tilt = scan.interpolate({ inputRange: [0, 1], outputRange: ['-7deg', '7deg'] });
  const sway = scan.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] });
  const slide = bar.interpolate({ inputRange: [0, 1], outputRange: [-120, 220] });
  const exitScale = out.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.wrap, { opacity: out, transform: [{ scale: exitScale }] }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="AccessLens is loading"
    >
      <View style={styles.stripeTop} />
      <Animated.View style={{ opacity: pop, transform: [{ scale }, { translateX: sway }, { rotate: tilt }] }}>
        <View style={styles.logoShadow}>
          <LogoMark size={104} />
        </View>
      </Animated.View>
      <Animated.View style={{ alignItems: 'center', opacity: pop, transform: [{ translateY: rise }] }}>
        <Txt v="hero" style={{ marginTop: 26 }}>
          AccessLens
        </Txt>
        <Txt v="label" color={colors.red} style={{ marginTop: 6 }}>
          Report a barrier · clear the way
        </Txt>
      </Animated.View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { transform: [{ translateX: slide }] }]} />
      </View>
      <Txt v="small" color={colors.muted} style={{ marginTop: 12 }}>
        {LINES[line]}
      </Txt>
      <View style={styles.footer}>
        <Txt v="label" color={colors.muted}>
          Trinity Tech
        </Txt>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', zIndex: 100, elevation: 100 },
  stripeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 10, backgroundColor: colors.red, borderBottomWidth: border + 1, borderColor: colors.ink },
  logoShadow: { borderRadius: 26, borderWidth: border + 1, borderColor: colors.ink, shadowColor: colors.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 0, elevation: 6, backgroundColor: colors.red },
  track: { marginTop: 34, width: 200, height: 14, borderRadius: 8, borderWidth: border + 1, borderColor: colors.ink, overflow: 'hidden', backgroundColor: colors.paper },
  fill: { width: 90, height: '100%', backgroundColor: colors.red, borderRightWidth: border, borderLeftWidth: border, borderColor: colors.ink },
  footer: { position: 'absolute', bottom: 46 },
});
