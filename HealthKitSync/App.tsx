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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginScreen } from "./screens/LoginScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { BiologyScreen } from "./screens/BiologyScreen";
import { CoachScreen } from "./screens/CoachScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { HealthKitService } from "./services/HealthKitService";

import * as Localization from 'expo-localization';
console.log('ExpoLocalization test:', Localization.getLocales());

//This allows us to use native screen components (ios / android) instead or RN Views which improves performance
enableScreens();

//Packages supplied by RN to create the navigation stack and bottom tabs
const Tab = createBottomTabNavigator();

// Create a client for TanStack Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
      gcTime: 30 * 60 * 1000, // 30 minutes - garbage collection time
      retry: 3, // Retry failed requests 3 times
      refetchOnWindowFocus: false, // Don't refetch on app focus
      refetchOnReconnect: true, // Refetch when network reconnects
    },
  },
});
const Stack = createStackNavigator();

// Initialize HealthKit service
HealthKitService.initialize();

// Main content component that uses auth
const AppContent: React.FC = () => {
  console.log("Application starting");

  //useAuth is a React Context Hook
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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
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
