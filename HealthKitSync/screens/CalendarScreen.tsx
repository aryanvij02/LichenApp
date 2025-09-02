import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
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
    <View className="flex-row bg-white rounded-xl p-1 mb-6 shadow-sm">
      {(["month", "day"] as CalendarView[]).map((view) => (
        <TouchableOpacity
          key={view}
          onPress={() => setCurrentView(view)}
          className={`flex-1 py-3 px-4 rounded-lg ${
            currentView === view ? "bg-blue-500" : "bg-transparent"
          }`}
        >
          <Text
            className={`text-center font-semibold capitalize ${
              currentView === view ? "text-white" : "text-gray-600"
            }`}
          >
            {view}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderMonthView = () => (
    <View className="bg-white rounded-xl shadow-sm">
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
      <View className="bg-white rounded-xl shadow-sm flex-1">
        <View className="p-4 border-b border-gray-200">
          <View className="flex-row items-center justify-between">
            <TouchableOpacity
              onPress={goToPreviousDay}
              className="p-2 rounded-lg bg-gray-100"
            >
              <Text className="text-blue-600 font-semibold">←</Text>
            </TouchableOpacity>

            <Text className="text-lg font-semibold text-gray-900 text-center flex-1">
              {new Date(currentDate + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Text>

            <TouchableOpacity
              onPress={goToNextDay}
              className="p-2 rounded-lg bg-gray-100"
            >
              <Text className="text-blue-600 font-semibold">→</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView className="flex-1">
          <View className="relative">
            {/* Time slots grid */}
            {timeSlots.map((time, index) => (
              <View
                key={time}
                className="flex-row border-b border-gray-100"
                style={{ height: 60 }}
              >
                <View className="w-16 p-3 border-r border-gray-100">
                  <Text className="text-sm text-gray-500 text-right">
                    {time}
                  </Text>
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
                    className="absolute bg-blue-100 border-l-4 border-blue-500 rounded-lg shadow-sm"
                    style={{
                      left: 16 + 64 + 12, // time column width + padding
                      right: 12,
                      top: top,
                      height: height,
                      zIndex: 10,
                      paddingHorizontal: 8,
                      paddingVertical: 8,
                    }}
                  >
                    <Text
                      className="text-sm font-semibold text-blue-900"
                      numberOfLines={2}
                      style={{ fontSize: 12 }}
                    >
                      {event.summary}
                    </Text>
                    <Text
                      className="text-xs text-blue-700"
                      style={{ fontSize: 10 }}
                    >
                      {formatEventTime(event)}
                    </Text>
                    {event.location && height > 40 && (
                      <Text
                        className="text-xs text-blue-600"
                        numberOfLines={1}
                        style={{ fontSize: 10 }}
                      >
                        📍 {event.location}
                      </Text>
                    )}
                    {duration > 1 && height > 60 && (
                      <Text
                        className="text-xs text-blue-500 mt-1"
                        style={{ fontSize: 10 }}
                      >
                        Duration: {duration.toFixed(1)}h
                      </Text>
                    )}
                  </View>
                );
              })}

            {/* All-day events at the top */}
            <View className="absolute top-0 left-0 right-0 z-20">
              {calendarEvents
                .filter((event) => !event.start.dateTime && event.start.date)
                .map((event, idx) => (
                  <View
                    key={event.id}
                    className="mx-3 mb-2 p-2 bg-green-100 rounded-lg"
                    style={{
                      marginLeft: 16 + 64 + 12,
                      marginTop: idx * 35,
                    }}
                  >
                    <Text
                      className="text-sm font-semibold text-green-900"
                      numberOfLines={1}
                    >
                      {event.summary}
                    </Text>
                    <Text className="text-xs text-green-700">All Day</Text>
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
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-1 p-4">
        <Text className="text-3xl font-semibold text-gray-900 mb-6 text-center">
          Calendar
        </Text>

        {renderViewToggle()}

        {loading && (
          <View className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-4 shadow-lg">
            <Text className="text-gray-600">Loading calendar events...</Text>
          </View>
        )}

        {renderCurrentView()}

        {/* Calendar Access Status */}
        {!hasCalendarAccess && (
          <View className="mt-4 bg-yellow-100 rounded-xl p-4">
            <Text className="text-yellow-800 font-semibold mb-2">
              Calendar Access Required
            </Text>
            <Text className="text-yellow-700 text-sm mb-3">
              Sign in with Google to view your calendar events in this app.
            </Text>
            <TouchableOpacity
              onPress={checkCalendarAccess}
              className="bg-yellow-600 rounded-lg py-2 px-4"
            >
              <Text className="text-white font-semibold text-center">
                Check Access
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {selectedDate && currentView !== "day" && (
          <View className="mt-6 bg-white rounded-xl p-4 shadow-sm">
            <Text className="text-lg font-semibold text-gray-900 mb-2">
              Selected Date
            </Text>
            <Text className="text-gray-600">
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
