import React from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RestingHeartRate } from "../../services/HealthAPIService";
import { useAuth } from "../../context/AuthContext";
import { useRestingHeartRate } from "../../hooks/useHealthData";

interface RestingHRWidgetProps {
  selectedDate: Date;
  onPress: () => void;
}

export const RestingHRWidget: React.FC<RestingHRWidgetProps> = ({
  selectedDate,
  onPress,
}) => {
  const { user } = useAuth();
  const dateStr = selectedDate.toISOString().split("T")[0];
  const userId = user ? `google_${user.id}` : "";

  // Use TanStack Query hook for data fetching
  const {
    data: rhrDataArray,
    isLoading,
    error,
    isFetching,
  } = useRestingHeartRate(dateStr, dateStr, userId, !!user);

  // Find data for the selected date
  const rhrData =
    rhrDataArray?.find((item) => item.local_date === dateStr) || null;

  // Debug logging
  React.useEffect(() => {
    if (user && rhrDataArray) {
      console.log(
        `💓 RestingHRWidget: Received ${rhrDataArray.length} RHR records for ${dateStr}`
      );
      console.log(`💓 RestingHRWidget: Found data for ${dateStr}:`, rhrData);
    }
    if (error) {
      console.error("❌ RestingHRWidget: Error fetching RHR data:", error);
    }
  }, [rhrDataArray, rhrData, error, user, dateStr]);

  const getStatusColor = (rhr: number) => {
    if (rhr < 50) return "#34C759"; // Green - excellent
    if (rhr < 60) return "#007AFF"; // Blue - good
    if (rhr < 70) return "#FF9500"; // Orange - fair
    return "#FF3B30"; // Red - needs attention
  };

  const getStatusText = (rhr: number) => {
    if (rhr < 50) return "Excellent";
    if (rhr < 60) return "Good";
    if (rhr < 70) return "Fair";
    return "High";
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View className="bg-white rounded-xl p-4 h-40 shadow-lg">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center space-x-2">
            <Ionicons
              name="pulse"
              size={20}
              color={
                rhrData ? getStatusColor(rhrData.resting_heart_rate) : "#8E8E93"
              }
            />
            <Text className="text-base font-semibold text-gray-900">RHR</Text>
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
                Error loading{"\n"}RHR data
              </Text>
            </View>
          ) : rhrData ? (
            <View className="items-center space-y-1">
              <Text
                className="text-4xl font-bold"
                style={{ color: getStatusColor(rhrData.resting_heart_rate) }}
              >
                {rhrData.resting_heart_rate}
              </Text>
              <Text className="text-sm text-gray-400">bpm</Text>
              <Text
                className="text-xs font-semibold"
                style={{ color: getStatusColor(rhrData.resting_heart_rate) }}
              >
                {getStatusText(rhrData.resting_heart_rate)}
              </Text>
            </View>
          ) : (
            <View className="items-center space-y-1">
              <Text className="text-4xl font-bold text-gray-400">--</Text>
              <Text className="text-xs text-gray-400 text-center">
                No RHR data{"\n"}for this date
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};
