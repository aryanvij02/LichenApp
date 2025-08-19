import React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const CoachScreen: React.FC = () => {
  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-3xl font-semibold text-gray-900 mb-2">
          AI Coach
        </Text>
        <Text className="text-lg text-gray-500 text-center">
          AI health coaching coming soon...
        </Text>
      </View>
    </SafeAreaView>
  );
};
