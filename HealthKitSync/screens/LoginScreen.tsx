import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../hooks/useAuth";

export const LoginScreen: React.FC = () => {
  const { signIn, isLoading } = useAuth();

  const handleGoogleSignIn = async () => {
    const success = await signIn();
    if (!success) {
      Alert.alert("Sign In Failed", "Please try again");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.appTitle}>HealthKit Sync</Text>
        <Text style={styles.tagline}>Your Health Data, Synced Seamlessly</Text>
      </View>

      <View style={styles.contentContainer}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>
          Sign in to sync your health data securely and track your wellness
          journey
        </Text>

        <TouchableOpacity
          style={[styles.googleButton, isLoading && styles.disabledButton]}
          onPress={handleGoogleSignIn}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.buttonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.privacyText}>
          Your health data is encrypted and stored securely. We never share your
          personal information.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  logoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  appTitle: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: "#7f8c8d",
    textAlign: "center",
  },
  contentContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingBottom: 50,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#7f8c8d",
    marginBottom: 40,
    textAlign: "center",
    lineHeight: 24,
  },
  googleButton: {
    backgroundColor: "#4285f4",
    paddingHorizontal: 30,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 20,
  },
  disabledButton: {
    backgroundColor: "#bdc3c7",
  },
  googleIcon: {
    backgroundColor: "white",
    color: "#4285f4",
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "bold",
    marginRight: 12,
    lineHeight: 24,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  privacyText: {
    fontSize: 12,
    color: "#95a5a6",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 10,
  },
});
