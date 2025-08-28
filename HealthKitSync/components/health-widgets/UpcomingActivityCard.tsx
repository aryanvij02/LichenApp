import React, { useState, useEffect } from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  googleCalendarService,
  CalendarEvent,
} from "../../services/GoogleCalendarService";
import { colors, typography, spacing, shadows } from "../../styles";
import { useAuth } from "../../context/AuthContext";

interface UpcomingActivity {
  id: string;
  type: string;
  title: string;
  time?: string;
  description?: string;
  location?: string;
}

interface UpcomingActivityCardProps {
  onPress: () => void;
}

export const UpcomingActivityCard: React.FC<UpcomingActivityCardProps> = ({
  onPress,
}) => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<UpcomingActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCalendarAccess, setHasCalendarAccess] = useState(false);

  // Helper function to categorize events based on keywords
  const categorizeEvent = (event: CalendarEvent): string => {
    const title = event.summary?.toLowerCase() || "";
    const description = event.description?.toLowerCase() || "";
    const text = `${title} ${description}`;

    if (
      text.includes("doctor") ||
      text.includes("appointment") ||
      text.includes("medical") ||
      text.includes("dentist") ||
      text.includes("clinic") ||
      text.includes("hospital") ||
      text.includes("checkup") ||
      text.includes("therapy")
    ) {
      return "medical";
    }

    if (
      text.includes("gym") ||
      text.includes("workout") ||
      text.includes("fitness") ||
      text.includes("exercise") ||
      text.includes("training") ||
      text.includes("run") ||
      text.includes("yoga") ||
      text.includes("pilates") ||
      text.includes("sport")
    ) {
      return "fitness";
    }

    if (
      text.includes("wellness") ||
      text.includes("meditation") ||
      text.includes("massage") ||
      text.includes("spa") ||
      text.includes("mindfulness") ||
      text.includes("relaxation")
    ) {
      return "wellness";
    }

    return "general";
  };

  // Helper function to clean HTML from text
  const cleanHtmlText = (htmlText?: string): string => {
    if (!htmlText) return "";

    // Remove HTML tags and decode common HTML entities
    return htmlText
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/&nbsp;/g, " ") // Replace non-breaking spaces
      .replace(/&amp;/g, "&") // Replace &amp; with &
      .replace(/&lt;/g, "<") // Replace &lt; with <
      .replace(/&gt;/g, ">") // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/&#39;/g, "'") // Replace &#39; with '
      .replace(/\s+/g, " ") // Replace multiple whitespace with single space
      .trim(); // Remove leading/trailing whitespace
  };

  // Helper function to convert CalendarEvent to UpcomingActivity
  const convertToActivity = (event: CalendarEvent): UpcomingActivity => {
    const startTime = event.start.dateTime || event.start.date;

    return {
      id: event.id,
      type: categorizeEvent(event),
      title: event.summary || "Untitled Event",
      time: startTime,
      description: cleanHtmlText(event.description),
      location: event.location,
    };
  };

  useEffect(() => {
    const fetchUpcomingActivities = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // Get events for the next 7 days
        const now = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(now.getDate() + 7);

        console.log("📅 UpcomingActivityCard: Fetching calendar events...");
        const events = await googleCalendarService.getEventsForDateRange(
          now.toISOString().split("T")[0],
          nextWeek.toISOString().split("T")[0]
        );

        console.log(
          `📅 UpcomingActivityCard: Found ${events.length} calendar events`
        );

        // If we successfully got events, we have calendar access
        setHasCalendarAccess(true);

        // Convert events to activities and filter future events
        const futureActivities = events
          .map(convertToActivity)
          .filter((activity) => {
            if (!activity.time) return false;
            const eventTime = new Date(activity.time);
            return eventTime > now;
          })
          .sort((a, b) => {
            const timeA = new Date(a.time || "").getTime();
            const timeB = new Date(b.time || "").getTime();
            return timeA - timeB;
          });

        console.log(
          `📅 UpcomingActivityCard: ${futureActivities.length} upcoming activities`
        );
        setActivities(futureActivities);
      } catch (error) {
        console.error(
          "❌ UpcomingActivityCard: Error fetching calendar events:",
          error
        );
        // If we can't fetch events, assume no calendar access
        setHasCalendarAccess(false);
        setActivities([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUpcomingActivities();
  }, [user]);

  const formatActivityTime = (timeString?: string) => {
    if (!timeString) return null;

    const time = new Date(timeString);
    const now = new Date();
    const diffMs = time.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    // If it's today
    if (time.toDateString() === now.toDateString()) {
      if (diffHours === 0) {
        if (diffMins <= 0) return "Now";
        return `in ${diffMins}m`;
      }
      return `in ${diffHours}h ${diffMins}m`;
    }

    // If it's tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (time.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow at ${time.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}`;
    }

    // Other days
    return time.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const getActivityIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "medical":
        return "medical-outline";
      case "fitness":
        return "fitness-outline";
      case "wellness":
        return "leaf-outline";
      case "general":
      default:
        return "calendar-outline";
    }
  };

  const getActivityColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "medical":
        return colors.error;
      case "fitness":
        return colors.success;
      case "wellness":
        return colors.primary[600];
      case "general":
      default:
        return colors.gray[600];
    }
  };

  // Get the next upcoming activity
  const nextActivity = activities.length > 0 ? activities[0] : null;

  if (isLoading) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.card}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>UPCOMING ACTIVITY</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.gray[400]} />
        </View>

        <View style={styles.content}>
          <View style={styles.activityInfo}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="calendar-outline"
                size={24}
                color={colors.gray[400]}
              />
            </View>
            <View style={styles.activityDetails}>
              <Text style={styles.activityTitle}>Loading...</Text>
              <Text style={styles.activityTime}>--</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (!nextActivity) {
    const noDataIcon = hasCalendarAccess
      ? "checkmark-circle-outline"
      : "calendar-outline";
    const noDataIconColor = hasCalendarAccess
      ? colors.success
      : colors.gray[400];
    const noDataTitle = hasCalendarAccess
      ? "No upcoming activities"
      : "Calendar not connected";
    const noDataSubtitle = hasCalendarAccess
      ? "You're all set!"
      : "Sign in to view your calendar events";

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.card}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>UPCOMING ACTIVITY</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.gray[400]} />
        </View>

        <View style={styles.content}>
          <View style={styles.activityInfo}>
            <View style={styles.iconContainer}>
              <Ionicons name={noDataIcon} size={24} color={noDataIconColor} />
            </View>
            <View style={styles.activityDetails}>
              <Text style={styles.activityTitle}>{noDataTitle}</Text>
              <Text style={styles.activityTime}>{noDataSubtitle}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const activityTime = formatActivityTime(nextActivity.time);
  const iconName = getActivityIcon(nextActivity.type) as any;
  const iconColor = getActivityColor(nextActivity.type);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>UPCOMING ACTIVITY</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.gray[400]} />
      </View>

      <View style={styles.content}>
        <View style={styles.activityInfo}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: `${iconColor}20` },
            ]}
          >
            <Ionicons name={iconName} size={24} color={iconColor} />
          </View>
          <View style={styles.activityDetails}>
            <Text style={styles.activityTitle}>{nextActivity.title}</Text>
            {activityTime && (
              <Text style={styles.activityTime}>{activityTime}</Text>
            )}
            {nextActivity.location && (
              <Text style={styles.activityLocation} numberOfLines={1}>
                📍 {nextActivity.location}
              </Text>
            )}
            {nextActivity.description && (
              <Text style={styles.activityDescription} numberOfLines={2}>
                {nextActivity.description}
              </Text>
            )}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerTitle: {
    ...typography.styles.caption,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[500],
    letterSpacing: 0.5,
  },
  content: {
    paddingTop: spacing.xs,
  },
  activityInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.gray[100],
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  activityDetails: {
    flex: 1,
    paddingTop: 2,
  },
  activityTitle: {
    ...typography.styles.body,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[900],
    marginBottom: 4,
  },
  activityTime: {
    ...typography.styles.bodySmall,
    color: colors.primary[600],
    fontWeight: typography.fontWeight.medium,
    marginBottom: 4,
  },
  activityLocation: {
    ...typography.styles.caption,
    color: colors.gray[600],
    fontWeight: typography.fontWeight.medium,
    marginBottom: 4,
  },
  activityDescription: {
    ...typography.styles.caption,
    color: colors.gray[500],
    lineHeight: 16,
  },
});
