import React, { useState } from "react";
import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DateSelector } from "../components/common/DateSelector";
import { UserAvatar } from "../components/common/UserAvatar";
import { LiveHeartRateWidget } from "../components/health-widgets/LiveHeartRateWidget";
import { RestingHRWidget } from "../components/health-widgets/RestingHRWidget";
import { StepsWidget } from "../components/health-widgets/StepsWidget";
import { SleepWidget } from "../components/health-widgets/SleepWidget";

export const HomeScreen: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());

  const handleHeartRatePress = () => {
    console.log("Navigate to Heart Rate detail");
  };

  const handleRHRPress = () => {
    console.log("Navigate to RHR detail");
  };

  const handleStepsPress = () => {
    console.log("Navigate to Steps detail");
  };

  const handleSleepPress = () => {
    console.log("Navigate to Sleep detail");
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={["top"]}>
      {/* Single container with consistent padding */}
      <View className="flex-1 px-4">
        {/* Header */}
        <View className="flex-row items-center justify-between py-4">
          <DateSelector
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
          <UserAvatar />
        </View>

        {/* Content */}
        <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
          {/* Main Health Widgets - 2x2 Grid */}
          <View className="gap-4 mb-6">
            <View className="flex-row gap-4">
              <View className="flex-1">
                <LiveHeartRateWidget onPress={handleHeartRatePress} />
              </View>
              <View className="flex-1">
                <RestingHRWidget
                  selectedDate={selectedDate}
                  onPress={handleRHRPress}
                />
              </View>
            </View>

            <View className="flex-row gap-4">
              <View className="flex-1">
                <StepsWidget
                  selectedDate={selectedDate}
                  onPress={handleStepsPress}
                />
              </View>
              <View className="flex-1">
                <SleepWidget
                  selectedDate={selectedDate}
                  onPress={handleSleepPress}
                />
              </View>
            </View>
          </View>

          {/* Additional Sections */}
          <View className="gap-4 pb-6">
            <Text className="text-xl font-semibold text-gray-900">
              Energy & Stress
            </Text>
            <View className="bg-white rounded-xl p-6 shadow-lg">
              <Text className="text-base text-gray-500 text-center">
                Body Battery and Stress widgets coming soon...
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};
