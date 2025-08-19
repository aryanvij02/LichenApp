import Constants from 'expo-constants';

export interface HeartRateReading {
  user_id: string;
  reading_uuid: string;
  timestamp: string;
  heart_rate: number;
  unit: string;
  source_name: string;
  upload_timestamp: string;
  created_at: string;
}

export interface HeartRateAverage {
  user_id: string;
  start_time: string;
  end_time: string;
  average_heart_rate: number;
  total_readings: number;
  min_heart_rate: number;
  max_heart_rate: number;
}

export interface RestingHeartRate {
  user_id: string;
  reading_uuid: string;
  timestamp: string;
  local_date: string;
  resting_heart_rate: number;
  unit: string;
  source_name: string;
  upload_timestamp: string;
  created_at: string;
}

export interface StepsData {
  user_id: string;
  local_date: string;
  total_steps: number;
  source_name: string;
  upload_timestamp: string;
  created_at: string;
}

export interface SleepStage {
  user_id: string;
  stage_uuid: string;
  start_time: string;
  end_time: string;
  sleep_stage: 'CORE' | 'DEEP' | 'REM' | 'AWAKE';
  hk_value: number;
  source_name: string;
  upload_timestamp: string;
  created_at: string;
}

export interface SleepSummary {
  user_id: string;
  local_date: string;
  total_sleep_duration: number;
  sleep_stages_breakdown: {
    [key: string]: number;
  };
  sleep_efficiency: number;
  sleep_start_time: string;
  sleep_end_time: string;
  total_stages_count: number;
}

interface HRVData {
  user_id: string;
  local_date: string;
  hrv_value: number;
  unit: string;
  source_name: string;
}

interface BodyBatteryData {
  user_id: string;
  local_date: string;
  body_battery: number;
  level: 'low' | 'fair' | 'good' | 'excellent';
}

interface StressData {
  user_id: string;
  local_date: string;
  stress_level: number;
  level: 'low' | 'moderate' | 'high';
}

// Type the dummy data properly
interface DummyData {
  steps: StepsData[];
  heart_rate: HeartRateReading[];
  heart_rate_average: HeartRateAverage;
  resting_heart_rate: RestingHeartRate[];
  sleep_stages: SleepStage[];
  sleep_summary: SleepSummary;
  hrv: HRVData[];
  body_battery: BodyBatteryData[];
  stress: StressData[];
}

// Import and type the dummy data
const dummyData: DummyData = require('../assets/data/dummy-health-data.json');

export class HealthAPIService {
  private static readonly API_BACKEND_URL = Constants.expoConfig?.extra?.apiBackendUrl || 'https://your-backend-url.com';
  private static readonly USE_DUMMY_DATA = true; // Set to false when you want to use real API

  // Helper function to simulate API delay
  private static async simulateDelay(ms: number = 300): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper function to filter data by date (only for data that has local_date)
  private static filterByDate<T extends { local_date: string }>(data: T[], localDate: string): T[] {
    return data.filter(item => item.local_date === localDate);
  }

  // Helper function to filter data by user (only for data that has user_id)
  private static filterByUser<T extends { user_id: string }>(data: T[], userId: string): T[] {
    return data.filter(item => item.user_id === userId);
  }

  // Helper function for filtering data that has both user_id and local_date
  private static filterByUserAndDate<T extends { user_id: string; local_date: string }>(
    data: T[], 
    userId: string, 
    localDate: string
  ): T[] {
    return data.filter(item => item.user_id === userId && item.local_date === localDate);
  }

  // Real API request function (for when USE_DUMMY_DATA is false)
  private static async makeRequest(endpoint: string, params: Record<string, string> = {}) {
    const url = new URL(`${this.API_BACKEND_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.json();
  }

  // Now all methods should work without TypeScript errors
  static async getStepsData(localDate: string, userId: string): Promise<StepsData[]> {
    if (this.USE_DUMMY_DATA) {
      await this.simulateDelay();
      const filtered = this.filterByUserAndDate(dummyData.steps, userId, localDate);
      console.log(`📊 Dummy Steps Data for ${localDate}:`, filtered);
      return filtered;
    }
    return this.makeRequest('/api/v1/steps/', { local_date: localDate, user_id: userId });
  }

  static async getHeartRateData(startTime: string, endTime: string, userId: string): Promise<HeartRateReading[]> {
    if (this.USE_DUMMY_DATA) {
      await this.simulateDelay();
      const filtered = this.filterByUser(dummyData.heart_rate, userId);
      console.log(`💓 Dummy Heart Rate Data:`, filtered);
      return filtered;
    }
    return this.makeRequest('/api/v1/heart-rate/', { 
      start_time: startTime, 
      end_time: endTime, 
      user_id: userId 
    });
  }

  static async getHeartRateAverage(startTime: string, endTime: string, userId: string): Promise<HeartRateAverage> {
    if (this.USE_DUMMY_DATA) {
      await this.simulateDelay();
      console.log(`💓 Dummy Heart Rate Average:`, dummyData.heart_rate_average);
      return dummyData.heart_rate_average;
    }
    return this.makeRequest('/api/v1/heart-rate/average', { 
      start_time: startTime, 
      end_time: endTime, 
      user_id: userId 
    });
  }

  static async getRestingHeartRate(startDate: string, endDate: string, userId: string): Promise<RestingHeartRate[]> {
    if (this.USE_DUMMY_DATA) {
      await this.simulateDelay();
      const userFiltered = this.filterByUser(dummyData.resting_heart_rate, userId);
      const result = userFiltered.filter(item => item.local_date >= startDate && item.local_date <= endDate);
      console.log(`💤 Dummy Resting HR Data for ${startDate}-${endDate}:`, result);
      return result;
    }
    return this.makeRequest('/api/v1/resting-heart-rate/', { 
      start_date: startDate, 
      end_date: endDate, 
      user_id: userId 
    });
  }

  static async getSleepStages(localDate: string, userId: string): Promise<SleepStage[]> {
    if (this.USE_DUMMY_DATA) {
      await this.simulateDelay();
      const filtered = this.filterByUser(dummyData.sleep_stages, userId);
      console.log(`😴 Dummy Sleep Stages Data for ${localDate}:`, filtered);
      return filtered;
    }
    return this.makeRequest('/api/v1/sleep/', { local_date: localDate, user_id: userId });
  }

  static async getSleepSummary(localDate: string, userId: string): Promise<SleepSummary> {
    if (this.USE_DUMMY_DATA) {
      await this.simulateDelay();
      console.log(`😴 Dummy Sleep Summary for ${localDate}:`, dummyData.sleep_summary);
      return dummyData.sleep_summary;
    }
    return this.makeRequest('/api/v1/sleep/summary', { local_date: localDate, user_id: userId });
  }

  // Rest of the methods remain the same...
  static async getHRVData(localDate: string, userId: string): Promise<HRVData> {
    await this.simulateDelay();
    
    if (this.USE_DUMMY_DATA) {
      const filtered = this.filterByUserAndDate(dummyData.hrv, userId, localDate);
      const result = filtered.length > 0 ? filtered[0] : {
        user_id: userId,
        local_date: localDate,
        hrv_value: 35 + Math.random() * 30,
        unit: 'ms',
        source_name: 'iPhone'
      };
      console.log(`📈 Dummy HRV Data for ${localDate}:`, result);
      return result;
    }
    
    return {
      user_id: userId,
      local_date: localDate,
      hrv_value: 35 + Math.random() * 30,
      unit: 'ms',
      source_name: 'iPhone'
    };
  }

  static async getBodyBatteryData(localDate: string, userId: string): Promise<BodyBatteryData> {
    await this.simulateDelay();
    
    if (this.USE_DUMMY_DATA) {
      const filtered = this.filterByUserAndDate(dummyData.body_battery, userId, localDate);
      const result = filtered.length > 0 ? filtered[0] : {
        user_id: userId,
        local_date: localDate,
        body_battery: Math.floor(20 + Math.random() * 80),
        level: 'fair' as const
      };
      console.log(`🔋 Dummy Body Battery Data for ${localDate}:`, result);
      return result;
    }
    
    const battery = Math.floor(20 + Math.random() * 80);
    let level: 'low' | 'fair' | 'good' | 'excellent';
    if (battery < 40) level = 'low';
    else if (battery < 60) level = 'fair'; 
    else if (battery < 80) level = 'good';
    else level = 'excellent';

    return {
      user_id: userId,
      local_date: localDate,
      body_battery: battery,
      level
    };
  }

  static async getStressData(localDate: string, userId: string): Promise<StressData> {
    await this.simulateDelay();
    
    if (this.USE_DUMMY_DATA) {
      const filtered = this.filterByUserAndDate(dummyData.stress, userId, localDate);
      const result = filtered.length > 0 ? filtered[0] : {
        user_id: userId,
        local_date: localDate,
        stress_level: Math.floor(Math.random() * 100),
        level: 'moderate' as const
      };
      console.log(`😰 Dummy Stress Data for ${localDate}:`, result);
      return result;
    }
    
    const stress = Math.floor(Math.random() * 100);
    let level: 'low' | 'moderate' | 'high';
    if (stress < 30) level = 'low';
    else if (stress < 70) level = 'moderate';
    else level = 'high';

    return {
      user_id: userId,
      local_date: localDate,
      stress_level: stress,
      level
    };
  }
}