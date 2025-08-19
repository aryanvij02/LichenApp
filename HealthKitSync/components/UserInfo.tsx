import React from "react";
import { View, Text } from "react-native";
import * as Localization from "expo-localization";

interface UserInfoProps {
  style?: any;
}

export const UserInfo: React.FC<UserInfoProps> = ({ style }) => {
  // Get all localization data with fallbacks
  const locales = Localization.getLocales();
  const calendars = Localization.getCalendars();

  const timezone =
    locales[0]?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
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
    <View className="bg-white rounded-xl p-4 mb-3 shadow-lg" style={style}>
      <Text className="text-lg font-bold text-gray-800 mb-4 text-center">
        User Information
      </Text>

      <View className="mb-3 pb-2 border-b border-gray-100">
        <Text className="text-sm font-bold text-gray-600 mb-2">
          🌍 Location & Time
        </Text>
        <Text className="text-xs text-gray-800 mb-1 pl-2">
          Timezone: {timezone}
        </Text>
        <Text className="text-xs text-gray-800 mb-1 pl-2">
          Offset: {offsetString} ({tzAbbr})
        </Text>
        <Text className="text-xs text-gray-800 mb-1 pl-2">
          Local Time: {localTime}
        </Text>
        {locale.regionCode && (
          <Text className="text-xs text-gray-800 mb-1 pl-2">
            Region: {locale.regionCode}
          </Text>
        )}
      </View>

      <View className="mb-3 pb-2 border-b border-gray-100">
        <Text className="text-sm font-bold text-gray-600 mb-2">
          🌐 Locale Settings
        </Text>
        <Text className="text-xs text-gray-800 mb-1 pl-2">
          Language: {locale.languageTag}
        </Text>
        <Text className="text-xs text-gray-800 mb-1 pl-2">
          Language Code: {locale.languageCode}
        </Text>
        {locale.textDirection && (
          <Text className="text-xs text-gray-800 mb-1 pl-2">
            Text Direction: {locale.textDirection}
          </Text>
        )}
        {locale.digitGroupingSeparator && (
          <Text className="text-xs text-gray-800 mb-1 pl-2">
            Number Format: 1{locale.digitGroupingSeparator}000
          </Text>
        )}
        {locale.decimalSeparator && (
          <Text className="text-xs text-gray-800 mb-1 pl-2">
            Decimal: 1{locale.decimalSeparator}5
          </Text>
        )}
      </View>

      <View className="mb-3 pb-2 border-b border-gray-100">
        <Text className="text-sm font-bold text-gray-600 mb-2">
          📅 Calendar
        </Text>
        <Text className="text-xs text-gray-800 mb-1 pl-2">
          Calendar: {calendar?.identifier || "Default"}
        </Text>
        <Text className="text-xs text-gray-800 mb-1 pl-2">
          First Day:{" "}
          {calendar?.firstWeekday
            ? getDayName(calendar.firstWeekday)
            : "Sunday"}
        </Text>
        {calendar?.timeZone && (
          <Text className="text-xs text-gray-800 mb-1 pl-2">
            Calendar TZ: {calendar.timeZone}
          </Text>
        )}
      </View>

      <View className="mb-3 pb-2 border-b border-gray-100">
        <Text className="text-sm font-bold text-gray-600 mb-2">
          🔧 For Development
        </Text>
        <Text className="text-xs text-gray-500 mb-1 pl-2 font-mono">
          Offset Minutes: {offsetMinutes}
        </Text>
        <Text className="text-xs text-gray-500 mb-1 pl-2 font-mono">
          Is24Hour: {calendar?.uses24HourClock ? "Yes" : "No"}
        </Text>
        <Text className="text-xs text-gray-500 mb-1 pl-2 font-mono">
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
