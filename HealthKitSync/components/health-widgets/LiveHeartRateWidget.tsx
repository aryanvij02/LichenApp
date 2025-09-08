import React, { useState, useEffect } from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
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
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
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
            <Text style={styles.title}>Live HR</Text>
          </View>
        </View>

        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.centered}>
              <Text style={styles.largeValue}>--</Text>
              <Text style={styles.label}>Loading...</Text>
            </View>
          ) : heartRateData ? (
            <View style={styles.centered}>
              <Text
                style={[
                  styles.largeValue,
                  { color: getStatusColor(heartRateData.heartRate) },
                ]}
              >
                {heartRateData.heartRate}
              </Text>
              <Text style={styles.label}>bpm</Text>
              <Text
                style={[
                  styles.status,
                  { color: getStatusColor(heartRateData.heartRate) },
                ]}
              >
                {getStatusText(heartRateData.heartRate)}
              </Text>
              <Text style={styles.timestamp}>
                {formatTimeAgo(heartRateData.timestamp)}
              </Text>
            </View>
          ) : (
            <View style={styles.centered}>
              <Text style={styles.largeValue}>--</Text>
              <Text style={styles.label}>No recent data</Text>
              <Text style={styles.hint}>Check permissions in Settings</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "white",
    borderRadius: 12, // rounded-xl
    padding: 16, // p-4
    height: 160, // h-40
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8, // mb-2
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8, // space-x-2
  },
  title: {
    fontSize: 16, // text-base
    fontWeight: "600", // font-semibold
    color: "#111827", // text-gray-900
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centered: {
    alignItems: "center",
    gap: 4, // space-y-1
  },
  largeValue: {
    fontSize: 36, // text-4xl
    fontWeight: "bold",
    color: "#9ca3af", // text-gray-400
  },
  label: {
    fontSize: 14, // text-sm
    color: "#9ca3af", // text-gray-400
  },
  status: {
    fontSize: 12, // text-xs
    fontWeight: "600", // font-semibold
  },
  timestamp: {
    fontSize: 12, // text-xs
    color: "#9ca3af", // text-gray-400
  },
  hint: {
    fontSize: 12, // text-xs
    color: "#9ca3af", // text-gray-400
    textAlign: "center",
    paddingHorizontal: 8, // px-2
  },
});
