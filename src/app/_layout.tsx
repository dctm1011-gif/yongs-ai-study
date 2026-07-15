import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import EnglishScreen from './english';
import TOEFLScreen from './toefl';
import PapersScreen from './papers';
import PlayScreen from './play';
import SettingsScreen from './settings';

const Tab = createBottomTabNavigator();

export default function RootLayout() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: '#ccc',
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginTop: 2,
            marginBottom: 4,
          },
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#e5e7eb',
            height: 56,
            paddingTop: 4,
            paddingBottom: 4,
            elevation: 2,
          },
          tabBarIconStyle: {
            marginTop: 2,
          },
        }}
      >
        <Tab.Screen
          name="English"
          component={EnglishScreen}
          options={{
            title: 'English',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="language" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="TOEFL"
          component={TOEFLScreen}
          options={{
            title: 'TOEFL',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="school" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Papers"
          component={PapersScreen}
          options={{
            title: 'Papers',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="description" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Play"
          component={PlayScreen}
          options={{
            title: 'Play',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="sports-esports" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="settings" size={24} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
