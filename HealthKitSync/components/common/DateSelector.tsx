import React from "react";
import { TouchableOpacity, View, Text } from "react-native";
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
    <View className="flex-row items-center justify-between w-40" style={style}>
      <TouchableOpacity
        onPress={goToPreviousDay}
        className="w-10 h-10 rounded-full border border-gray-300 items-center justify-center bg-white shadow-sm"
      >
        <Text className="text-lg font-semibold text-gray-700">‹</Text>
      </TouchableOpacity>

      <TouchableOpacity className="flex-row items-center gap-2 px-3 py-2">
        <Text className="text-lg font-semibold text-gray-900">
          {formatDate(selectedDate)}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#374151" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={goToNextDay}
        disabled={isToday}
        className={`w-10 h-10 rounded-full border border-gray-300 items-center justify-center bg-white shadow-sm ${
          isToday ? "opacity-30" : "opacity-100"
        }`}
      >
        <Text className="text-lg font-semibold text-gray-700">›</Text>
      </TouchableOpacity>
    </View>
  );
};
