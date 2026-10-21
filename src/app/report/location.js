import { useEffect, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import { Card, Screen, StepHeader } from '../../components/Layout';
import MapPreview from '../../components/MapPreview';
import Txt from '../../components/Txt';
import { addressFor, currentPosition } from '../../lib/locate';
import { colors, fonts, radius, border } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { DEMO_REGION } from '../../state/seed';
import { useStore } from '../../state/store';

const SOURCE_NOTE = {
  camera: 'Found with GPS when you took the photo.',
  photo: 'Found from the location saved in your photo.',
  current: 'Your photo had no location saved, so this is where you are now. Please check it.',
  manual: 'You moved the pin.',
  none: 'Location access is off. Drag the pin to the barrier.',
};

// Edit sheet: move the pin, add a landmark.
export default function LocationEdit() {
  const { draft, updateDraft } = useStore();
  const { say, fs, target } = useUI();
  const [finding, setFinding] = useState(false);
  const loc = draft.location;

  useEffect(() => {
    say('Edit the location. Drag the pin to the barrier, or add a landmark.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onDragEnd(coords) {
    const address = await addressFor(coords);
    updateDraft({ location: { ...coords, address, confirmed: true }, locationSource: 'manual' });
  }

  async function useCurrent() {
    setFinding(true);
    const pos = await currentPosition();
    if (pos) {
      const address = await addressFor(pos);
      updateDraft({ location: { ...pos, address, confirmed: true }, locationSource: 'manual' });
      say(address ? `Location set to ${address}.` : 'Location set.');
    } else {
      say('Location access is off.');
    }
    setFinding(false);
  }

  const done = () => {
    if (loc) updateDraft({ location: { ...loc, confirmed: true }, locationSource: draft.locationSource === 'none' ? 'manual' : draft.locationSource });
    router.back();
  };

  const region = loc ? { latitude: loc.latitude, longitude: loc.longitude, latitudeDelta: 0.003, longitudeDelta: 0.003 } : DEMO_REGION;

  return (
    <Screen edges={['top', 'bottom']} footer={<Button label="This is where the barrier is" icon={<Icon name="check" color={colors.cream} />} onPress={done} />}>
      <StepHeader edit title="Where is it?" subtitle={Platform.OS === 'web' ? 'Drag the pin to the barrier.' : 'Press and drag the pin to the barrier.'} />
      <MapPreview
        region={region}
        height={260}
        draggable
        pins={loc ? [{ id: 'me', latitude: loc.latitude, longitude: loc.longitude, title: 'Barrier location', active: true }] : []}
        onDragEnd={onDragEnd}
        label="Map with the barrier location pin. Press and drag the pin to adjust it."
      />
      <View style={styles.addr}>
        <Icon name="pin" color={colors.red} />
        <View style={{ flex: 1 }}>
          <Txt v="bodyStrong">{loc?.address ?? 'Pinned location'}</Txt>
          <Txt v="small" color={draft.locationSource === 'current' || draft.locationSource === 'none' ? colors.red : colors.muted}>
            {SOURCE_NOTE[draft.locationSource] ?? ''}
          </Txt>
        </View>
      </View>
      <Button small variant="ghost" label="Use my current location" loading={finding} icon={<Icon name="locate" size={20} />} onPress={useCurrent} />
      <Txt v="label" style={{ marginTop: 18, marginBottom: 10 }}>
        Nearby landmark (optional)
      </Txt>
      <TextInput
        value={draft.landmark}
        onChangeText={(landmark) => updateDraft({ landmark })}
        placeholder="e.g. outside Block C"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Nearby landmark, optional"
        style={[styles.input, { fontSize: fs(16), minHeight: target }]}
      />
      {draft.locationSource === 'none' ? (
        <Card tone="paper" style={{ marginTop: 16 }}>
          <Txt v="small">Tip: turn on location access for AccessLens in your phone’s settings, and the app will find the barrier by itself next time.</Txt>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addr: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 14 },
  input: {
    borderWidth: border,
    borderColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.cream,
  },
});
