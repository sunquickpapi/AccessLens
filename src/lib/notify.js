import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let ready = false;

export async function setupNotifications() {
  if (Platform.OS === 'web') return false;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('updates', {
        name: 'Report updates',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current : await Notifications.requestPermissionsAsync();
    ready = !!status.granted;
  } catch {
    ready = false;
  }
  return ready;
}

// Shows a phone notification for a report update (local only in the prototype;
// in production the staff website would trigger a push from the server).
export async function notifyUpdate(title, body, reportId) {
  if (!ready) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { reportId } },
      trigger: null,
    });
  } catch {
    // ignore — the in-app Updates list still has it
  }
}
