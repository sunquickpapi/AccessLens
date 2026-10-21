import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import { Card, Screen, StepHeader } from '../../components/Layout';
import AIScoreCard from '../../components/AIScoreCard';
import Photo from '../../components/Photo';
import Txt from '../../components/Txt';
import { analysePhoto } from '../../lib/ai';
import { applyAI, fieldStatus, labelOf, summaryParts, summaryText } from '../../lib/autofill';
import { CATEGORIES } from '../../lib/catalog';
import { colors, fonts, radius, border } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { useStore } from '../../state/store';

function Tag({ status, warn, autoWord = 'AI suggested' }) {
  if (warn) {
    return (
      <View style={[styles.tag, { borderColor: colors.red }]}>
        <Txt v="label" color={colors.red} style={styles.tagText}>
          Please check
        </Txt>
      </View>
    );
  }
  if (!status) return null;
  const edited = status === 'edited';
  return (
    <View style={[styles.tag, edited && { backgroundColor: colors.ink }]}>
      {edited ? null : <Icon name="spark" size={12} color={colors.red} />}
      <Txt v="label" color={edited ? colors.cream : colors.ink} style={styles.tagText}>
        {edited ? 'Edited by you' : autoWord}
      </Txt>
    </View>
  );
}

function Row({ label, value, edit, status, warn, missing, note, autoWord }) {
  const shown = value || (missing ? 'Tap to choose' : '—');
  const tagWords = warn
    ? 'please check'
    : status === 'edited'
      ? 'edited by you'
      : status === 'accepted'
        ? (autoWord ?? 'AI suggested')
        : '';
  return (
    <Pressable
      onPress={() => router.push(edit)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${shown}${tagWords ? `, ${tagWords}` : ''}. Double tap to change.`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.paper }]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.rowHead}>
          <Txt v="label" color={colors.muted}>
            {label}
          </Txt>
          <Tag status={status} warn={warn} autoWord={autoWord} />
        </View>
        <Txt v="bodyStrong" color={missing && !value ? colors.red : colors.ink}>
          {shown}
        </Txt>
        {note ? (
          <Txt v="small" color={warn ? colors.red : colors.muted}>
            {note}
          </Txt>
        ) : null}
      </View>
      <View style={styles.edit}>
        <Icon name="edit" size={20} />
      </View>
    </Pressable>
  );
}

// Step 2 of 2 — the app has filled everything in; the resident checks, edits anything, and sends.
export default function ReviewStep() {
  const { draft, updateDraft, submitDraft, settings } = useStore();
  const { say, tap } = useUI();
  const [sending, setSending] = useState(false);
  const summary = summaryText(draft);
  const ai = draft.ai;

  useEffect(() => {
    say(
      draft.ai?.noBarrier && !draft.category
        ? `Step 2 of 2. ${summary}`
        : `Step 2 of 2. Check and send. ${summary} Tap any line to change it.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retryAI = () => {
    updateDraft({ aiState: 'running', aiError: null });
    analysePhoto(draft.photoUri)
      .then((r) => updateDraft((d) => applyAI(d, r, settings.getAround)))
      .catch((e) => updateDraft({ aiState: 'error', aiError: e?.message ?? null }));
  };

  const locWarn = draft.locationSource === 'none' || (draft.locationSource === 'current' && !draft.location?.confirmed);
  const missing = [
    !draft.category && 'the barrier type',
    !draft.severity && 'the effect on the journey',
    draft.locationSource === 'none' && 'the location',
  ].filter(Boolean);
  const ready = draft.photoUri && draft.location && missing.length === 0;

  const send = () => {
    setSending(true);
    const created = submitDraft();
    tap('success');
    router.replace({ pathname: '/report/sent', params: { id: created.id } });
  };

  // AI found no barrier (or the photo isn't a walkway) and the resident hasn't picked a type themselves:
  // hide the details and offer a retake instead of a disabled Send button.
  const noBarrier = !!ai?.noBarrier && !draft.category;

  const retake = () => {
    updateDraft({
      photoUri: null,
      ai: null,
      aiState: 'idle',
      aiError: null,
      location: null,
      locationSource: null,
      locState: 'idle',
      suggested: {},
      category: null,
      severity: null,
      impacts: [],
      affected: [],
    });
    if (router.canGoBack()) router.back();
    else router.replace('/report/photo');
  };

  const catNote = draft.categoryCorrected && ai?.category ? `AI suggested ${CATEGORIES[ai.category].label}.` : null;

  return (
    <Screen
      footer={
        noBarrier ? (
          <Button
            label="Retake photo"
            onPress={retake}
            icon={<Icon name="camera" color={colors.cream} />}
            hint="Goes back to step 1 to take a new photo"
          />
        ) : (
          <>
            {!ready && missing.length ? (
              <Txt v="small" color={colors.red} center>
                Please choose {missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0]}{' '}
                first.
              </Txt>
            ) : null}
            <Button
              label="Send report"
              disabled={!ready}
              loading={sending}
              onPress={send}
              icon={<Icon name="check" color={colors.cream} />}
            />
          </>
        )
      }
    >
      <StepHeader
        step={2}
        title={noBarrier ? 'No barrier found' : 'Check and send'}
        subtitle={
          noBarrier
            ? 'The AI couldn’t find a barrier in this photo. Try another photo of the walkway.'
            : 'The app filled this in from your photo. Tap any line to change it.'
        }
      />
      <Photo uri={draft.photoUri} ai={ai} showBox={!!ai?.box} />

      <View style={styles.summary} accessible accessibilityLabel={`Summary. ${summary}`} accessibilityLiveRegion="polite">
        <View style={styles.summaryHead}>
          <Icon name="spark" color={colors.red} size={20} />
          <Txt v="label" color={colors.red}>
            Summary
          </Txt>
        </View>
        <Txt v="body" style={{ marginTop: 6 }}>
          {summaryParts(draft).map((p, i) =>
            p.bold ? (
              <Txt key={i} v="body" style={{ fontFamily: fonts.bold }}>
                {p.text}
              </Txt>
            ) : (
              p.text
            ),
          )}
        </Txt>
        <Pressable
          onPress={() => say(summary, { force: true })}
          style={styles.speak}
          accessibilityRole="button"
          accessibilityLabel="Read the summary aloud"
        >
          <Icon name="speaker" size={18} />
          <Txt v="small">Read aloud</Txt>
        </Pressable>
      </View>

      <AIScoreCard ai={ai} style={{ marginTop: 14 }} />

      {draft.aiState === 'running' ? (
        <Card tone="paper" style={{ marginTop: 14 }}>
          <Txt v="bodyStrong" accessibilityLiveRegion="polite">
            AI is still checking your photo…
          </Txt>
        </Card>
      ) : null}
      {draft.aiState === 'error' ? (
        <Card tone="paper" style={{ marginTop: 14, gap: 4 }}>
          <Txt v="bodyStrong">AI check isn’t available right now.</Txt>
          <Txt v="small" color={colors.muted}>
            Choose the barrier type and the effect yourself, or try again. Staff still review every report.
          </Txt>
          <Button
            small
            variant="outline"
            style={{ marginTop: 8 }}
            label="Try the AI again"
            icon={<Icon name="refresh" size={18} />}
            onPress={retryAI}
          />
        </Card>
      ) : null}

      {noBarrier ? (
        <Button
          variant="ghost"
          style={{ marginTop: 14 }}
          label="There is a barrier. Let me choose the type"
          icon={<Icon name="edit" size={20} />}
          onPress={() => router.push('/report/category')}
        />
      ) : (
        <>
          <View style={{ marginTop: 18 }}>
            <Row
              label="Barrier type"
              value={draft.category ? CATEGORIES[draft.category].label : null}
              missing
              status={fieldStatus(draft, 'category')}
              note={
                ai?.noBarrier && !draft.category
                  ? ai.reason === 'not_walkway'
                    ? 'This photo doesn’t look like a walkway. Retake it, or pick the type if there really is a barrier.'
                    : 'The AI didn’t spot a barrier. You know the route, so pick the closest type.'
                  : catNote
              }
              edit="/report/category"
            />
            <Row
              label="Location"
              value={
                draft.locationSource === 'none'
                  ? null
                  : [draft.location?.address ?? 'Pinned on map', draft.landmark].filter(Boolean).join(' · ')
              }
              missing
              status={fieldStatus(draft, 'location')}
              autoWord="From GPS"
              warn={locWarn}
              note={
                draft.locationSource === 'none'
                  ? 'Location access is off. Tap to place the pin.'
                  : locWarn
                    ? 'Your photo had no location saved, so we used where you are now.'
                    : null
              }
              edit="/report/location"
            />
            <Row
              label="Effect on journey"
              value={labelOf.severity(draft.severity)}
              missing
              status={fieldStatus(draft, 'severity')}
              edit="/report/describe"
            />
            <Row
              label="What happened"
              value={labelOf.impacts(draft.impacts)}
              status={fieldStatus(draft, 'impacts')}
              edit="/report/describe"
            />
            <Row
              label="Who it affects"
              value={labelOf.affected(draft.affected)}
              status={fieldStatus(draft, 'affected')}
              edit="/report/describe"
            />
            <Row
              label="Your own words (optional)"
              value={
                [draft.description, draft.voiceUri ? `Voice note · ${draft.voiceSeconds}s` : null].filter(Boolean).join(' · ') ||
                'Add a description or voice note'
              }
              edit="/report/describe"
            />
          </View>

          <View style={styles.note}>
            <Icon name="shield" size={22} />
            <Txt v="small" style={{ flex: 1 }}>
              “AI suggested” lines are the app’s best guess. Township staff verify every report before any action. Your photo and location
              are only used to fix this barrier.
            </Txt>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    marginTop: 14,
    backgroundColor: colors.cream,
    borderWidth: border,
    borderColor: colors.ink,
    borderLeftWidth: 8,
    borderLeftColor: colors.red,
    borderRadius: radius.lg,
    padding: 16,
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: border,
    borderColor: colors.ink,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
    backgroundColor: colors.paper,
  },
  tagText: { fontSize: 10, letterSpacing: 0.6 },
  edit: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 22,
    padding: 14,
    borderTopWidth: border,
    borderBottomWidth: border,
    borderColor: colors.ink,
  },
});
