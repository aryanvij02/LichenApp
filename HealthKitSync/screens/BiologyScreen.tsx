import React, { useState } from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DateSelector } from "../components/common/DateSelector";
import { LiveHeartRateWidget } from "../components/health-widgets/LiveHeartRateWidget";
import { RestingHRWidget } from "../components/health-widgets/RestingHRWidget";
import { StepsWidget } from "../components/health-widgets/StepsWidget";
import { SleepWidget } from "../components/health-widgets/SleepWidget";

export const BiologyScreen: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());

  const handleHeartRatePress = () => {
    console.log("Navigate to Heart Rate detail");
  };

  const handleRHRPress = () => {
    console.log("Navigate to RHR detail");
  };

  const handleStepsPress = () => {
    console.log("Navigate to Steps detail");
  };

  const handleSleepPress = () => {
    console.log("Navigate to Sleep detail");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Single container with consistent padding */}
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <DateSelector
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
          <View />
        </View>

        {/* Content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Page Title */}
          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle}>Biology</Text>
          </View>

          {/* Main Health Widgets - 2x2 Grid */}
          <View style={styles.widgetsContainer}>
            <View style={styles.widgetRow}>
              <View style={styles.widgetHalf}>
                <LiveHeartRateWidget onPress={handleHeartRatePress} />
              </View>
              <View style={styles.widgetHalf}>
                <RestingHRWidget
                  selectedDate={selectedDate}
                  onPress={handleRHRPress}
                />
              </View>
            </View>

            <View style={styles.widgetRow}>
              <View style={styles.widgetHalf}>
                <StepsWidget
                  selectedDate={selectedDate}
                  onPress={handleStepsPress}
                />
              </View>
              <View style={styles.widgetHalf}>
                <SleepWidget
                  selectedDate={selectedDate}
                  onPress={handleSleepPress}
                />
              </View>
            </View>
          </View>

          {/* Additional Sections */}
          <View style={styles.additionalSection}>
            <Text style={styles.sectionTitle}>Energy & Stress</Text>
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderText}>
                Body Battery and Stress widgets coming soon...
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
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
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111827",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  titleContainer: {
    marginBottom: 24,
  },
  widgetsContainer: {
    gap: 16,
    marginBottom: 24,
  },
  widgetRow: {
    flexDirection: "row",
    gap: 16,
  },
  widgetHalf: {
    flex: 1,
  },
  additionalSection: {
    gap: 16,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  placeholderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  placeholderText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
});
