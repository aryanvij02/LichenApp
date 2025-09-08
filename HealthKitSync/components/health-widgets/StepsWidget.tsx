import React, { useState, useEffect } from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import {
  HealthKitService,
  LiveStepsData,
} from "../../services/HealthKitService";
import { SettingsService } from "../../services/SettingsService";

interface StepsWidgetProps {
  selectedDate: Date;
  onPress: () => void;
}

export const StepsWidget: React.FC<StepsWidgetProps> = ({
  selectedDate,
  onPress,
}) => {
  const [stepsData, setStepsData] = useState<LiveStepsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userPreferences, setUserPreferences] = useState<string[]>([]);

  //TODO: User should be able to set this
  const DAILY_GOAL = 10000; // Default step goal
  const stepAnimation = useSharedValue(1);

  // Load user preference for steps data source
  const loadUserPreferences = async () => {
    try {
      const preference = await SettingsService.getDataSourcePreference("steps");
      console.log("User preference from SettingsService", preference);
      setUserPreferences(preference ? [preference] : []);
      console.log("👟 StepsWidget: Loaded user preference:", userPreferences);
    } catch (error) {
      console.error("❌ StepsWidget: Error loading preferences:", error);
    }
  };

  // Refresh steps data (useful when preferences change)
  const refreshStepsData = async (dateStr: string) => {
    try {
      console.log(`🔄 StepsWidget: Refreshing steps data for ${dateStr}`);
      setIsLoading(true);

      // Force refresh by getting data again
      const refreshedData = await HealthKitService.getStepsForDate(dateStr);
      if (refreshedData) {
        setStepsData(refreshedData);
        console.log(`✅ StepsWidget: Refreshed steps data:`, refreshedData);
      }
    } catch (error) {
      console.error("❌ StepsWidget: Error refreshing data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Store the unsubscribe function in a ref so it persists across focus changes
  const unsubscribeRef = React.useRef<(() => void) | undefined>(undefined);

  const initializeWidget = React.useCallback(async () => {
    try {
      const dateStr = selectedDate.toLocaleDateString("en-CA"); // YYYY-MM-DD format

      console.log(`👟 StepsWidget: Initializing for date ${dateStr}`);

      // Load user preferences first (always get fresh preferences)
      await loadUserPreferences();

      // First, try to get steps data for the selected date
      const existingData = await HealthKitService.getStepsForDate(dateStr);
      if (existingData) {
        setStepsData(existingData);
        setIsLoading(false);
        console.log(
          `✅ StepsWidget: Found steps data for ${dateStr}:`,
          existingData
        );
      } else {
        console.log(`⚠️ StepsWidget: No steps data found for ${dateStr}`);
        setIsLoading(false);
      }

      // Clean up previous subscription if it exists
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }

      // Subscribe to live steps updates for this date
      unsubscribeRef.current = HealthKitService.subscribeToLiveSteps(
        dateStr,
        (data, date) => {
          if (date === dateStr) {
            console.log(
              `📱 StepsWidget: Received live steps update for ${date}:`,
              data
            );
            setStepsData(data);
            setIsLoading(false);

            // Trigger step animation when new data arrives
            if (data) {
              stepAnimation.value = withSequence(
                withTiming(1.1, { duration: 150 }),
                withTiming(1, { duration: 150 }),
                withTiming(1.05, { duration: 100 }),
                withTiming(1, { duration: 100 })
              );
            }
          }
        }
      );
    } catch (error) {
      console.error("❌ StepsWidget: Error initializing widget:", error);
      setIsLoading(false);
    }
  }, [selectedDate]);

  // Run initialization every time the screen comes into focus OR when date changes
  useFocusEffect(
    React.useCallback(() => {
      console.log("👟 StepsWidget: Screen focused, initializing widget");
      initializeWidget();

      // Cleanup function
      return () => {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = undefined;
        }
      };
    }, [initializeWidget])
  );

  // Effect to refresh data when user preferences change
  useEffect(() => {
    const dateStr = selectedDate.toLocaleDateString("en-CA");
    if (userPreferences.length > 0) {
      console.log(
        `🎯 StepsWidget: User preferences changed, refreshing data for ${dateStr}`
      );
      refreshStepsData(dateStr);
    }
  }, [userPreferences, selectedDate]);

  const animatedStepStyle = useAnimatedStyle(() => ({
    transform: [{ scale: stepAnimation.value }],
  }));

  const getProgress = () => {
    if (!stepsData) return 0;
    return Math.min((stepsData.stepCount / DAILY_GOAL) * 100, 100);
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

  const getStatusText = (steps: number) => {
    const progress = (steps / DAILY_GOAL) * 100;
    if (progress >= 100) return "Goal reached!";
    if (progress >= 70) return "Almost there";
    if (progress >= 40) return "Good progress";
    return "Keep going";
  };

  const getSourceDisplayText = (data: LiveStepsData) => {
    if (data.filteredSources.length === 0) return "No source";
    if (data.filteredSources.length === 1) {
      const source = data.filteredSources[0];
      // Check if this matches user's preferred source
      const isPreferred =
        userPreferences.length > 0 && userPreferences[0] === source;
      return isPreferred ? `${source} ⭐` : source;
    }
    return `${data.filteredSources.length} sources`;
  };

  const getSourceSubtext = (data: LiveStepsData) => {
    if (data.availableSources.length > 1 && data.filteredSources.length === 1) {
      const isUsingPreferred =
        userPreferences.length > 0 &&
        userPreferences[0] === data.filteredSources[0];
      if (isUsingPreferred) {
        return "Using preferred source";
      } else {
        return `${data.availableSources.length} sources available`;
      }
    }
    if (data.availableSources.length > 1) {
      return `${data.availableSources.length} sources available`;
    }
    return null;
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Animated.View style={animatedStepStyle}>
              <Ionicons
                name="footsteps"
                size={20}
                color={stepsData ? getProgressColor() : "#8E8E93"}
              />
            </Animated.View>
            <Text style={styles.title}>Steps</Text>
          </View>
        </View>

        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.centered}>
              <Text style={styles.largeValue}>--</Text>
              <Text style={styles.label}>Loading...</Text>
            </View>
          ) : stepsData ? (
            <View style={styles.centered}>
              <Text style={[styles.mediumValue, { color: getProgressColor() }]}>
                {formatSteps(stepsData.stepCount)}
              </Text>
              <Text style={styles.timestamp}>
                {formatTimeAgo(stepsData.timestamp)}
              </Text>
              <Text style={styles.sourceText}>
                {getSourceDisplayText(stepsData)}
              </Text>
              {getSourceSubtext(stepsData) && (
                <Text style={styles.subtextLabel}>
                  {getSourceSubtext(stepsData)}
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.centered}>
              <Text style={styles.largeValue}>--</Text>
              <Text style={styles.label}>No data available</Text>
              <Text style={styles.hint}>
                Check HealthKit permissions in Settings
              </Text>
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
  mediumValue: {
    fontSize: 18, // text-lg
    fontWeight: "bold",
  },
  label: {
    fontSize: 14, // text-sm
    color: "#9ca3af", // text-gray-400
  },
  timestamp: {
    fontSize: 12, // text-xs
    color: "#9ca3af", // text-gray-400
  },
  sourceText: {
    fontSize: 12, // text-xs
    color: "#2563eb", // text-blue-600
    fontWeight: "500", // font-medium
  },
  subtextLabel: {
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
