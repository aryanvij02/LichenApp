import React, { useState } from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DateSelector } from "../components/common/DateSelector";
import { UserAvatar } from "../components/common/UserAvatar";
import { MetricsOverviewCard } from "../components/health-widgets/MetricsOverviewCard";
import { StressEnergyCard } from "../components/health-widgets/StressEnergyCard";
import { UpcomingActivityCard } from "../components/health-widgets/UpcomingActivityCard";
import { DailySummaryCard } from "../components/health-widgets/DailySummaryCard";
import { colors } from "../styles";

export const HomeScreen: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());

  const handleStressPress = () => {
    console.log("Navigate to Stress & Energy details");
  };

  const handleActivityPress = () => {
    console.log("Navigate to Calendar/Activities");
  };

  const handleSummaryPress = () => {
    console.log("Navigate to Daily Summary details");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <DateSelector
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
          <UserAvatar />
        </View>

        {/* Content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Metrics Overview Card */}
          <MetricsOverviewCard selectedDate={selectedDate} />

          {/* Stress & Energy Card */}
          <StressEnergyCard
            onPress={handleStressPress}
            selectedDate={selectedDate}
          />

          {/* Upcoming Activity Card */}
          <UpcomingActivityCard onPress={handleActivityPress} />

          {/* Daily Summary Card */}
          <DailySummaryCard
            onPress={handleSummaryPress}
            selectedDate={selectedDate}
          />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
});
