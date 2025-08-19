import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { enableScreens } from "react-native-screens";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View, StyleSheet, Text } from "react-native";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginScreen } from "./screens/LoginScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { BiologyScreen } from "./screens/BiologyScreen";
import { CoachScreen } from "./screens/CoachScreen";
import { HealthKitService } from "./services/HealthKitService";

// Enable native screens for better performance
enableScreens();

const Tab = createBottomTabNavigator();

// Initialize HealthKit service
HealthKitService.initialize();

// Main content component that uses auth
const AppContent: React.FC = () => {
  console.log("🚀 AppContent component starting...");
  const { user, isSignedIn, isLoading: authLoading } = useAuth();

  console.log("🔍 AppContent render state:", {
    user: user ? `${user.name} (${user.email})` : null,
    isSignedIn,
    authLoading,
  });

  //   Show loading screen
  if (authLoading) {
    return (
      <View style={styles.centerContent}>
        <StatusBar style="auto" />
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  //   Show login screen if not signed in
  if (!isSignedIn || !user) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: "#F2F2F7",
            borderTopColor: "#C6C6C8",
            borderTopWidth: 0.5,
            paddingTop: 8,
            paddingBottom: 8,
            height: 88,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "600",
            marginTop: 4,
          },
          tabBarActiveTintColor: "#007AFF",
          tabBarInactiveTintColor: "#8E8E93",
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarLabel: "Home",
            tabBarIcon: ({ color, size }) => (
              <View style={[styles.tabIcon, { backgroundColor: color }]} />
            ),
          }}
        />
        <Tab.Screen
          name="Calendar"
          component={CalendarScreen}
          options={{
            tabBarLabel: "Calendar",
            tabBarIcon: ({ color, size }) => (
              <View style={[styles.tabIcon, { backgroundColor: color }]} />
            ),
          }}
        />
        <Tab.Screen
          name="Biology"
          component={BiologyScreen}
          options={{
            tabBarLabel: "Biology",
            tabBarIcon: ({ color, size }) => (
              <View style={[styles.tabIcon, { backgroundColor: color }]} />
            ),
          }}
        />
        <Tab.Screen
          name="Coach"
          component={CoachScreen}
          options={{
            tabBarLabel: "Coach",
            tabBarIcon: ({ color, size }) => (
              <View style={[styles.tabIcon, { backgroundColor: color }]} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

// Main App component that provides auth context
export default function App() {
  console.log("🚀 RELEASE BUILD - NEW VERSION - " + new Date().toISOString());

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
  },
  tabIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
