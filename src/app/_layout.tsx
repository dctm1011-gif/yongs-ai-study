import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#e9e9e7',
            paddingBottom: 16,
            paddingTop: 12,
            height: 140,
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
            marginTop: 4,
          },
          tabBarActiveTintColor: '#0ea5e9',
          tabBarInactiveTintColor: '#9b9a97',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: '🏠 홈',
          }}
        />
        <Tabs.Screen
          name="english"
          options={{
            title: '📚 영어',
          }}
        />
        <Tabs.Screen
          name="toefl"
          options={{
            title: '🎓 TOEFL',
          }}
        />
        <Tabs.Screen
          name="papers"
          options={{
            title: '📄 논문',
          }}
        />
      </Tabs>
    </ThemeProvider>
  );
}
