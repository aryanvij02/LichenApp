import React, { useState, useEffect } from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CircularProgress } from "../common/CircularProgress";
import {
  HealthAPIService,
  SleepSummary,
} from "../../services/HealthAPIService";
import { useAuth } from "../../context/AuthContext";

interface SleepWidgetProps {
  selectedDate: Date;
  onPress: () => void;
}

export const SleepWidget: React.FC<SleepWidgetProps> = ({
  selectedDate,
  onPress,
}) => {
  const { user } = useAuth();
  const [sleepData, setSleepData] = useState<SleepSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const SLEEP_GOAL = 480; // 8 hours in minutes

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const dateStr = selectedDate.toISOString().split("T")[0];
        const data = await HealthAPIService.getSleepSummary(
          dateStr,
          `google_${user.id}`
        );

        setSleepData(data);
      } catch (error) {
        console.error("Error fetching sleep data:", error);
        setSleepData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedDate, user]);

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
        </View>

        <View className="flex-1 justify-center items-center">
          {isLoading ? (
            <View className="items-center space-y-1">
              <Text className="text-4xl font-bold text-gray-400">--</Text>
              <Text className="text-sm text-gray-400">Loading...</Text>
            </View>
          ) : sleepData ? (
            <CircularProgress
              progress={sleepData.sleep_efficiency}
              size={100}
              strokeWidth={8}
              color={getSleepColor()}
              backgroundColor="#E5E5EA"
            >
              <View className="items-center">
                <Text
                  className="text-lg font-bold"
                  style={{ color: getSleepColor() }}
                >
                  {formatSleepDuration(sleepData.total_sleep_duration)}
                </Text>
                <Text className="text-xs text-gray-400">
                  {Math.round(sleepData.sleep_efficiency)}% efficiency
                </Text>
                <Text
                  className="text-xs font-semibold"
                  style={{ color: getSleepColor() }}
                >
                  {getSleepQuality()}
                </Text>
              </View>
            </CircularProgress>
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
