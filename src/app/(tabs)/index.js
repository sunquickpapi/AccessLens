import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import Illustration from '../../components/Illustration';
import { Card, Screen, Section } from '../../components/Layout';
import { Wordmark } from '../../components/Logo';
import MapPreview from '../../components/MapPreview';
import StatusPill from '../../components/StatusPill';
import Txt from '../../components/Txt';
import { CATEGORIES, CATEGORY_KEYS } from '../../lib/catalog';
import { colors, radius, border } from '../../lib/theme';
import { timeAgo } from '../../lib/ui';
import { DEMO_REGION } from '../../state/seed';
import { useStore } from '../../state/store';

export default function Home() {
  const { reports, updates, settings, resetDraft } = useStore();
  const open = reports.filter((r) => r.stage !== 'confirmed');
  const resolved = reports.length - open.length;
  const latest = updates[0];
  const start = () => {
    resetDraft();
    router.push('/report/photo');
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Wordmark size={40} />
      </View>

      {/* Primary action */}
      <View style={styles.hero}>
        <Txt v="label" color={colors.cream}>
          {settings.name ? `Hi ${settings.name}` : 'Township of tomorrow'}
        </Txt>
        <Txt v="display" color={colors.cream} style={{ marginTop: 8 }}>
          Something blocking your way?
        </Txt>
        <Txt v="body" color={colors.cream} style={{ marginTop: 8, marginBottom: 18 }}>
          Report a walkway barrier with one photo. It takes about a minute.
        </Txt>
        <Button label="Report a barrier" variant="dark" icon={<Icon name="camera" color={colors.cream} />} onPress={start} hint="Opens the camera to photograph the barrier" />
      </View>

      {/* Counts */}
      <View style={styles.stats}>
        <Pressable style={styles.stat} onPress={() => router.navigate('/reports')} accessibilityRole="button" accessibilityLabel={`${open.length} open reports. View my reports`}>
          <Txt v="hero" color={colors.red}>
            {open.length}
          </Txt>
          <Txt v="label">In progress</Txt>
        </Pressable>
        <Pressable style={[styles.stat, { borderLeftWidth: border }]} onPress={() => router.navigate('/reports')} accessibilityRole="button" accessibilityLabel={`${resolved} resolved reports. View my reports`}>
          <Txt v="hero">{resolved}</Txt>
          <Txt v="label">Resolved</Txt>
        </Pressable>
      </View>

      {latest ? (
        <Section title="Latest update" right={<Txt v="small" color={colors.muted}>{timeAgo(latest.at)}</Txt>}>
          <Pressable onPress={() => router.push(`/track/${latest.reportId}`)} accessibilityRole="button" accessibilityHint="Opens the report tracker">
            <Card tone="paper" style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={styles.updIcon}>
                <Icon name="bell" color={colors.cream} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">{latest.title}</Txt>
                <Txt v="small" color={colors.muted} numberOfLines={2}>
                  {latest.body}
                </Txt>
              </View>
              <Icon name="chevron" />
            </Card>
          </Pressable>
        </Section>
      ) : null}

      <Section title="Reports near you">
        <MapPreview
          region={DEMO_REGION}
          height={190}
          label={`Map showing ${reports.length} reports in your area`}
          pins={reports
            .filter((r) => r.location)
            .map((r) => ({
              id: r.id,
              latitude: r.location.latitude,
              longitude: r.location.longitude,
              title: `${r.code} · ${CATEGORIES[r.category].label}`,
              subtitle: r.location.address,
              active: r.stage !== 'confirmed',
            }))}
          onPressPin={(id) => router.push(`/track/${id}`)}
        />
        {open.slice(0, 2).map((r) => (
          <Pressable key={r.id} onPress={() => router.push(`/track/${r.id}`)} style={styles.listRow} accessibilityRole="button" accessibilityLabel={`${r.code}, ${CATEGORIES[r.category].label}, ${r.location?.address}`}>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="bodyStrong">{CATEGORIES[r.category].label}</Txt>
              <Txt v="small" color={colors.muted} numberOfLines={1}>
                {r.location?.address}
              </Txt>
              <StatusPill report={r} />
            </View>
            <Icon name="chevron" />
          </Pressable>
        ))}
      </Section>

      <Section title="What you can report">
        <View style={{ gap: 12 }}>
          {CATEGORY_KEYS.map((k) => (
            <View key={k} style={styles.cat} accessible accessibilityLabel={`${CATEGORIES[k].label}. ${CATEGORIES[k].description}`}>
              <View style={styles.catPic}>
                <Illustration kind={k} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="h2">{CATEGORIES[k].label}</Txt>
                <Txt v="small" color={colors.muted}>
                  {CATEGORIES[k].short}
                </Txt>
              </View>
            </View>
          ))}
        </View>
        <Txt v="small" color={colors.muted} style={{ marginTop: 12 }}>
          AI suggests the barrier type from your photo and shows how sure it is. You confirm it, and township staff verify before any work is done.
        </Txt>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  hero: { backgroundColor: colors.red, borderRadius: radius.lg, borderWidth: border, borderColor: colors.ink, padding: 20 },
  stats: { flexDirection: 'row', marginTop: 16, borderWidth: border, borderColor: colors.ink, borderRadius: radius.lg, overflow: 'hidden' },
  stat: { flex: 1, padding: 16, borderColor: colors.ink, gap: 2 },
  updIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.ink },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: border, borderColor: colors.ink },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: border, borderColor: colors.ink, borderRadius: radius.md, padding: 10, backgroundColor: colors.cream },
  catPic: { width: 84, height: 63, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 2, borderColor: colors.ink },
});
