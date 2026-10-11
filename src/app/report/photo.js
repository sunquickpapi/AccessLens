import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import { Card, Screen, StepHeader } from '../../components/Layout';
import MapPreview from '../../components/MapPreview';
import Photo from '../../components/Photo';
import Txt from '../../components/Txt';
import { analysePhoto } from '../../lib/ai';
import { colors, fonts, radius, border } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { DEMO_REGION } from '../../state/seed';
import { useStore } from '../../state/store';

let analysisToken = 0;

// Step 1 — Capture a photo and confirm the location.
export default function CaptureStep() {
  const { draft, updateDraft } = useStore();
  const { say, fs, target } = useUI();
  const [locState, setLocState] = useState(draft.location ? 'ready' : 'idle'); // idle | finding | ready | denied
  const asked = useRef(false);

  useEffect(() => {
    say('Step 1 of 4. Take a photo of the barrier, then confirm where it is.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (draft.photoUri && !draft.location && !asked.current) {
      asked.current = true;
      findMe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.photoUri]);

  function startAnalysis(uri) {
    const token = ++analysisToken;
    updateDraft({ aiState: 'running', ai: null, category: null, categoryCorrected: false });
    analysePhoto(uri)
      .then((ai) => {
        if (token !== analysisToken) return;
        updateDraft({ ai, aiState: 'done', category: ai.category });
      })
      .catch(() => token === analysisToken && updateDraft({ aiState: 'error' }));
  }

  async function pick(fromCamera) {
    try {
      let result;
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera access needed', 'Allow camera access to photograph the barrier, or choose a photo from your gallery.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, exif: false });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      }
      if (result.canceled || !result.assets?.[0]) return;
      const uri = result.assets[0].uri;
      updateDraft({ photoUri: uri });
      startAnalysis(uri);
      say('Photo added. AI is checking it while you confirm the location.');
    } catch {
      Alert.alert('Could not open the camera', 'Please try again or choose a photo from your gallery.');
    }
  }

  async function addressFor(coords) {
    try {
      const [a] = await Location.reverseGeocodeAsync(coords);
      if (!a) return null;
      return [a.name, a.street, a.district || a.subregion, a.city].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', ');
    } catch {
      return null;
    }
  }

  async function findMe() {
    setLocState('finding');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocState('denied');
        updateDraft({ location: { latitude: DEMO_REGION.latitude, longitude: DEMO_REGION.longitude, address: null, confirmed: false } });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      const address = await addressFor(coords);
      updateDraft({ location: { ...coords, address, accuracy: pos.coords.accuracy, confirmed: false } });
      setLocState('ready');
      say(address ? `Location found: ${address}. Please confirm.` : 'Location found. Please confirm.');
    } catch {
      setLocState('denied');
      updateDraft({ location: { latitude: DEMO_REGION.latitude, longitude: DEMO_REGION.longitude, address: null, confirmed: false } });
    }
  }

  async function onDragEnd(coords) {
    const address = await addressFor(coords);
    updateDraft({ location: { ...coords, address, confirmed: false } });
  }

  const loc = draft.location;
  const canContinue = !!draft.photoUri && !!loc?.confirmed;
  const region = loc ? { latitude: loc.latitude, longitude: loc.longitude, latitudeDelta: 0.003, longitudeDelta: 0.003 } : DEMO_REGION;

  return (
    <Screen
      footer={
        <Button
          label="Next: describe the impact"
          disabled={!canContinue}
          hint={canContinue ? undefined : 'Add a photo and confirm the location first'}
          onPress={() => router.push('/report/describe')}
        />
      }
    >
      <StepHeader step={1} title="Capture the barrier" subtitle="Take a clear photo that shows the barrier and the path around it." />

      {draft.photoUri ? (
        <View style={{ gap: 10 }}>
          <Photo uri={draft.photoUri} label="Your photo of the barrier" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button style={{ flex: 1 }} small variant="outline" label="Retake" icon={<Icon name="camera" size={18} />} onPress={() => pick(true)} />
            <Button style={{ flex: 1 }} small variant="outline" label="Gallery" icon={<Icon name="image" size={18} />} onPress={() => pick(false)} />
          </View>
          <View style={styles.aiNote} accessibilityLiveRegion="polite">
            <Icon name="spark" size={20} color={colors.red} />
            <Txt v="small" style={{ flex: 1 }}>
              {draft.aiState === 'running'
                ? 'AI is checking your photo…'
                : draft.aiState === 'done'
                  ? 'AI check finished — you will review it in step 3.'
                  : draft.aiState === 'error'
                    ? 'AI check unavailable — you can choose the category yourself.'
                    : ''}
            </Txt>
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Button
            label="Take a photo"
            icon={<Icon name="camera" color={colors.cream} size={28} />}
            onPress={() => pick(true)}
            style={{ minHeight: target + 40 }}
            hint="Opens the camera"
          />
          <Button label="Choose from gallery" variant="outline" icon={<Icon name="image" />} onPress={() => pick(false)} />
          <Card tone="paper" style={{ gap: 6 }}>
            <Txt v="label">Photo tips</Txt>
            <Txt v="small">• Stand back so the whole barrier is in the frame.</Txt>
            <Txt v="small">• Include some of the walkway around it.</Txt>
            <Txt v="small">• Avoid showing people’s faces or number plates up close.</Txt>
          </Card>
        </View>
      )}

      {draft.photoUri ? (
        <View style={{ marginTop: 26 }}>
          <Txt v="label">Where is it?</Txt>
          <View style={styles.rule} />
          {locState === 'finding' ? (
            <Card tone="paper">
              <Txt v="bodyStrong" accessibilityLiveRegion="polite">
                Finding your location…
              </Txt>
            </Card>
          ) : loc ? (
            <View style={{ gap: 12 }}>
              <MapPreview
                region={region}
                height={200}
                draggable
                pins={[{ id: 'me', latitude: loc.latitude, longitude: loc.longitude, title: 'Barrier location', active: true }]}
                onDragEnd={onDragEnd}
                label="Map with the barrier location pin. Press and drag the pin to adjust it."
              />
              <View style={styles.addr}>
                <Icon name="pin" color={colors.red} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{loc.address ?? (locState === 'denied' ? 'Location access is off' : 'Pinned location')}</Txt>
                  <Txt v="small" color={colors.muted}>
                    {locState === 'denied'
                      ? Platform.OS === 'web'
                        ? 'Drag the pin to the barrier, or describe a landmark below.'
                        : 'Press and drag the pin to the barrier, or describe a landmark below.'
                      : 'Not quite right? Press and drag the pin.'}
                  </Txt>
                </View>
              </View>
              <Button small variant="ghost" label="Use my current location" icon={<Icon name="locate" size={20} />} onPress={findMe} />
              <TextInput
                value={draft.landmark}
                onChangeText={(landmark) => updateDraft({ landmark })}
                placeholder="Nearby landmark (optional), e.g. outside Block C"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Nearby landmark, optional"
                style={[styles.input, { fontSize: fs(16), minHeight: target }]}
              />
              <Chip
                block
                label="Yes, this is where the barrier is"
                selected={!!loc.confirmed}
                onPress={() => updateDraft({ location: { ...loc, confirmed: !loc.confirmed } })}
              />
            </View>
          ) : (
            <Button variant="outline" label="Find my location" icon={<Icon name="locate" />} onPress={findMe} />
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rule: { height: 3, backgroundColor: colors.ink, marginTop: 8, marginBottom: 14 },
  aiNote: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 24 },
  addr: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
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
