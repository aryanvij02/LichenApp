import { getTimezoneForStorage, getUserLocaleInfo } from './TimezoneUtils';

/**
 * Example structure for storing user timezone data in your database
 * This can be used as a reference when you implement your backend storage
 */

export interface UserTimezoneRecord {
  user_id: string;
  timezone: string;
  offset_hours: number;
  offset_minutes: number;
  abbreviation: string;
  locale: string;
  region: string | null;
  recorded_at: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Prepare user timezone data for API upload/storage
 * This formats the data in a way that's ready to send to your backend
 */
export const prepareUserTimezoneForAPI = (userId: string): UserTimezoneRecord => {
  const timezoneData = getTimezoneForStorage();
  
  return {
    user_id: userId,
    timezone: timezoneData.timezone,
    offset_hours: timezoneData.offset_hours,
    offset_minutes: timezoneData.offset_minutes,
    abbreviation: timezoneData.abbreviation,
    locale: timezoneData.locale,
    region: timezoneData.region,
    recorded_at: timezoneData.recorded_at
  };
};

/**
 * Enhanced HealthKit sample with timezone context
 * This shows how you can augment your HealthKit samples with timezone info
 */
export interface HealthSampleWithTimezone {
  // Original HealthKit fields
  startDate: string;
  endDate: string;
  type: string;
  sourceName: string;
  uuid: string;
  value?: number;
  unit?: string;
  metadata?: any;
  
  // Added timezone context
  timezone_context?: {
    user_timezone: string;
    offset_hours: number;
    local_start_date: string;
    local_end_date: string;
    time_of_day: 'early-morning' | 'morning' | 'afternoon' | 'evening' | 'night';
    is_today: boolean;
  };
}

/**
 * Add timezone context to HealthKit samples before uploading
 */
export const addTimezoneContextToSample = (sample: any): HealthSampleWithTimezone => {
  const userInfo = getUserLocaleInfo();
  
  // Import the utility functions (you might need to adjust imports)
  const { convertUTCToLocalDetailed, getTimeOfDay, isToday } = require('./TimezoneUtils');
  
  const localStartDetails = convertUTCToLocalDetailed(sample.startDate, userInfo.timezone.timeZone);
  const localEndDetails = convertUTCToLocalDetailed(sample.endDate, userInfo.timezone.timeZone);
  
  return {
    ...sample,
    timezone_context: {
      user_timezone: userInfo.timezone.timeZone,
      offset_hours: userInfo.timezone.offsetHours,
      local_start_date: localStartDetails?.localDateTime || sample.startDate,
      local_end_date: localEndDetails?.localDateTime || sample.endDate,
      time_of_day: getTimeOfDay(new Date(sample.startDate), userInfo.timezone.timeZone),
      is_today: isToday(sample.startDate, userInfo.timezone.timeZone)
    }
  };
};

/**
 * Example of how to upload user timezone data to your backend
 * You would replace this with your actual API call
 */
export const uploadUserTimezoneData = async (userId: string, apiUrl: string): Promise<boolean> => {
  try {
    const timezoneData = prepareUserTimezoneForAPI(userId);
    
    console.log('📍 Uploading user timezone data:', timezoneData);
    
    // Example API call - replace with your actual endpoint
    const response = await fetch(`${apiUrl}/user-timezone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(timezoneData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    console.log('✅ User timezone uploaded successfully:', result);
    return true;
    
  } catch (error) {
    console.error('❌ Failed to upload user timezone:', error);
    return false;
  }
};

/**
 * Example SQL schema for storing this data (PostgreSQL)
 * You can use this as a reference when creating your database tables
 */
export const EXAMPLE_SQL_SCHEMA = `
-- Table for storing user timezone information
CREATE TABLE user_timezones (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    timezone VARCHAR(100) NOT NULL,
    offset_hours INTEGER NOT NULL,
    offset_minutes INTEGER NOT NULL,
    abbreviation VARCHAR(10),
    locale VARCHAR(20),
    region VARCHAR(10),
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for better performance
    INDEX idx_user_timezones_user_id (user_id),
    INDEX idx_user_timezones_recorded_at (recorded_at),
    
    -- Unique constraint to prevent duplicate entries for same user at same time
    UNIQUE KEY unique_user_timezone (user_id, recorded_at)
);

-- Table for enhanced health samples with timezone context
CREATE TABLE health_samples_with_timezone (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    
    -- Original HealthKit fields
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    type VARCHAR(100) NOT NULL,
    source_name VARCHAR(255),
    uuid VARCHAR(255) NOT NULL,
    value DECIMAL(15,6),
    unit VARCHAR(50),
    metadata JSONB,
    
    -- Timezone context
    user_timezone VARCHAR(100),
    offset_hours INTEGER,
    local_start_date TIMESTAMP WITHOUT TIME ZONE,
    local_end_date TIMESTAMP WITHOUT TIME ZONE,
    time_of_day VARCHAR(20),
    is_today BOOLEAN,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_health_samples_user_id (user_id),
    INDEX idx_health_samples_type (type),
    INDEX idx_health_samples_start_date (start_date),
    INDEX idx_health_samples_local_start_date (local_start_date),
    INDEX idx_health_samples_time_of_day (time_of_day),
    
    -- Unique constraint on UUID to prevent duplicates
    UNIQUE KEY unique_health_sample (uuid)
);
`;

// Export an example of how to use this in your existing uploader
export const USAGE_EXAMPLE = `
// In your HealthDataUploader.ts, you could enhance samples like this:

import { addTimezoneContextToSample, uploadUserTimezoneData } from './utils/DatabaseHelpers';

// When uploading samples, add timezone context
const enhancedSamples = samples.map(addTimezoneContextToSample);

// Also upload user timezone data periodically
await uploadUserTimezoneData(this.config.userId, this.config.apiUrl);
`
