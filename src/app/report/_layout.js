import { Stack } from 'expo-router';
import { colors } from '../../lib/theme';

// photo (snap) → review (check and send) → sent.
// category, describe and location open as edit sheets from "Check and send".
export default function ReportLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream }, gestureEnabled: true }}>
      <Stack.Screen name="category" options={{ presentation: 'modal' }} />
      <Stack.Screen name="describe" options={{ presentation: 'modal' }} />
      <Stack.Screen name="location" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
