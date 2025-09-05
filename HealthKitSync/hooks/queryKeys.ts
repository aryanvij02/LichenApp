/**
 * Centralized query keys for TanStack Query
 * This ensures consistency and prevents typos in query keys across the app
 */

export const queryKeys = {
  // Health data queries
  health: {
    // Resting Heart Rate queries
    restingHeartRate: (userId: string, startDate: string, endDate?: string) => [
      'restingHeartRate',
      userId,
      startDate,
      endDate || startDate,
    ] as const,

    // Sleep queries
    sleepStages: (userId: string, date: string) => [
      'sleepStages',
      userId,
      date,
    ] as const,

    sleepSummary: (userId: string, date: string) => [
      'sleepSummary',
      userId,
      date,
    ] as const,

    // Steps queries
    steps: (userId: string, date: string) => [
      'steps',
      userId,
      date,
    ] as const,

    stepsRange: (userId: string, startDate: string, endDate: string) => [
      'stepsRange',
      userId,
      startDate,
      endDate,
    ] as const,

    // Heart Rate queries
    heartRate: (userId: string, startTime: string, endTime: string) => [
      'heartRate',
      userId,
      startTime,
      endTime,
    ] as const,

    heartRateAverage: (userId: string, startTime: string, endTime: string) => [
      'heartRateAverage',
      userId,
      startTime,
      endTime,
    ] as const,
  },

  // Network connectivity test
  networkTest: ['networkConnectivity'] as const,
} as const;

// Helper function to invalidate all health data for a user
export const getHealthDataKeys = (userId: string) => [
  ['restingHeartRate', userId],
  ['sleepStages', userId],
  ['sleepSummary', userId],
  ['steps', userId],
  ['stepsRange', userId],
  ['heartRate', userId],
  ['heartRateAverage', userId],
] as const;
