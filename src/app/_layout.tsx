import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

const TAB_ICON_SIZE = 22;

function TabIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: TAB_ICON_SIZE, lineHeight: TAB_ICON_SIZE + 4 }}>{emoji}</Text>;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark      = colorScheme === 'dark';

  const tabBarBg     = isDark ? '#1f2937' : '#ffffff';
  const tabBarBorder = isDark ? '#374151' : '#e5e7eb';
  const activeColor  = isDark ? '#38bdf8' : '#0ea5e9';
  const inactiveColor= isDark ? '#6b7280' : '#9b9a97';

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: tabBarBg,
            borderTopWidth:  1,
            borderTopColor:  tabBarBorder,
            paddingBottom:   16,
            paddingTop:      8,
            height:          70,
            position:        'relative',
            // shadow (iOS)
            shadowColor:     '#000',
            shadowOffset:    { width: 0, height: -2 },
            shadowOpacity:   isDark ? 0.3 : 0.06,
            shadowRadius:    8,
            // elevation (Android)
            elevation:       8,
          },
          tabBarLabelStyle: {
            fontSize:   11,
            fontWeight: '700',
            marginTop:  2,
            letterSpacing: 0.2,
          },
          tabBarActiveTintColor:   activeColor,
          tabBarInactiveTintColor: inactiveColor,
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title:        '홈',
            tabBarLabel:  '홈',
            tabBarIcon:   ({ color }) => <TabIcon emoji="🏠" />,
          }}
        />
        <Tabs.Screen
          name="english"
          options={{
            title:        '영어',
            tabBarLabel:  '영어',
            tabBarIcon:   ({ color }) => <TabIcon emoji="📚" />,
          }}
        />
        <Tabs.Screen
          name="toefl"
          options={{
            title:        'TOEFL',
            tabBarLabel:  'TOEFL',
            tabBarIcon:   ({ color }) => <TabIcon emoji="🎓" />,
          }}
        />
        <Tabs.Screen
          name="papers"
          options={{
            title:        '논문',
            tabBarLabel:  '논문',
            tabBarIcon:   ({ color }) => <TabIcon emoji="📄" />,
          }}
        />
      </Tabs>
    </ThemeProvider>
  );
}
