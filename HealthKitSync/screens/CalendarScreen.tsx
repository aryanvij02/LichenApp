import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, Agenda } from "react-native-calendars";
import * as Localization from "expo-localization";
import {
  googleCalendarService,
  CalendarEvent,
} from "../services/GoogleCalendarService";

type CalendarView = "month" | "day";

export const CalendarScreen: React.FC = () => {
  // Helper function to get today's date in user's timezone
  const getTodayString = () => {
    const now = new Date();
    const locales = Localization.getLocales();
    const calendars = Localization.getCalendars();
    const timezone =
      calendars[0]?.timeZone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Get date in user's timezone
    const todayInTimezone = now.toLocaleDateString("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    // Additional debugging to help identify timezone issues
    const nowLocal = new Date().toLocaleDateString("en-CA");
    const nowUTC = new Date().toISOString().split("T")[0];

    console.log(
      `📅 CalendarScreen Debug:
      - Timezone: ${timezone}
      - Today in timezone: ${todayInTimezone}
      - Today local: ${nowLocal}
      - Today UTC: ${nowUTC}
      - Timezone offset: ${new Date().getTimezoneOffset()} minutes`
    );

    return todayInTimezone; // Returns YYYY-MM-DD format
  };

  //We can default selectedDate to today's date
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [currentView, setCurrentView] = useState<CalendarView>("month");
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCalendarAccess, setHasCalendarAccess] = useState(false);

  const handleDayPress = (day: any) => {
    setSelectedDate(day.dateString);
  };

  const getCurrentDate = () => {
    return selectedDate;
  };

  const goToPreviousDay = () => {
    // Parse the date as local date to avoid timezone issues
    const [year, month, day] = selectedDate.split("-").map(Number);
    const currentDate = new Date(year, month - 1, day); // month is 0-indexed
    currentDate.setDate(currentDate.getDate() - 1);

    // Format back to YYYY-MM-DD in local timezone
    const newDateString = currentDate.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    setSelectedDate(newDateString);
  };

  const goToNextDay = () => {
    // Parse the date as local date to avoid timezone issues
    const [year, month, day] = selectedDate.split("-").map(Number);
    const currentDate = new Date(year, month - 1, day); // month is 0-indexed
    currentDate.setDate(currentDate.getDate() + 1);

    // Format back to YYYY-MM-DD in local timezone
    const newDateString = currentDate.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    setSelectedDate(newDateString);
  };

  // Check calendar permissions and load events
  useEffect(() => {
    checkCalendarAccess();
  }, []);

  // Load events when selected date changes
  useEffect(() => {
    if (hasCalendarAccess) {
      loadEventsForDate(selectedDate);
    }
  }, [selectedDate, hasCalendarAccess]);

  const checkCalendarAccess = async () => {
    try {
      const hasAccess = await googleCalendarService.hasCalendarPermissions();
      setHasCalendarAccess(hasAccess);
      if (!hasAccess) {
        Alert.alert(
          "Calendar Access",
          "To view your Google Calendar events, please sign in and grant calendar permissions.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Sign In",
              onPress: () => console.log("Navigate to sign in"),
            },
          ]
        );
      }
    } catch (error) {
      console.error("Error checking calendar access:", error);
      setHasCalendarAccess(false);
    }
  };

  const loadEventsForDate = async (date: string) => {
    try {
      setLoading(true);
      const events = await googleCalendarService.getEventsForDate(date);
      setCalendarEvents(events);
    } catch (error) {
      console.error("Error loading calendar events:", error);
      Alert.alert("Error", "Failed to load calendar events. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatEventTime = (event: CalendarEvent): string => {
    if (event.start.dateTime && event.end.dateTime) {
      const startTime = new Date(event.start.dateTime);
      const endTime = new Date(event.end.dateTime);
      const startStr = startTime.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const endStr = endTime.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      return `${startStr} - ${endStr}`;
    }
    return "All Day";
  };

  const getEventDurationInHours = (event: CalendarEvent): number => {
    if (event.start.dateTime && event.end.dateTime) {
      const start = new Date(event.start.dateTime);
      const end = new Date(event.end.dateTime);
      return (end.getTime() - start.getTime()) / (1000 * 60 * 60); // Convert to hours
    }
    return 1; // Default to 1 hour for events without duration
  };

  const getTheme = () => ({
    backgroundColor: "#ffffff",
    calendarBackground: "#ffffff",
    textSectionTitleColor: "#6B7280",
    selectedDayBackgroundColor: "#3B82F6",
    selectedDayTextColor: "#ffffff",
    todayTextColor: "#3B82F6",
    dayTextColor: "#1F2937",
    textDisabledColor: "#D1D5DB",
    dotColor: "#3B82F6",
    selectedDotColor: "#ffffff",
    arrowColor: "#3B82F6",
    monthTextColor: "#1F2937",
    indicatorColor: "#3B82F6",
    textDayFontFamily: "System",
    textMonthFontFamily: "System",
    textDayHeaderFontFamily: "System",
    textDayFontWeight: "400" as const,
    textMonthFontWeight: "600" as const,
    textDayHeaderFontWeight: "600" as const,
    textDayFontSize: 16,
    textMonthFontSize: 18,
    textDayHeaderFontSize: 14,
  });

  const renderViewToggle = () => (
    <View style={styles.viewToggleContainer}>
      {(["month", "day"] as CalendarView[]).map((view) => (
        <TouchableOpacity
          key={view}
          onPress={() => setCurrentView(view)}
          style={[
            styles.viewToggleButton,
            currentView === view
              ? styles.viewToggleButtonActive
              : styles.viewToggleButtonInactive,
          ]}
        >
          <Text
            style={[
              styles.viewToggleText,
              currentView === view
                ? styles.viewToggleTextActive
                : styles.viewToggleTextInactive,
            ]}
          >
            {view}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderMonthView = () => (
    <View style={styles.monthViewContainer}>
      <Calendar
        onDayPress={handleDayPress}
        markedDates={
          selectedDate
            ? {
                [selectedDate]: {
                  selected: true,
                  selectedColor: "#3B82F6",
                  selectedTextColor: "white",
                },
              }
            : {}
        }
        theme={getTheme()}
      />
    </View>
  );

  const getEventAbsolutePosition = (
    event: CalendarEvent
  ): { top: number; height: number } => {
    if (!event.start.dateTime) return { top: 0, height: 60 };

    const startTime = new Date(event.start.dateTime);
    const endTime = event.end.dateTime
      ? new Date(event.end.dateTime)
      : new Date(startTime.getTime() + 60 * 60 * 1000);

    const startHour = startTime.getHours();
    const startMinutes = startTime.getMinutes();
    const endHour = endTime.getHours();
    const endMinutes = endTime.getMinutes();

    // Calculate top position: hour * 60px + (minutes/60) * 60px
    const top = startHour * 60 + (startMinutes / 60) * 60;

    // Calculate total duration in minutes
    const durationMinutes =
      (endTime.getTime() - startTime.getTime()) / (1000 * 60);
    const height = Math.max((durationMinutes / 60) * 60, 20); // Minimum 20px

    return { top, height };
  };

  const renderDayView = () => {
    const currentDate = getCurrentDate();
    //Creates an array like object with 24 empty slots
    const timeSlots = Array.from({ length: 24 }, (_, i) => {
      const hour = i.toString().padStart(2, "0");
      return `${hour}:00`;
    });

    return (
      <View style={styles.dayViewContainer}>
        <View style={styles.dayViewHeader}>
          <View style={styles.dayViewNavigation}>
            <TouchableOpacity
              onPress={goToPreviousDay}
              style={styles.navButton}
            >
              <Text style={styles.navButtonText}>←</Text>
            </TouchableOpacity>

            <Text style={styles.dayViewTitle}>
              {new Date(currentDate + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Text>

            <TouchableOpacity onPress={goToNextDay} style={styles.navButton}>
              <Text style={styles.navButtonText}>→</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView style={styles.scrollView}>
          <View style={styles.timeGrid}>
            {/* Time slots grid */}
            {timeSlots.map((time, index) => (
              <View key={time} style={styles.timeSlot}>
                <View style={styles.timeLabel}>
                  <Text style={styles.timeLabelText}>{time}</Text>
                </View>
              </View>
            ))}

            {/* Continuous event blocks overlaid on grid */}
            {calendarEvents
              .filter((event) => event.start.dateTime)
              .map((event) => {
                const { top, height } = getEventAbsolutePosition(event);
                const duration = getEventDurationInHours(event);

                return (
                  <View
                    key={event.id}
                    style={[
                      styles.eventBlock,
                      {
                        left: 16 + 64 + 12, // time column width + padding
                        right: 12,
                        top: top,
                        height: height,
                      },
                    ]}
                  >
                    <Text style={styles.eventTitle} numberOfLines={2}>
                      {event.summary}
                    </Text>
                    <Text style={styles.eventTime}>
                      {formatEventTime(event)}
                    </Text>
                    {event.location && height > 40 && (
                      <Text style={styles.eventLocation} numberOfLines={1}>
                        📍 {event.location}
                      </Text>
                    )}
                    {duration > 1 && height > 60 && (
                      <Text style={styles.eventDuration}>
                        Duration: {duration.toFixed(1)}h
                      </Text>
                    )}
                  </View>
                );
              })}

            {/* All-day events at the top */}
            <View style={styles.allDayContainer}>
              {calendarEvents
                .filter((event) => !event.start.dateTime && event.start.date)
                .map((event, idx) => (
                  <View
                    key={event.id}
                    style={[
                      styles.allDayEvent,
                      {
                        marginLeft: 16 + 64 + 12,
                        marginTop: idx * 35,
                      },
                    ]}
                  >
                    <Text style={styles.allDayEventTitle} numberOfLines={1}>
                      {event.summary}
                    </Text>
                    <Text style={styles.allDayEventLabel}>All Day</Text>
                  </View>
                ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case "month":
        return renderMonthView();
      case "day":
        return renderDayView();
      default:
        return renderMonthView();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.screenTitle}>Calendar</Text>

        {renderViewToggle()}

        {loading && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>Loading calendar events...</Text>
          </View>
        )}

        {renderCurrentView()}

        {/* Calendar Access Status */}
        {!hasCalendarAccess && (
          <View style={styles.accessAlert}>
            <Text style={styles.accessAlertTitle}>
              Calendar Access Required
            </Text>
            <Text style={styles.accessAlertText}>
              Sign in with Google to view your calendar events in this app.
            </Text>
            <TouchableOpacity
              onPress={checkCalendarAccess}
              style={styles.accessButton}
            >
              <Text style={styles.accessButtonText}>Check Access</Text>
            </TouchableOpacity>
          </View>
        )}

        {selectedDate && currentView !== "day" && (
          <View style={styles.selectedDateCard}>
            <Text style={styles.selectedDateTitle}>Selected Date</Text>
            <Text style={styles.selectedDateText}>
              {new Date(selectedDate + "T00:00:00").toLocaleDateString(
                "en-US",
                {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }
              )}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6", // bg-gray-100
  },
  content: {
    flex: 1,
    padding: 16, // p-4
  },
  screenTitle: {
    fontSize: 30, // text-3xl
    fontWeight: "600", // font-semibold
    color: "#111827", // text-gray-900
    marginBottom: 24, // mb-6
    textAlign: "center",
  },
  // View Toggle Styles
  viewToggleContainer: {
    flexDirection: "row",
    backgroundColor: "white",
    borderRadius: 12, // rounded-xl
    padding: 4, // p-1
    marginBottom: 24, // mb-6
    // Shadow styles for shadow-sm
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  viewToggleButton: {
    flex: 1,
    paddingVertical: 12, // py-3
    paddingHorizontal: 16, // px-4
    borderRadius: 8, // rounded-lg
  },
  viewToggleButtonActive: {
    backgroundColor: "#3b82f6", // bg-blue-500
  },
  viewToggleButtonInactive: {
    backgroundColor: "transparent",
  },
  viewToggleText: {
    textAlign: "center",
    fontWeight: "600", // font-semibold
    textTransform: "capitalize",
  },
  viewToggleTextActive: {
    color: "white",
  },
  viewToggleTextInactive: {
    color: "#4b5563", // text-gray-600
  },
  // Month View Styles
  monthViewContainer: {
    backgroundColor: "white",
    borderRadius: 12, // rounded-xl
    // Shadow styles for shadow-sm
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  // Day View Styles
  dayViewContainer: {
    backgroundColor: "white",
    borderRadius: 12, // rounded-xl
    flex: 1,
    // Shadow styles for shadow-sm
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  dayViewHeader: {
    padding: 16, // p-4
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb", // border-gray-200
  },
  dayViewNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navButton: {
    padding: 8, // p-2
    borderRadius: 8, // rounded-lg
    backgroundColor: "#f3f4f6", // bg-gray-100
  },
  navButtonText: {
    color: "#2563eb", // text-blue-600
    fontWeight: "600", // font-semibold
  },
  dayViewTitle: {
    fontSize: 18, // text-lg
    fontWeight: "600", // font-semibold
    color: "#111827", // text-gray-900
    textAlign: "center",
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  timeGrid: {
    position: "relative",
  },
  timeSlot: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6", // border-gray-100
    height: 60,
  },
  timeLabel: {
    width: 64, // w-16
    padding: 12, // p-3
    borderRightWidth: 1,
    borderRightColor: "#f3f4f6", // border-gray-100
  },
  timeLabelText: {
    fontSize: 14, // text-sm
    color: "#6b7280", // text-gray-500
    textAlign: "right",
  },
  // Event Styles
  eventBlock: {
    position: "absolute",
    backgroundColor: "#dbeafe", // bg-blue-100
    borderLeftWidth: 4,
    borderLeftColor: "#3b82f6", // border-blue-500
    borderRadius: 8, // rounded-lg
    zIndex: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    // Shadow styles for shadow-sm
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  eventTitle: {
    fontSize: 12,
    fontWeight: "600", // font-semibold
    color: "#1e3a8a", // text-blue-900
  },
  eventTime: {
    fontSize: 10,
    color: "#1d4ed8", // text-blue-700
  },
  eventLocation: {
    fontSize: 10,
    color: "#2563eb", // text-blue-600
  },
  eventDuration: {
    fontSize: 10,
    color: "#3b82f6", // text-blue-500
    marginTop: 4,
  },
  // All-day Events
  allDayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  allDayEvent: {
    marginHorizontal: 12, // mx-3
    marginBottom: 8, // mb-2
    padding: 8, // p-2
    backgroundColor: "#dcfce7", // bg-green-100
    borderRadius: 8, // rounded-lg
  },
  allDayEventTitle: {
    fontSize: 14, // text-sm
    fontWeight: "600", // font-semibold
    color: "#14532d", // text-green-900
  },
  allDayEventLabel: {
    fontSize: 12, // text-xs
    color: "#15803d", // text-green-700
  },
  // Loading Overlay
  loadingOverlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -75 }, { translateY: -25 }],
    backgroundColor: "white",
    borderRadius: 12, // rounded-xl
    padding: 16, // p-4
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
  loadingText: {
    color: "#4b5563", // text-gray-600
  },
  // Access Alert
  accessAlert: {
    marginTop: 16, // mt-4
    backgroundColor: "#fef3c7", // bg-yellow-100
    borderRadius: 12, // rounded-xl
    padding: 16, // p-4
  },
  accessAlertTitle: {
    color: "#92400e", // text-yellow-800
    fontWeight: "600", // font-semibold
    marginBottom: 8, // mb-2
  },
  accessAlertText: {
    color: "#b45309", // text-yellow-700
    fontSize: 14, // text-sm
    marginBottom: 12, // mb-3
  },
  accessButton: {
    backgroundColor: "#d97706", // bg-yellow-600
    borderRadius: 8, // rounded-lg
    paddingVertical: 8, // py-2
    paddingHorizontal: 16, // px-4
  },
  accessButtonText: {
    color: "white",
    fontWeight: "600", // font-semibold
    textAlign: "center",
  },
  // Selected Date Card
  selectedDateCard: {
    marginTop: 24, // mt-6
    backgroundColor: "white",
    borderRadius: 12, // rounded-xl
    padding: 16, // p-4
    // Shadow styles for shadow-sm
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  selectedDateTitle: {
    fontSize: 18, // text-lg
    fontWeight: "600", // font-semibold
    color: "#111827", // text-gray-900
    marginBottom: 8, // mb-2
  },
  selectedDateText: {
    color: "#4b5563", // text-gray-600
  },
});
