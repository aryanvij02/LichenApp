import React, { useState, useEffect } from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  HealthAPIService,
  RestingHeartRate,
} from "../../services/HealthAPIService";
import { useAuth } from "../../context/AuthContext";

interface RestingHRWidgetProps {
  selectedDate: Date;
  onPress: () => void;
}

export const RestingHRWidget: React.FC<RestingHRWidgetProps> = ({
  selectedDate,
  onPress,
}) => {
  const { user } = useAuth();
  const [rhrData, setRhrData] = useState<RestingHeartRate | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const dateStr = selectedDate.toISOString().split("T")[0];
        const data = await HealthAPIService.getRestingHeartRate(
          dateStr,
          dateStr,
          `google_${user.id}`
        );

        // Find data for the selected date
        const dayData = data.find((item) => item.local_date === dateStr);
        setRhrData(dayData || null);
      } catch (error) {
        console.error("Error fetching RHR data:", error);
        setRhrData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedDate, user]);

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
        </View>

        <View className="flex-1 justify-center items-center">
          {isLoading ? (
            <View className="items-center space-y-1">
              <Text className="text-4xl font-bold text-gray-400">--</Text>
              <Text className="text-sm text-gray-400">Loading...</Text>
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
              <Text className="text-sm text-gray-400">No data</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};
