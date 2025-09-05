import React from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CircularProgress } from "../common/CircularProgress";
import { SleepSummary } from "../../services/HealthAPIService";
import { useAuth } from "../../context/AuthContext";
import { useSleepSummary } from "../../hooks/useHealthData";

interface SleepWidgetProps {
  selectedDate: Date;
  onPress: () => void;
}

export const SleepWidget: React.FC<SleepWidgetProps> = ({
  selectedDate,
  onPress,
}) => {
  const { user } = useAuth();
  const dateStr = selectedDate.toISOString().split("T")[0];
  const userId = user ? `google_${user.id}` : "";

  const SLEEP_GOAL = 480; // 8 hours in minutes

  // Use TanStack Query hook for data fetching
  const {
    data: sleepData,
    isLoading,
    error,
    isFetching,
  } = useSleepSummary(dateStr, userId, !!user);

  // Debug logging
  React.useEffect(() => {
    if (user && sleepData) {
      console.log(
        `😴 SleepWidget: Received sleep summary for ${dateStr}:`,
        sleepData
      );
    }
    if (error) {
      console.error("❌ SleepWidget: Error fetching sleep data:", error);
    }
  }, [sleepData, error, user, dateStr]);

  const getSleepProgress = () => {
    if (!sleepData) return 0;
    return Math.min((sleepData.total_sleep_duration / SLEEP_GOAL) * 100, 100);
  };

  const getSleepColor = () => {
    if (!sleepData) return "#8E8E93";

    const efficiency = sleepData.sleep_efficiency;
    if (efficiency >= 85) return "#10B981"; // Green - excellent
    if (efficiency >= 75) return "#3B82F6"; // Blue - good
    if (efficiency >= 65) return "#F59E0B"; // Orange - fair
    return "#FF3B30"; // Red - poor
  };

  const formatSleepDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getSleepQuality = () => {
    if (!sleepData) return "No data";

    const efficiency = sleepData.sleep_efficiency;
    if (efficiency >= 85) return "Excellent";
    if (efficiency >= 75) return "Good";
    if (efficiency >= 65) return "Fair";
    return "Poor";
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View className="bg-white rounded-xl p-4 h-40 shadow-lg">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center space-x-2">
            <Ionicons
              name="moon"
              size={20}
              color={sleepData ? getSleepColor() : "#8E8E93"}
            />
            <Text className="text-base font-semibold text-gray-900">Sleep</Text>
          </View>
          {isFetching && !isLoading && (
            <Ionicons
              name="refresh"
              size={16}
              color="#8E8E93"
              style={{ opacity: 0.6 }}
            />
          )}
        </View>

        <View className="flex-1 justify-center items-center">
          {isLoading ? (
            <View className="items-center space-y-1">
              <Text className="text-4xl font-bold text-gray-400">--</Text>
              <Text className="text-sm text-gray-400">Loading...</Text>
            </View>
          ) : error ? (
            <View className="items-center space-y-1">
              <Text className="text-4xl font-bold text-red-400">!</Text>
              <Text className="text-xs text-red-400 text-center">
                Error loading{"\n"}sleep data
              </Text>
            </View>
          ) : sleepData ? (
            <View className="items-center">
              <View className="items-center">
                <Text
                  className="text-xl font-bold"
                  style={{ color: getSleepColor() }}
                >
                  {formatSleepDuration(sleepData.total_sleep_duration)}
                </Text>
                <Text className="text-xs text-gray-400">
                  {Math.round(sleepData.sleep_efficiency)}% efficiency
                </Text>
              </View>
              <Text
                className="text-xs font-semibold mt-2"
                style={{ color: getSleepColor() }}
              >
                {getSleepQuality()}
              </Text>
            </View>
          ) : (
            <View className="items-center space-y-1">
              <Text className="text-4xl font-bold text-gray-400">--</Text>
              <Text className="text-sm text-gray-400">No data</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};
