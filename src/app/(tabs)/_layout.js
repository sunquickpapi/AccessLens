import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import Txt from '../../components/Txt';
import { colors, border } from '../../lib/theme';
import { useUI } from '../../lib/ui';
import { useStore } from '../../state/store';

const TABS = {
  index: { label: 'Home', icon: 'home' },
  reports: { label: 'My reports', icon: 'list' },
  updates: { label: 'Updates', icon: 'bell' },
  settings: { label: 'Settings', icon: 'sliders' },
};

function TabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const { unread, resetDraft } = useStore();
  const { large, tap } = useUI();
  const routes = state.routes;
  const left = routes.slice(0, 2);
  const right = routes.slice(2);

  const renderTab = (route) => {
    const index = routes.indexOf(route);
    const focused = state.index === index;
    const t = TABS[route.name];
    const badge = route.name === 'updates' && unread > 0;
    return (
      <Pressable
        key={route.key}
        onPress={() => {
          tap();
          if (!focused) navigation.navigate(route.name);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={badge ? `${t.label}, ${unread} unread` : t.label}
        style={[styles.tab, { minHeight: large ? 68 : 58 }]}
      >
        <View>
          <Icon name={t.icon} size={large ? 28 : 24} color={focused ? colors.red : colors.ink} stroke={focused ? 2.6 : 2.1} />
          {badge ? (
            <View style={styles.badge}>
              <Txt v="label" color={colors.cream} style={{ fontSize: 10, letterSpacing: 0 }}>
                {unread}
              </Txt>
            </View>
          ) : null}
        </View>
        <Txt v="label" color={focused ? colors.red : colors.ink} style={{ fontSize: large ? 12 : 10, letterSpacing: 0.4 }} numberOfLines={1}>
          {t.label}
        </Txt>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {left.map(renderTab)}
      <Pressable
        onPress={() => {
          tap();
          resetDraft();
          router.push('/report/photo');
        }}
        accessibilityRole="button"
        accessibilityLabel="Report a barrier"
        accessibilityHint="Starts a new report with a photo"
        style={({ pressed }) => [styles.fab, large && { width: 76, height: 76, borderRadius: 38 }, pressed && { backgroundColor: colors.redDark }]}
      >
        <Icon name="camera" size={large ? 34 : 30} color={colors.cream} />
      </Pressable>
      {right.map(renderTab)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.cream } }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="reports" />
      <Tabs.Screen name="updates" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderTopWidth: border,
    borderTopColor: colors.ink,
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  fab: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.red,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
    marginHorizontal: 4,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
});
