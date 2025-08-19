import React, { useState, useEffect } from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CircularProgress } from "../common/CircularProgress";
import { HealthAPIService, StepsData } from "../../services/HealthAPIService";
import { useAuth } from "../../context/AuthContext";

interface StepsWidgetProps {
  selectedDate: Date;
  onPress: () => void;
}

export const StepsWidget: React.FC<StepsWidgetProps> = ({
  selectedDate,
  onPress,
}) => {
  const { user } = useAuth();
  const [stepsData, setStepsData] = useState<StepsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const DAILY_GOAL = 10000; // Default step goal

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const dateStr = selectedDate.toISOString().split("T")[0];
        const data = await HealthAPIService.getStepsData(
          dateStr,
          `google_${user.id}`
        );

        setStepsData(data.length > 0 ? data[0] : null);
      } catch (error) {
        console.error("Error fetching steps data:", error);
        setStepsData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedDate, user]);

  const getProgress = () => {
    if (!stepsData) return 0;
    return Math.min((stepsData.total_steps / DAILY_GOAL) * 100, 100);
  };

  const getProgressColor = () => {
    const progress = getProgress();
    if (progress >= 100) return "#10B981"; // Green - goal reached
    if (progress >= 70) return "#3B82F6"; // Blue - close to goal
    if (progress >= 40) return "#F59E0B"; // Orange - making progress
    return "#8E8E93"; // Gray - needs work
  };

  const formatSteps = (steps: number) => {
    if (steps >= 1000) {
      return `${(steps / 1000).toFixed(1)}K`;
    }
    return steps.toString();
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View className="bg-white rounded-xl p-4 h-40 shadow-lg">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center space-x-2">
            <Ionicons
              name="footsteps"
              size={20}
              color={stepsData ? getProgressColor() : "#8E8E93"}
            />
            <Text className="text-base font-semibold text-gray-900">Steps</Text>
          </View>
        </View>

        <View className="flex-1 justify-center items-center">
          {isLoading ? (
            <View className="items-center space-y-1">
              <Text className="text-4xl font-bold text-gray-400">--</Text>
              <Text className="text-sm text-gray-400">Loading...</Text>
            </View>
          ) : stepsData ? (
            <CircularProgress
              progress={getProgress()}
              size={100}
              strokeWidth={8}
              color={getProgressColor()}
              backgroundColor="#E5E5EA"
            >
              <View className="items-center">
                <Text
                  className="text-xl font-bold"
                  style={{ color: getProgressColor() }}
                >
                  {formatSteps(stepsData.total_steps)}
                </Text>
                <Text className="text-xs text-gray-400">
                  of {formatSteps(DAILY_GOAL)}
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
