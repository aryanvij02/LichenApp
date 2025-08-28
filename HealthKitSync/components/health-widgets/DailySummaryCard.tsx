import React, { useState, useEffect } from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import {
  HealthAPIService,
  DailySummary,
} from "../../services/HealthAPIService";
import { colors, typography, spacing, shadows } from "../../styles";

interface DailySummaryCardProps {
  onPress: () => void;
  selectedDate?: Date;
  userId?: string;
}

export const DailySummaryCard: React.FC<DailySummaryCardProps> = ({
  onPress,
  selectedDate = new Date(),
  userId = "google_103919394379618915600",
}) => {
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDailySummary = async () => {
      try {
        setIsLoading(true);
        const localDate = selectedDate.toISOString().split("T")[0];
        const data = await HealthAPIService.getDailySummary(localDate, userId);
        setDailySummary(data);
      } catch (error) {
        console.error("Error fetching daily summary:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDailySummary();
  }, [selectedDate, userId]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return colors.success;
    if (score >= 60) return colors.warning;
    return colors.error;
  };

  const getScoreLevel = (score: number) => {
    if (score >= 90) return "Excellent";
    if (score >= 80) return "Great";
    if (score >= 70) return "Good";
    if (score >= 60) return "Fair";
    return "Needs Attention";
  };

  if (isLoading || !dailySummary) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.card}
      >
        <View style={styles.content}>
          <View style={styles.textContainer}>
            <Text style={styles.title}>YOUR DAILY SUMMARY</Text>
            <Text style={styles.subtitle}>Loading...</Text>
          </View>

          <View style={styles.scoreContainer}>
            <View
              style={[styles.scoreCircle, { borderColor: colors.gray[200] }]}
            >
              <Text style={[styles.scoreText, { color: colors.gray[400] }]}>
                --
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const scoreColor = getScoreColor(dailySummary.score);
  const scoreLevel = getScoreLevel(dailySummary.score);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.card}>
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={styles.title}>YOUR DAILY SUMMARY</Text>
          <Text style={styles.subtitle}>{scoreLevel}</Text>
          {dailySummary.insights.length > 0 && (
            <Text style={styles.insights} numberOfLines={2}>
              {dailySummary.insights[0]}
            </Text>
          )}
        </View>

        <View style={styles.scoreContainer}>
          <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
            <Text style={[styles.scoreText, { color: scoreColor }]}>
              {dailySummary.score}
            </Text>
          </View>
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
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  textContainer: {
    flex: 1,
    paddingRight: spacing.md,
  },
  title: {
    ...typography.styles.caption,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[500],
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.styles.body,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[900],
    marginBottom: 4,
  },
  insights: {
    ...typography.styles.caption,
    color: colors.gray[500],
    lineHeight: 16,
  },
  scoreContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  scoreCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.secondary,
  },
  scoreText: {
    ...typography.styles.h4,
    fontWeight: typography.fontWeight.bold,
  },
});
