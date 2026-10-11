import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { colors, radius, border } from '../lib/theme';
import { useUI } from '../lib/ui';
import Button from './Button';
import Icon from './Icon';
import Txt from './Txt';

const MAX_SECONDS = 60;

function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Optional voice input: residents can describe the barrier by speaking
// instead of typing. The recording is attached to the report for staff.
export default function VoiceNote({ uri, seconds, onChange }) {
  const { say } = useUI();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);
  const player = useAudioPlayer(uri ? { uri } : null);
  const playStatus = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);

  const elapsed = (rec.durationMillis ?? 0) / 1000;

  useEffect(() => {
    if (rec.isRecording && elapsed >= MAX_SECONDS) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, rec.isRecording]);

  async function start() {
    setBusy(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone needed', 'Allow microphone access to record a voice description. You can still type instead.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      say('Recording. Describe the barrier, then tap stop.');
    } catch {
      Alert.alert('Could not start recording', 'Please try again, or type your description instead.');
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      onChange({ voiceUri: recorder.uri, voiceSeconds: Math.round(elapsed) });
      say('Voice description saved.');
    } catch {
      // ignore
    }
  }

  if (rec.isRecording) {
    return (
      <View style={[styles.box, { backgroundColor: colors.red }]}>
        <View style={styles.row}>
          <View style={styles.liveDot} />
          <Txt v="h2" color={colors.cream} accessibilityLiveRegion="polite">
            Recording {mmss(elapsed)} / {mmss(MAX_SECONDS)}
          </Txt>
        </View>
        <Button label="Stop recording" variant="dark" icon={<Icon name="stop" color={colors.cream} />} onPress={stop} />
      </View>
    );
  }

  if (uri) {
    const playing = playStatus.playing;
    return (
      <View style={styles.box}>
        <View style={styles.row}>
          <Icon name="mic" />
          <Txt v="bodyStrong">Voice description · {mmss(seconds)}</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            style={{ flex: 1 }}
            small
            variant="outline"
            label={playing ? 'Pause' : 'Play'}
            icon={<Icon name={playing ? 'stop' : 'play'} size={18} />}
            onPress={() => {
              if (playing) player.pause();
              else {
                if (playStatus.didJustFinish || playStatus.currentTime >= playStatus.duration) player.seekTo(0);
                player.play();
              }
            }}
          />
          <Button
            style={{ flex: 1 }}
            small
            variant="outline"
            label="Remove"
            icon={<Icon name="close" size={18} />}
            onPress={() => onChange({ voiceUri: null, voiceSeconds: 0 })}
          />
        </View>
      </View>
    );
  }

  return (
    <Button
      variant="outline"
      label="Describe it by voice"
      hint="Records up to one minute. Optional."
      icon={<Icon name="mic" />}
      loading={busy}
      onPress={start}
    />
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: border, borderColor: colors.ink, borderRadius: radius.md, padding: 14, gap: 12, backgroundColor: colors.paper },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.cream },
});
