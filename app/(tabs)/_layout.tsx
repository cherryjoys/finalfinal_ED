import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { RADIUS, TEXT } from '@/constants/theme';
import { useRole } from '@/lib/useRole';

function TabIcon({
  focused,
  icon,
  activeIcon,
  color,
}: {
  focused: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={focused ? activeIcon : icon} color={focused ? '#FFFFFF' : color} size={22} />
    </View>
  );
}

export default function TabLayout() {
  const { role } = useRole();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primaryInk,
        tabBarInactiveTintColor: COLORS.textSecondary,
        headerShown: false,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              icon="home-outline"
              activeIcon="home-sharp"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          href: role === 'admin' ? null : undefined,
          title: 'Scan',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              icon="qr-code-outline"
              activeIcon="qr-code"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          href: role === 'admin' ? null : undefined,
          title: 'History',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              icon="time-outline"
              activeIcon="time"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              icon="person-outline"
              activeIcon="person"
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="teacher"
        options={{
          href: role === 'admin' ? null : undefined,
          title: 'Teacher',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              icon="school-outline"
              activeIcon="school"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          href: role === 'admin' ? undefined : null,
          title: 'Admin',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              icon="shield-outline"
              activeIcon="shield"
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderTopWidth: 0,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    paddingTop: 6,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
  },
  tabLabel: {
    ...TEXT.chip,
    fontSize: 11,
    lineHeight: 13,
    marginTop: 1,
  },
  iconWrap: {
    width: 44,
    height: 26,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: '#050505',
  },
});