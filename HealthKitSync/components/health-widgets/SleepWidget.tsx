import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
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
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons
              name="moon"
              size={20}
              color={sleepData ? getSleepColor() : "#8E8E93"}
            />
            <Text style={styles.title}>Sleep</Text>
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

        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.centered}>
              <Text style={styles.largeValue}>--</Text>
              <Text style={styles.label}>Loading...</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={[styles.largeValue, styles.errorText]}>!</Text>
              <Text style={[styles.hint, styles.errorText]}>
                Error loading{"\n"}sleep data
              </Text>
            </View>
          ) : sleepData ? (
            <View style={styles.centered}>
              <View style={styles.centered}>
                <Text style={[styles.mediumValue, { color: getSleepColor() }]}>
                  {formatSleepDuration(sleepData.total_sleep_duration)}
                </Text>
                <Text style={styles.hint}>
                  {Math.round(sleepData.sleep_efficiency)}% efficiency
                </Text>
              </View>
              <Text
                style={[
                  styles.status,
                  styles.statusMargin,
                  { color: getSleepColor() },
                ]}
              >
                {getSleepQuality()}
              </Text>
            </View>
          ) : (
            <View style={styles.centered}>
              <Text style={styles.largeValue}>--</Text>
              <Text style={styles.label}>No data</Text>
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
    fontSize: 20, // text-xl
    fontWeight: "bold",
  },
  label: {
    fontSize: 14, // text-sm
    color: "#9ca3af", // text-gray-400
  },
  status: {
    fontSize: 12, // text-xs
    fontWeight: "600", // font-semibold
  },
  statusMargin: {
    marginTop: 8, // mt-2
  },
  hint: {
    fontSize: 12, // text-xs
    color: "#9ca3af", // text-gray-400
    textAlign: "center",
  },
  errorText: {
    color: "#f87171", // text-red-400
  },
});
