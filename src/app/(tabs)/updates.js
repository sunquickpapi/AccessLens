import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import { Screen } from '../../components/Layout';
import Txt from '../../components/Txt';
import { colors, radius, border } from '../../lib/theme';
import { timeAgo } from '../../lib/ui';
import { useStore } from '../../state/store';

export default function Updates() {
  const { updates, unread, markAllRead, reports } = useStore();
  return (
    <Screen>
      <Txt v="display" style={{ marginTop: 8 }}>
        Updates
      </Txt>
      <Txt v="body" color={colors.muted} style={{ marginTop: 4, marginBottom: 14 }}>
        {unread ? `${unread} new update${unread > 1 ? 's' : ''} on your reports.` : 'You’re all caught up.'}
      </Txt>
      {unread ? <Button small variant="outline" label="Mark all as read" onPress={markAllRead} style={{ alignSelf: 'flex-start', marginBottom: 12 }} /> : null}

      <View style={{ borderTopWidth: border, borderColor: colors.ink }}>
        {updates.map((u) => {
          const code = reports.find((r) => r.id === u.reportId)?.code;
          return (
            <Pressable
              key={u.id}
              onPress={() => router.push(`/track/${u.reportId}`)}
              accessibilityRole="button"
              accessibilityLabel={`${u.read ? '' : 'New. '}${u.title}. ${u.body}. ${timeAgo(u.at)}`}
              style={({ pressed }) => [styles.row, !u.read && { backgroundColor: colors.paper }, pressed && { opacity: 0.8 }]}
            >
              <View style={[styles.icon, !u.read && { backgroundColor: colors.red }]}>
                <Icon name="bell" size={20} color={u.read ? colors.ink : colors.cream} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="label" color={colors.muted}>
                  {code} · {timeAgo(u.at)}
                </Txt>
                <Txt v="bodyStrong">{u.title}</Txt>
                <Txt v="small" color={colors.muted}>
                  {u.body}
                </Txt>
              </View>
              <Icon name="chevron" size={20} />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: border, borderColor: colors.ink },
  icon: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
