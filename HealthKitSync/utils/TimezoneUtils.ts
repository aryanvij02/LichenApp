import * as Localization from 'expo-localization';

export interface TimezoneInfo {
  timeZone: string;
  offsetMinutes: number;
  offsetHours: number;
  offsetString: string;
  abbreviation: string;
  localTime: string;
  utcTime: string;
}

export interface UserLocaleInfo {
  timezone: TimezoneInfo;
  locale: {
    languageTag: string;
    languageCode: string | null;
    regionCode: string | null;
    textDirection: string | null;
    digitGroupingSeparator: string | null;
    decimalSeparator: string | null;
  };
  calendar: {
    identifier: string | null;
    firstWeekday: number | null;
    uses24HourClock: boolean | null;
    timeZone: string | null;
  };
}

/**
 * Get comprehensive user timezone and locale information
 */
export const getUserLocaleInfo = (): UserLocaleInfo => {
  const now = new Date();
  const locales = Localization.getLocales();
  const calendars = Localization.getCalendars();
  
  const timezone = locales[0]?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const primaryLocale = locales[0] || {
    languageTag: 'en-US',
    languageCode: 'en',
    regionCode: 'US',
    textDirection: 'ltr',
    digitGroupingSeparator: ',',
    decimalSeparator: '.'
  };
  const primaryCalendar = calendars[0] || {
    identifier: 'gregorian',
    firstWeekday: 1,
    uses24HourClock: false,
    timeZone: timezone
  };
  
  // Calculate timezone info
  const offsetMinutes = now.getTimezoneOffset();
  const offsetHours = -offsetMinutes / 60;
  const offsetString = `UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}`;
  
  // Get timezone abbreviation
  const tzAbbr = now.toLocaleString('en-US', { 
    timeZoneName: 'short' 
  }).split(', ')[1] || 'Unknown';

  // Format times
  const localTime = now.toLocaleString(primaryLocale.languageTag, {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });

  const utcTime = now.toISOString();

  return {
    timezone: {
      timeZone: timezone,
      offsetMinutes,
      offsetHours,
      offsetString,
      abbreviation: tzAbbr,
      localTime,
      utcTime
    },
    locale: {
      languageTag: primaryLocale.languageTag,
      languageCode: primaryLocale.languageCode,
      regionCode: primaryLocale.regionCode,
      textDirection: primaryLocale.textDirection,
      digitGroupingSeparator: primaryLocale.digitGroupingSeparator,
      decimalSeparator: primaryLocale.decimalSeparator
    },
    calendar: {
      identifier: primaryCalendar?.identifier || null,
      firstWeekday: primaryCalendar?.firstWeekday || null,
      uses24HourClock: primaryCalendar?.uses24HourClock || null,
      timeZone: primaryCalendar?.timeZone || null
    }
  };
};

/**
 * Convert UTC timestamp to local time string
 */
export const convertUTCToLocal = (utcTimestamp: string, userTimezone?: string): string => {
  try {
    const date = new Date(utcTimestamp);
    const timezone = userTimezone || Localization.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const primaryLocale = Localization.locales?.[0] || { languageTag: 'en-US' };
    
    return date.toLocaleString(primaryLocale.languageTag, {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  } catch (error) {
    console.error('Error converting UTC to local:', error);
    return utcTimestamp; // Return original if conversion fails
  }
};

/**
 * Convert UTC timestamp to local time object with more detail
 */
export const convertUTCToLocalDetailed = (utcTimestamp: string, userTimezone?: string) => {
  try {
    const date = new Date(utcTimestamp);
    const timezone = userTimezone || Localization.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const primaryLocale = Localization.locales?.[0] || { languageTag: 'en-US' };
    
    return {
      original: utcTimestamp,
      localDateTime: date.toLocaleString(primaryLocale.languageTag, {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      localDate: date.toLocaleDateString(primaryLocale.languageTag, {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      localTime: date.toLocaleTimeString(primaryLocale.languageTag, {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      timeOfDay: getTimeOfDay(date, timezone),
      dayOfWeek: date.toLocaleDateString(primaryLocale.languageTag, {
        timeZone: timezone,
        weekday: 'long'
      }),
      timezone: timezone
    };
  } catch (error) {
    console.error('Error converting UTC to local detailed:', error);
    return null;
  }
};

/**
 * Get time of day category (useful for health data analysis)
 */
export const getTimeOfDay = (date: Date, timezone?: string): 'early-morning' | 'morning' | 'afternoon' | 'evening' | 'night' => {
  const tz = timezone || Localization.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hour = parseInt(date.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit'
  }));

  if (hour >= 4 && hour < 7) return 'early-morning';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
};

/**
 * Check if timestamp is today in user's timezone
 */
export const isToday = (utcTimestamp: string, userTimezone?: string): boolean => {
  try {
    const date = new Date(utcTimestamp);
    const now = new Date();
    const timezone = userTimezone || Localization.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    const dateString = date.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD format
    const todayString = now.toLocaleDateString('en-CA', { timeZone: timezone });
    
    return dateString === todayString;
  } catch (error) {
    return false;
  }
};

/**
 * Get user-friendly display for HealthKit timestamps
 */
export const formatHealthKitTimestamp = (utcTimestamp: string, userTimezone?: string): string => {
  const detailed = convertUTCToLocalDetailed(utcTimestamp, userTimezone);
  if (!detailed) return utcTimestamp;
  
  const isRecent = isToday(utcTimestamp, userTimezone);
  
  if (isRecent) {
    return `Today at ${detailed.localTime}`;
  } else {
    return `${detailed.localDate} at ${detailed.localTime}`;
  }
};

/**
 * Prepare timezone info for database storage
 */
export const getTimezoneForStorage = () => {
  const info = getUserLocaleInfo();
  return {
    timezone: info.timezone.timeZone,
    offset_hours: info.timezone.offsetHours,
    offset_minutes: info.timezone.offsetMinutes,
    abbreviation: info.timezone.abbreviation,
    locale: info.locale.languageTag,
    region: info.locale.regionCode,
    recorded_at: new Date().toISOString()
  };
};
