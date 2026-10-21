import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { ArchivoBlack_400Regular } from '@expo-google-fonts/archivo-black';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import LoadingScreen from '../components/LoadingScreen';
import { StoreProvider, useStore } from '../state/store';
import { setupNotifications } from '../lib/notify';
import { colors } from '../lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Gate() {
  const { loaded, settings } = useStore();
  const segments = useSegments();
  const [intro, setIntro] = useState(true); // branded loading screen on every launch

  useEffect(() => {
    // swap the static native splash for the animated loading screen straight away
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const inWelcome = segments[0] === 'welcome';
    if (!settings.onboarded && !inWelcome) router.replace('/welcome');
  }, [loaded, settings.onboarded, segments]);

  useEffect(() => {
    if (loaded && settings.onboarded && settings.notifications) setupNotifications();
  }, [loaded, settings.onboarded, settings.notifications]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      {loaded ? <Screens /> : null}
      {intro ? <LoadingScreen ready={loaded} onDone={() => setIntro(false)} /> : null}
    </View>
  );
}

function Screens() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="report" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="track/[id]" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ArchivoBlack_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Gate />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
