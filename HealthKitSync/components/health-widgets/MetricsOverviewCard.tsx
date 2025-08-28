import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { CircularProgress } from "../common/CircularProgress";
import { HealthAPIService } from "../../services/HealthAPIService";
import { colors, typography, spacing, shadows } from "../../styles";

interface MetricsOverviewCardProps {
  selectedDate?: Date;
  userId?: string;
}

interface MetricData {
  value: number;
  label: string;
  color: string;
  isLoading: boolean;
}

export const MetricsOverviewCard: React.FC<MetricsOverviewCardProps> = ({
  selectedDate = new Date(),
  userId = "google_103919394379618915600",
}) => {
  const [metrics, setMetrics] = useState<{
    strain: MetricData;
    recovery: MetricData;
    sleep: MetricData;
  }>({
    strain: {
      value: 0,
      label: "Strain",
      color: colors.warning,
      isLoading: true,
    },
    recovery: {
      value: 0,
      label: "Recovery",
      color: colors.success,
      isLoading: true,
    },
    sleep: {
      value: 0,
      label: "Sleep",
      color: colors.health.sleep,
      isLoading: true,
    },
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      const localDate = selectedDate.toISOString().split("T")[0];

      try {
        // Fetch strain data (using stress as proxy for strain)
        const stressData = await HealthAPIService.getStressData(
          localDate,
          userId
        );
        const strainValue = Math.max(0, 100 - stressData.stress_level); // Invert stress to get strain

        setMetrics((prev) => ({
          ...prev,
          strain: {
            ...prev.strain,
            value: strainValue,
            isLoading: false,
          },
        }));

        // Fetch recovery data (using HRV as proxy)
        const hrvData = await HealthAPIService.getHRVData(localDate, userId);
        const recoveryValue = Math.min(100, (hrvData.hrv_value / 50) * 100); // Normalize HRV to percentage

        setMetrics((prev) => ({
          ...prev,
          recovery: {
            ...prev.recovery,
            value: Math.round(recoveryValue),
            isLoading: false,
          },
        }));

        // Fetch sleep data
        const sleepSummary = await HealthAPIService.getSleepSummary(
          localDate,
          userId
        );
        const sleepValue = sleepSummary.sleep_efficiency;

        setMetrics((prev) => ({
          ...prev,
          sleep: {
            ...prev.sleep,
            value: Math.round(sleepValue),
            isLoading: false,
          },
        }));
      } catch (error) {
        console.error("Error fetching metrics:", error);
        // Set loading to false for all metrics on error
        setMetrics((prev) => ({
          strain: { ...prev.strain, isLoading: false },
          recovery: { ...prev.recovery, isLoading: false },
          sleep: { ...prev.sleep, isLoading: false },
        }));
      }
    };

    fetchMetrics();
  }, [selectedDate, userId]);

  const renderMetric = (metric: MetricData) => {
    return (
      <View style={styles.metricContainer}>
        <CircularProgress
          progress={metric.isLoading ? 0 : metric.value}
          size={100}
          strokeWidth={8}
          showGradient={false}
          gradientColors={[metric.color]}
          backgroundColor={colors.gray[200]}
          animationDuration={1800}
          animationDelay={
            metric.label === "Strain"
              ? 0
              : metric.label === "Recovery"
              ? 200
              : 400
          }
        >
          <Text style={styles.metricValue}>
            {metric.isLoading ? "--" : `${metric.value}`}
            <Text style={styles.metricUnit}>%</Text>
          </Text>
        </CircularProgress>
        <Text style={styles.metricLabel}>{metric.label}</Text>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.metricsRow}>
        {renderMetric(metrics.strain)}
        {renderMetric(metrics.recovery)}
        {renderMetric(metrics.sleep)}
      </View>
    </View>
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
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing.sm,
  },
  metricValue: {
    ...typography.styles.h4,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray[900],
  },
  metricUnit: {
    ...typography.styles.bodySmall,
    fontWeight: typography.fontWeight.normal,
    color: colors.gray[600],
  },
  metricLabel: {
    ...typography.styles.bodySmall,
    color: colors.gray[600],
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
