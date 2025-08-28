import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { enableScreens } from "react-native-screens";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginScreen } from "./screens/LoginScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { BiologyScreen } from "./screens/BiologyScreen";
import { CoachScreen } from "./screens/CoachScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { DeveloperScreen } from "./DeveloperScreen";
import { HealthKitService } from "./services/HealthKitService";

// Enable native screens for better performance
enableScreens();

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

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

  // Show loading screen
  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="auto" />
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // Show login screen if not signed in
  if (!isSignedIn || !user) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="TabNavigator" component={TabNavigator} />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={({ navigation }: { navigation: any }) => ({
            headerShown: true,
            title: "Settings",
            headerStyle: {
              backgroundColor: "#f5f5f5",
            },
            headerTitleStyle: {
              fontWeight: "bold",
            },
            headerLeft: () => (
              <TouchableOpacity
                style={{ marginLeft: 15 }}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="arrow-back" size={24} color="#007AFF" />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="Developer"
          component={DeveloperScreen}
          options={({ navigation }: { navigation: any }) => ({
            headerShown: true,
            title: "Developer Tools",
            headerStyle: {
              backgroundColor: "#f5f5f5",
            },
            headerTitleStyle: {
              fontWeight: "bold",
            },
            headerLeft: () => (
              <TouchableOpacity
                style={{ marginLeft: 15 }}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="arrow-back" size={24} color="#007AFF" />
              </TouchableOpacity>
            ),
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

// Tab Navigator Component
const TabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarActiveTintColor: "#007AFF",
        tabBarInactiveTintColor: "#8E8E93",
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ color }) => (
            <View style={[styles.tabIcon, { backgroundColor: color }]} />
          ),
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          tabBarLabel: "Calendar",
          tabBarIcon: ({ color }) => (
            <View style={[styles.tabIcon, { backgroundColor: color }]} />
          ),
        }}
      />
      <Tab.Screen
        name="Biology"
        component={BiologyScreen}
        options={{
          tabBarLabel: "Biology",
          tabBarIcon: ({ color }) => (
            <View style={[styles.tabIcon, { backgroundColor: color }]} />
          ),
        }}
      />
      <Tab.Screen
        name="Coach"
        component={CoachScreen}
        options={{
          tabBarLabel: "Coach",
          tabBarIcon: ({ color }) => (
            <View style={[styles.tabIcon, { backgroundColor: color }]} />
          ),
        }}
      />
    </Tab.Navigator>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
  },
  tabBar: {
    backgroundColor: "#F2F2F7",
    borderTopColor: "#C6C6C8",
    borderTopWidth: 0.5,
    paddingTop: 8,
    paddingBottom: 8,
    height: 88,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  tabIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
