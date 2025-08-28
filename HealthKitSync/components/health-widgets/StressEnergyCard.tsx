import React, { useState, useEffect } from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CircularProgress } from "../common/CircularProgress";
import {
  HealthAPIService,
  StressMetrics,
} from "../../services/HealthAPIService";
import { colors, typography, spacing, shadows } from "../../styles";

interface StressEnergyCardProps {
  onPress: () => void;
  selectedDate?: Date;
  userId?: string;
}

interface MetricBarProps {
  label: string;
  value: number;
  unit?: string;
}

const MetricBar: React.FC<MetricBarProps> = ({ label, value, unit = "" }) => {
  return (
    <View style={styles.metricColumn}>
      {/* Bar indicator */}
      <View style={styles.barContainer}>
        <View style={styles.barBackground}>
          <View
            style={[styles.barFill, { width: `${Math.min(value, 100)}%` }]}
          />
        </View>
      </View>

      {/* Value */}
      <Text style={styles.metricValue}>
        {value}
        {unit}
      </Text>

      {/* Label */}
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
};

export const StressEnergyCard: React.FC<StressEnergyCardProps> = ({
  onPress,
  selectedDate = new Date(),
  userId = "google_103919394379618915600",
}) => {
  const [stressMetrics, setStressMetrics] = useState<StressMetrics | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStressMetrics = async () => {
      try {
        setIsLoading(true);
        const localDate = selectedDate.toISOString().split("T")[0];
        const data = await HealthAPIService.getStressMetrics(localDate, userId);
        setStressMetrics(data);
      } catch (error) {
        console.error("Error fetching stress metrics:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStressMetrics();
  }, [selectedDate, userId]);

  const formatTimeAgo = (timestamp: string | Date) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    // Return time in HH:MM format
    return time.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const getStressLevel = (value: number) => {
    if (value <= 30) return "low";
    if (value <= 70) return "moderate";
    return "high";
  };

  const getStressColor = (level: string) => {
    switch (level) {
      case "low":
        return colors.success;
      case "moderate":
        return colors.warning;
      case "high":
        return colors.error;
      default:
        return colors.gray[400];
    }
  };

  if (isLoading || !stressMetrics) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View
              style={[styles.statusDot, { backgroundColor: colors.gray[400] }]}
            />
            <View>
              <Text style={styles.title}>Today's stress</Text>
              <Text style={styles.subtitle}>Loading...</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.gray[400]} />
        </View>

        <View style={styles.content}>
          <View style={styles.metricsContainer}>
            <MetricBar label="Highest" value={0} />
            <MetricBar label="Lowest" value={0} />
            <MetricBar label="Average" value={0} />
          </View>

          <View style={styles.chartContainer}>
            <CircularProgress progress={0} size={80} strokeWidth={6}>
              <Text style={styles.chartValue}>--</Text>
            </CircularProgress>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const stressLevel = getStressLevel(stressMetrics.current);
  const stressColor = getStressColor(stressLevel);
  const lastUpdatedText = formatTimeAgo(stressMetrics.lastUpdated);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, { backgroundColor: stressColor }]} />
          <View>
            <Text style={styles.title}>Today's stress</Text>
            <Text style={styles.subtitle}>
              Last updated at {lastUpdatedText}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.gray[400]} />
      </View>

      <View style={styles.content}>
        <View style={styles.metricsContainer}>
          <MetricBar label="Highest" value={stressMetrics.highest} />
          <MetricBar label="Lowest" value={stressMetrics.lowest} />
          <MetricBar label="Average" value={stressMetrics.average} />
        </View>

        <View style={styles.chartContainer}>
          <CircularProgress
            progress={stressMetrics.current}
            size={80}
            strokeWidth={6}
            showGradient={true}
          >
            <Text style={styles.chartValue}>{stressMetrics.current}</Text>
          </CircularProgress>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
    padding: spacing.lg,
    ...shadows.md,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.md,
  },
  title: {
    ...typography.styles.body,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[900],
  },
  subtitle: {
    ...typography.styles.caption,
    color: colors.gray[500],
    marginTop: 2,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricsContainer: {
    flexDirection: "row",
    flex: 1,
    gap: spacing.lg,
  },
  metricColumn: {
    flex: 1,
    alignItems: "center",
  },
  barContainer: {
    width: "100%",
    marginBottom: spacing.xs,
  },
  barBackground: {
    height: 3,
    backgroundColor: colors.gray[200],
    borderRadius: 1.5,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: colors.gray[400],
    borderRadius: 1.5,
  },
  metricValue: {
    ...typography.styles.bodySmall,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[900],
    marginBottom: 2,
  },
  metricLabel: {
    ...typography.styles.caption,
    color: colors.gray[500],
    textAlign: "center",
  },
  chartContainer: {
    marginLeft: spacing.lg,
    alignItems: "center",
  },
  chartValue: {
    ...typography.styles.h4,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
});
