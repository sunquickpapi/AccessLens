import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import { Card, Screen, StepHeader } from '../../components/Layout';
import Photo from '../../components/Photo';
import Txt from '../../components/Txt';
import { analysePhoto } from '../../lib/ai';
import { applyAI, gpsFromExif, labelOf } from '../../lib/autofill';
import { CATEGORIES } from '../../lib/catalog';
import { addressFor, currentPosition } from '../../lib/locate';
import { colors, border, radius } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { DEMO_REGION } from '../../state/seed';
import { useStore } from '../../state/store';

let runToken = 0;

// Step 1 of 2 — snap the barrier. The app then fills in the report by itself:
// location (GPS), barrier type and effect (AI), what happened and who it affects.
export default function CaptureStep() {
  const { draft, updateDraft, settings } = useStore();
  const { say, target } = useUI();
  const advanced = useRef(false);

  useEffect(() => {
    say('Step 1 of 2. Take a photo of the barrier. The app fills in the rest, and you can check it before sending.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = draft.photoUri && (draft.locState === 'finding' || draft.aiState === 'running');
  const finished = draft.photoUri && draft.locState === 'ready' && (draft.aiState === 'done' || draft.aiState === 'error');

  // Go to "Check and send" by itself once everything is filled in (once per photo).
  useEffect(() => {
    if (finished && !advanced.current) {
      advanced.current = true;
      say('Done. Please check the summary.');
      const t = setTimeout(() => router.push('/report/review'), 700);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  async function fillLocation(token, fromCamera, exif) {
    let coords = null;
    let source = 'none';
    const saved = fromCamera ? null : gpsFromExif(exif);
    if (saved) {
      coords = saved;
      source = 'photo';
    } else {
      const pos = await currentPosition();
      if (pos) {
        coords = pos;
        source = fromCamera ? 'camera' : 'current';
      }
    }
    if (token !== runToken) return;
    if (!coords) {
      updateDraft((d) => ({
        location: { latitude: DEMO_REGION.latitude, longitude: DEMO_REGION.longitude, address: null, confirmed: false },
        locationSource: 'none',
        locState: 'ready',
        suggested: { ...d.suggested, location: null },
      }));
      return;
    }
    const address = await addressFor(coords);
    if (token !== runToken) return;
    const location = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, address, confirmed: source !== 'current' };
    updateDraft((d) => ({ location, locationSource: source, locState: 'ready', suggested: { ...d.suggested, location } }));
  }

  function fillFromAI(token, uri) {
    analysePhoto(uri)
      .then((ai) => {
        if (token !== runToken) return;
        updateDraft((d) => applyAI(d, ai, settings.getAround));
      })
      .catch((e) => {
        if (token !== runToken) return;
        updateDraft((d) => ({
          aiState: 'error',
          aiError: e?.message ?? null,
          // Without the AI we can still pre-tick who it affects from the resident's own settings.
          affected: d.affected.length ? d.affected : settings.getAround,
        }));
      });
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
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, exif: true });
      }
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const token = ++runToken;
      advanced.current = false;
      updateDraft({
        photoUri: asset.uri,
        location: null,
        locationSource: null,
        locState: 'finding',
        ai: null,
        aiState: 'running',
        aiError: null,
        category: null,
        categoryCorrected: false,
        severity: null,
        impacts: [],
        affected: [],
        suggested: {},
      });
      say('Photo added. Filling in your report.');
      fillFromAI(token, asset.uri);
      fillLocation(token, fromCamera, asset.exif);
    } catch {
      Alert.alert('Could not open the camera', 'Please try again or choose a photo from your gallery.');
    }
  }

  const ai = draft.ai;
  const locRow =
    draft.locState === 'finding'
      ? { state: 'busy', text: 'Finding where the barrier is…' }
      : draft.locationSource === 'none'
        ? { state: 'warn', text: 'No location access. You’ll place the pin next.' }
        : { state: 'done', text: draft.location?.address ?? 'Location found' };
  const catRow =
    draft.aiState === 'running'
      ? { state: 'busy', text: 'Identifying the barrier…' }
      : draft.aiState === 'error'
        ? { state: 'warn', text: 'AI unavailable. You’ll choose the type next.' }
        : ai?.noBarrier
          ? { state: 'warn', text: ai.reason === 'not_walkway' ? 'Doesn’t look like a walkway. No barrier found.' : 'No barrier spotted. You can still choose a type.' }
          : { state: 'done', text: `${CATEGORIES[draft.category]?.label ?? '—'} · ${Math.round((ai?.confidence ?? 0) * 100)}%` };
  const sevRow =
    draft.aiState === 'running'
      ? { state: 'busy', text: 'Estimating the effect on the journey…' }
      : draft.severity
        ? { state: 'done', text: `${labelOf.severity(draft.severity)}${draft.affected.length ? ` · ${draft.affected.length} group${draft.affected.length > 1 ? 's' : ''} affected` : ''}` }
        : { state: 'warn', text: 'You’ll choose the effect next.' };

  return (
    <Screen
      footer={
        draft.photoUri ? (
          <Button
            label={busy ? 'Filling in your report…' : 'Next: check and send'}
            disabled={!finished}
            loading={busy}
            onPress={() => router.push('/report/review')}
          />
        ) : null
      }
    >
      <StepHeader
        step={1}
        title="Capture the barrier"
        subtitle={draft.photoUri ? 'Your photo is being checked. This takes a few seconds.' : 'Snap a clear photo. The app fills in the rest, and you check it before sending.'}
      />

      {draft.photoUri ? (
        <View style={{ gap: 12 }}>
          <Photo uri={draft.photoUri} ai={ai} showBox={!!ai?.box} label="Your photo of the barrier" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button style={{ flex: 1 }} small variant="outline" label="Retake" icon={<Icon name="camera" size={18} />} onPress={() => pick(true)} />
            <Button style={{ flex: 1 }} small variant="outline" label="Gallery" icon={<Icon name="image" size={18} />} onPress={() => pick(false)} />
          </View>
          <Card tone="paper" style={{ gap: 2 }}>
            <View style={styles.cardHead}>
              <Icon name="spark" size={20} color={colors.red} />
              <Txt v="label">Filling in your report</Txt>
            </View>
            <Check label="Location" {...locRow} />
            <Check label="Barrier type" {...catRow} />
            <Check label="Effect & who it affects" {...sevRow} last />
          </Card>
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
            <Txt v="small">• Take it where the barrier is. The app uses your location.</Txt>
            <Txt v="small">• Avoid showing people’s faces or number plates up close.</Txt>
          </Card>
        </View>
      )}
    </Screen>
  );
}

function Check({ label, state, text, last }) {
  return (
    <View style={[styles.check, last && { borderBottomWidth: 0 }]} accessible accessibilityLabel={`${label}: ${text}`} accessibilityLiveRegion="polite">
      <View style={[styles.dot, state === 'done' && styles.dotDone, state === 'warn' && styles.dotWarn]}>
        {state === 'busy' ? <ActivityIndicator size="small" color={colors.red} /> : <Icon name={state === 'done' ? 'check' : 'edit'} size={14} color={state === 'done' ? colors.cream : colors.ink} />}
      </View>
      <View style={{ flex: 1 }}>
        <Txt v="label" color={colors.muted}>
          {label}
        </Txt>
        <Txt v="bodyStrong">{text}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.ink },
  dot: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: border, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  dotDone: { backgroundColor: colors.ink },
  dotWarn: { backgroundColor: colors.paper },
});
