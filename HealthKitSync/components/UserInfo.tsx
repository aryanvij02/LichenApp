import React from "react";
import { View, Text, StyleSheet } from "react-native";
import * as Localization from "expo-localization";

interface UserInfoProps {
  style?: any;
}

export const UserInfo: React.FC<UserInfoProps> = ({ style }) => {
  // Get all localization data with fallbacks
  const locales = Localization.getLocales();
  const calendars = Localization.getCalendars();

  const timezone =
    (locales[0] as any)?.timeZone ||
    calendars[0]?.timeZone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = locales[0] || {
    languageTag: "en-US",
    languageCode: "en",
    regionCode: "US",
    textDirection: "ltr",
    digitGroupingSeparator: ",",
    decimalSeparator: ".",
  };
  const calendar = calendars[0] || {
    identifier: "gregorian",
    firstWeekday: 1,
    uses24HourClock: false,
    timeZone: timezone,
  };

  // Calculate timezone offset
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  const offsetHours = -offsetMinutes / 60;
  const offsetString = `UTC${offsetHours >= 0 ? "+" : ""}${offsetHours}`;

  // Get timezone abbreviation
  const tzAbbr =
    now
      .toLocaleString("en-US", {
        timeZoneName: "short",
      })
      .split(", ")[1] || "Unknown";

  // Current local time
  const localTime = now.toLocaleString(locale.languageTag || "en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>User Information</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌍 Location & Time</Text>
        <Text style={styles.infoText}>Timezone: {timezone}</Text>
        <Text style={styles.infoText}>
          Offset: {offsetString} ({tzAbbr})
        </Text>
        <Text style={styles.infoText}>Local Time: {localTime}</Text>
        {locale.regionCode && (
          <Text style={styles.infoText}>Region: {locale.regionCode}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌐 Locale Settings</Text>
        <Text style={styles.infoText}>Language: {locale.languageTag}</Text>
        <Text style={styles.infoText}>
          Language Code: {locale.languageCode}
        </Text>
        {locale.textDirection && (
          <Text style={styles.infoText}>
            Text Direction: {locale.textDirection}
          </Text>
        )}
        {locale.digitGroupingSeparator && (
          <Text style={styles.infoText}>
            Number Format: 1{locale.digitGroupingSeparator}000
          </Text>
        )}
        {locale.decimalSeparator && (
          <Text style={styles.infoText}>
            Decimal: 1{locale.decimalSeparator}5
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📅 Calendar</Text>
        <Text style={styles.infoText}>
          Calendar: {(calendar as any)?.identifier || "Default"}
        </Text>
        <Text style={styles.infoText}>
          First Day:{" "}
          {calendar?.firstWeekday
            ? getDayName(calendar.firstWeekday)
            : "Sunday"}
        </Text>
        {calendar?.timeZone && (
          <Text style={styles.infoText}>Calendar TZ: {calendar.timeZone}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔧 For Development</Text>
        <Text style={styles.devText}>Offset Minutes: {offsetMinutes}</Text>
        <Text style={styles.devText}>
          Is24Hour: {(calendar as any)?.uses24hourClock ? "Yes" : "No"}
        </Text>
        <Text style={styles.devText}>
          Is RLT: {locale.textDirection === "rtl" ? "Yes" : "No"}
        </Text>
      </View>
    </View>
  );
};

// Helper function to get day name from week day number
const getDayName = (dayNumber: number): string => {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[dayNumber - 1] || "Unknown";
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "white",
    borderRadius: 12, // rounded-xl
    padding: 16, // p-4
    marginBottom: 12, // mb-3
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
  title: {
    fontSize: 18, // text-lg
    fontWeight: "bold",
    color: "#1f2937", // text-gray-800
    marginBottom: 16, // mb-4
    textAlign: "center",
  },
  section: {
    marginBottom: 12, // mb-3
    paddingBottom: 8, // pb-2
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6", // border-gray-100
  },
  sectionTitle: {
    fontSize: 14, // text-sm
    fontWeight: "bold",
    color: "#4b5563", // text-gray-600
    marginBottom: 8, // mb-2
  },
  infoText: {
    fontSize: 12, // text-xs
    color: "#1f2937", // text-gray-800
    marginBottom: 4, // mb-1
    paddingLeft: 8, // pl-2
  },
  devText: {
    fontSize: 12, // text-xs
    color: "#6b7280", // text-gray-500
    marginBottom: 4, // mb-1
    paddingLeft: 8, // pl-2
    fontFamily: "monospace", // font-mono
  },
});
