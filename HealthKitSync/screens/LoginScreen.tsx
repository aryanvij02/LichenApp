import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
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
    <View className="flex-1 bg-gray-50">
      <View className="flex-1 justify-center items-center px-5">
        <Text className="text-4xl font-bold text-gray-800 mb-2">
          HealthKit Sync
        </Text>

        <Text className="text-base text-gray-600 text-center">
          Your Health Data, Synced Seamlessly
        </Text>
      </View>
      <View className="flex-1 justify-center px-8 pb-12">
        <Text className="text-3xl font-bold text-gray-800 mb-3 text-center">
          Welcome Back
        </Text>
        <Text className="text-base text-gray-600 mb-10 text-center leading-6">
          Sign in to sync your health data securely and track your wellness
          journey
        </Text>
        <TouchableOpacity
          className="bg-blue-600 px-8 py-4 rounded-xl flex-row items-center justify-center shadow-lg mb-5"
          style={isLoading ? { backgroundColor: "#BDC3C7" } : {}}
          onPress={handleGoogleSignIn}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Text className="bg-white text-blue-600 w-6 h-6 rounded-xl text-center text-base font-bold mr-3 leading-6">
                G
              </Text>
              <Text className="text-white text-base font-semibold">
                Continue with Google
              </Text>
            </>
          )}
        </TouchableOpacity>
        <Text className="text-xs text-gray-500 text-center leading-5 px-3">
          Your health data is encrypted and stored securely. We never share your
          personal information.
        </Text>
      </View>
    </View>
  );
};
