import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface DateSelectorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  style?: any;
}

export const DateSelector: React.FC<DateSelectorProps> = ({
  selectedDate,
  onDateChange,
  style,
}) => {
  const formatDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
  };

  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    onDateChange(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    onDateChange(newDate);
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        onPress={goToPreviousDay}
        style={styles.navigationButton}
      >
        <Text style={styles.navigationButtonText}>‹</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.dateButton}>
        <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={goToNextDay}
        disabled={isToday}
        style={[
          styles.navigationButton,
          isToday && styles.navigationButtonDisabled,
        ]}
      >
        <Text style={styles.navigationButtonText}>›</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: 160,
  },
  navigationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  navigationButtonDisabled: {
    opacity: 0.3,
  },
  navigationButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
});
