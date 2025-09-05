import React, { useState, useEffect } from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import {
  HealthKitService,
  LiveHeartRateData,
} from "../../services/HealthKitService";

interface LiveHeartRateWidgetProps {
  onPress: () => void;
}

export const LiveHeartRateWidget: React.FC<LiveHeartRateWidgetProps> = ({
  onPress,
}) => {
  const [heartRateData, setHeartRateData] = useState<LiveHeartRateData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  const heartBeat = useSharedValue(1);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initializeWidget = async () => {
      try {
        // First, try to get recent heart rate data
        const recentData = await HealthKitService.getRecentHeartRate();
        if (recentData) {
          setHeartRateData(recentData);
          setIsLoading(false);
          console.log(
            "✅ LiveHeartRateWidget: Found recent heart rate data:",
            recentData
          );
        } else {
          console.log(
            "⚠️ LiveHeartRateWidget: No recent heart rate data found"
          );
          setIsLoading(false);
        }

        // Subscribe to live heart rate updates
        unsubscribe = HealthKitService.subscribeToLiveHeartRate((data) => {
          console.log(
            "📱 LiveHeartRateWidget: Received live heart rate update:",
            data
          );
          setHeartRateData(data);
          setIsLoading(false);

          // Trigger heart beat animation when new data arrives
          if (data) {
            heartBeat.value = withSequence(
              withTiming(1.2, { duration: 100 }),
              withTiming(1, { duration: 100 }),
              withTiming(1.1, { duration: 80 }),
              withTiming(1, { duration: 80 })
            );
          }
        });
      } catch (error) {
        console.error(
          "❌ LiveHeartRateWidget: Error initializing widget:",
          error
        );
        setIsLoading(false);
      }
    };

    initializeWidget();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const animatedHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartBeat.value }],
  }));

  const getStatusColor = (hr: number) => {
    if (hr < 60) return "#34C759"; // Green - resting
    if (hr < 100) return "#007AFF"; // Blue - normal
    if (hr < 150) return "#FF9500"; // Orange - elevated
    return "#FF3B30"; // Red - high
  };

  const getStatusText = (hr: number) => {
    if (hr < 60) return "Resting";
    if (hr < 100) return "Normal";
    if (hr < 150) return "Elevated";
    return "High";
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return time.toLocaleDateString();
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View className="bg-white rounded-xl p-4 h-40 shadow-lg">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center space-x-2">
            <Animated.View style={animatedHeartStyle}>
              <Ionicons
                name="heart"
                size={20}
                color={
                  heartRateData
                    ? getStatusColor(heartRateData.heartRate)
                    : "#8E8E93"
                }
              />
            </Animated.View>
            <Text className="text-base font-semibold text-gray-900">
              Live HR
            </Text>
          </View>
        </View>

        <View className="flex-1 justify-center items-center">
          {isLoading ? (
            <View className="items-center space-y-1">
              <Text className="text-4xl font-bold text-gray-400">--</Text>
              <Text className="text-sm text-gray-400">Loading...</Text>
            </View>
          ) : heartRateData ? (
            <View className="items-center space-y-1">
              <Text
                className="text-4xl font-bold"
                style={{ color: getStatusColor(heartRateData.heartRate) }}
              >
                {heartRateData.heartRate}
              </Text>
              <Text className="text-sm text-gray-400">bpm</Text>
              <Text
                className="text-xs font-semibold"
                style={{ color: getStatusColor(heartRateData.heartRate) }}
              >
                {getStatusText(heartRateData.heartRate)}
              </Text>
              <Text className="text-xs text-gray-400">
                {formatTimeAgo(heartRateData.timestamp)}
              </Text>
            </View>
          ) : (
            <View className="items-center space-y-1">
              <Text className="text-4xl font-bold text-gray-400">--</Text>
              <Text className="text-sm text-gray-400">No recent data</Text>
              <Text className="text-xs text-gray-400 text-center px-2">
                Check permissions in Settings
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};
