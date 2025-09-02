import { useQuery } from '@tanstack/react-query';
import { HealthAPIService } from '../services/HealthAPIService';
import { queryKeys } from './queryKeys';

/**
 * Custom hook for fetching resting heart rate data
 */
export const useRestingHeartRate = (
  startDate: string,
  endDate: string,
  userId: string,
  enabled = true
) => {
  return useQuery({
    queryKey: queryKeys.health.restingHeartRate(userId, startDate, endDate),
    queryFn: () => HealthAPIService.getRestingHeartRate(startDate, endDate, userId),
    enabled: enabled && !!userId && !!startDate,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: (failureCount, error) => {
      // Don't retry if it's a 4xx error (client error)
      if (error instanceof Error && error.message.includes('4')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};

/**
 * Custom hook for fetching sleep stages data
 */
export const useSleepStages = (
  localDate: string,
  userId: string,
  enabled = true
) => {
  return useQuery({
    queryKey: queryKeys.health.sleepStages(userId, localDate),
    queryFn: () => HealthAPIService.getSleepStages(localDate, userId),
    enabled: enabled && !!userId && !!localDate,
    staleTime: 10 * 60 * 1000, // 10 minutes (sleep data changes less frequently)
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('4')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};

/**
 * Custom hook for fetching sleep summary data
 */
export const useSleepSummary = (
  localDate: string,
  userId: string,
  enabled = true
) => {
  return useQuery({
    queryKey: queryKeys.health.sleepSummary(userId, localDate),
    queryFn: () => HealthAPIService.getSleepSummary(localDate, userId),
    enabled: enabled && !!userId && !!localDate,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('4')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};

/**
 * Custom hook for fetching steps data
 */
export const useStepsData = (
  localDate: string,
  userId: string,
  enabled = true
) => {
  return useQuery({
    queryKey: queryKeys.health.steps(userId, localDate),
    queryFn: () => HealthAPIService.getStepsData(localDate, userId),
    enabled: enabled && !!userId && !!localDate,
    staleTime: 2 * 60 * 1000, // 2 minutes (steps update frequently)
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('4')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};

/**
 * Custom hook for fetching heart rate data
 */
export const useHeartRateData = (
  startTime: string,
  endTime: string,
  userId: string,
  enabled = true
) => {
  return useQuery({
    queryKey: queryKeys.health.heartRate(userId, startTime, endTime),
    queryFn: () => HealthAPIService.getHeartRateData(startTime, endTime, userId),
    enabled: enabled && !!userId && !!startTime && !!endTime,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('4')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};

/**
 * Custom hook for testing network connectivity
 */
export const useNetworkTest = (enabled = false) => {
  return useQuery({
    queryKey: queryKeys.networkTest,
    queryFn: () => HealthAPIService.testNetworkConnectivity(),
    enabled,
    staleTime: 0, // Always consider stale for testing
    gcTime: 0, // Don't cache test results
    retry: false, // Don't retry network tests
  });
};
