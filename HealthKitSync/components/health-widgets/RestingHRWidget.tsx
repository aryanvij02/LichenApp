import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
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
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons
              name="pulse"
              size={20}
              color={
                rhrData ? getStatusColor(rhrData.resting_heart_rate) : "#8E8E93"
              }
            />
            <Text style={styles.title}>RHR</Text>
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
                Error loading{"\n"}RHR data
              </Text>
            </View>
          ) : rhrData ? (
            <View style={styles.centered}>
              <Text
                style={[
                  styles.largeValue,
                  { color: getStatusColor(rhrData.resting_heart_rate) },
                ]}
              >
                {rhrData.resting_heart_rate}
              </Text>
              <Text style={styles.label}>bpm</Text>
              <Text
                style={[
                  styles.status,
                  { color: getStatusColor(rhrData.resting_heart_rate) },
                ]}
              >
                {getStatusText(rhrData.resting_heart_rate)}
              </Text>
            </View>
          ) : (
            <View style={styles.centered}>
              <Text style={styles.largeValue}>--</Text>
              <Text style={styles.hint}>No RHR data{"\n"}for this date</Text>
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
  hint: {
    fontSize: 12, // text-xs
    color: "#9ca3af", // text-gray-400
    textAlign: "center",
  },
  errorText: {
    color: "#f87171", // text-red-400
  },
});
