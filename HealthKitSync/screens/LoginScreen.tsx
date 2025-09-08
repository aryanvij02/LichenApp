import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useAuth } from "../context/AuthContext";
export const LoginScreen: React.FC = () => {
  const { signIn, isLoading, isSignedIn, user } = useAuth();

  const handleGoogleSignIn = async () => {
    const success = await signIn();
    if (!success) {
      Alert.alert("Sign In Failed", "Please try again");
    }
  };
  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>HealthKit Sync</Text>

        <Text style={styles.headerSubtitle}>
          Your Health Data, Synced Seamlessly
        </Text>
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.welcomeTitle}>Welcome Back</Text>
        <Text style={styles.welcomeSubtitle}>
          Sign in to sync your health data securely and track your wellness
          journey
        </Text>
        <TouchableOpacity
          style={[
            styles.signInButton,
            isLoading && styles.signInButtonDisabled,
          ]}
          onPress={handleGoogleSignIn}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.signInButtonText}>Continue with Google</Text>
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
    backgroundColor: "#f9fafb", // bg-gray-50
  },
  headerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20, // px-5
  },
  headerTitle: {
    fontSize: 36, // text-4xl
    fontWeight: "bold",
    color: "#1f2937", // text-gray-800
    marginBottom: 8, // mb-2
  },
  headerSubtitle: {
    fontSize: 16, // text-base
    color: "#4b5563", // text-gray-600
    textAlign: "center",
  },
  contentContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32, // px-8
    paddingBottom: 48, // pb-12
  },
  welcomeTitle: {
    fontSize: 30, // text-3xl
    fontWeight: "bold",
    color: "#1f2937", // text-gray-800
    marginBottom: 12, // mb-3
    textAlign: "center",
  },
  welcomeSubtitle: {
    fontSize: 16, // text-base
    color: "#4b5563", // text-gray-600
    marginBottom: 40, // mb-10
    textAlign: "center",
    lineHeight: 24, // leading-6
  },
  signInButton: {
    backgroundColor: "#2563eb", // bg-blue-600
    paddingHorizontal: 32, // px-8
    paddingVertical: 16, // py-4
    borderRadius: 12, // rounded-xl
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20, // mb-5
    // Shadow styles for shadow-lg
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.15,
    shadowRadius: 25,
    elevation: 10,
  },
  signInButtonDisabled: {
    backgroundColor: "#BDC3C7",
  },
  googleIcon: {
    backgroundColor: "white",
    color: "#2563eb", // text-blue-600
    width: 24, // w-6
    height: 24, // h-6
    borderRadius: 12, // rounded-xl
    textAlign: "center",
    fontSize: 16, // text-base
    fontWeight: "bold",
    marginRight: 12, // mr-3
    lineHeight: 24, // leading-6 (to center the text vertically)
  },
  signInButtonText: {
    color: "white",
    fontSize: 16, // text-base
    fontWeight: "600", // font-semibold
  },
  privacyText: {
    fontSize: 12, // text-xs
    color: "#6b7280", // text-gray-500
    textAlign: "center",
    lineHeight: 20, // leading-5
    paddingHorizontal: 12, // px-3
  },
});
