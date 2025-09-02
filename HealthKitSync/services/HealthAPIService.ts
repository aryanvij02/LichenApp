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

export interface StressMetrics {
  current: number;
  highest: number;
  lowest: number;
  average: number;
  lastUpdated: Date;
  user_id: string;
  local_date: string;
}

export interface UpcomingActivity {
  id: string;
  type: string;
  title: string;
  time?: string;
  description?: string;
  user_id: string;
}

export interface DailySummary {
  score: number;
  date: string;
  insights: string[];
  user_id: string;
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
  stress_metrics: StressMetrics[];
  upcoming_activities: UpcomingActivity[];
  daily_summary: DailySummary[];
}

// Import and type the dummy data
const dummyData: DummyData = require('../assets/data/dummy-health-data.json');

export class HealthAPIService {
  private static readonly API_BACKEND_URL = Constants.expoConfig?.extra?.apiBackendUrl || 'http://35.92.117.44';
  private static readonly USE_DUMMY_DATA = false; // Set to false when you want to use real API

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
      if (value) { // Only add non-empty values
        url.searchParams.append(key, value);
      }
    });

    console.log(`🌐 Making API request to: ${url.toString()}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`📡 API Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API request failed: ${response.status} - ${errorText}`);
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ API Response data:`, data);
      return data;
    } catch (error) {
      console.error(`❌ API request error:`, error);
      throw error;
    }
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

  // Test HTTP vs HTTPS connectivity
  static async testNetworkConnectivity(): Promise<void> {
    console.log(`🔍 Testing network connectivity...`);
    
    // Test HTTPS with httpbin.org
    try {
      console.log(`🌐 Testing HTTPS with httpbin.org...`);
      const httpsResponse = await fetch('https://httpbin.org/get');
      const httpsData = await httpsResponse.json();
      console.log(`✅ HTTPS test successful:`, httpsData);
    } catch (httpsError) {
      console.error(`❌ HTTPS test failed:`, httpsError);
    }

    // Test HTTP with httpbin.org  
    try { 
      console.log(`🌐 Testing HTTP with httpbin.org...`);
      const httpResponse = await fetch('http://httpbin.org/get');
      const httpData = await httpResponse.json();
      console.log(`✅ HTTP test successful:`, httpData);
    } catch (httpError) {
      console.error(`❌ HTTP test failed:`, httpError);
    }

    // Test your backend
    try {
      console.log(`🌐 Testing your backend: ${this.API_BACKEND_URL}`);
      const backendResponse = await fetch(`${this.API_BACKEND_URL}/health`);
      const backendData = await backendResponse.json();
      console.log(`✅ Backend test successful:`, backendData);
    } catch (backendError) {
      console.error(`❌ Backend test failed:`, backendError);
    }
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

  static async getStressMetrics(localDate: string, userId: string): Promise<StressMetrics> {
    await this.simulateDelay();
    
    if (this.USE_DUMMY_DATA) {
      const filtered = this.filterByUserAndDate(dummyData.stress_metrics, userId, localDate);
      const result = filtered.length > 0 ? filtered[0] : {
        user_id: userId,
        local_date: localDate,
        current: Math.floor(Math.random() * 100),
        highest: Math.floor(60 + Math.random() * 40),
        lowest: Math.floor(Math.random() * 30),
        average: Math.floor(30 + Math.random() * 40),
        lastUpdated: new Date()
      };
      console.log(`📊 Dummy Stress Metrics for ${localDate}:`, result);
      return result;
    }
    
    const current = Math.floor(Math.random() * 100);
    return {
      user_id: userId,
      local_date: localDate,
      current,
      highest: Math.floor(60 + Math.random() * 40),
      lowest: Math.floor(Math.random() * 30),
      average: Math.floor(30 + Math.random() * 40),
      lastUpdated: new Date()
    };
  }

  static async getUpcomingActivities(userId: string): Promise<UpcomingActivity[]> {
    await this.simulateDelay();
    
    if (this.USE_DUMMY_DATA) {
      const filtered = this.filterByUser(dummyData.upcoming_activities, userId);
      console.log(`📅 Dummy Upcoming Activities:`, filtered);
      return filtered;
    }
    
    return [
      {
        id: '1',
        type: 'medical',
        title: 'Patient checkup',
        time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
        description: 'Routine health assessment',
        user_id: userId
      }
    ];
  }

  static async getDailySummary(localDate: string, userId: string): Promise<DailySummary> {
    await this.simulateDelay();
    
    if (this.USE_DUMMY_DATA) {
      const filtered = this.filterByUser(dummyData.daily_summary, userId);
      const result = filtered.find(item => item.date === localDate) || {
        score: Math.floor(60 + Math.random() * 40),
        date: localDate,
        insights: ['Good sleep quality', 'Active day', 'Low stress levels'],
        user_id: userId
      };
      console.log(`📈 Dummy Daily Summary for ${localDate}:`, result);
      return result;
    }
    
    return {
      score: Math.floor(60 + Math.random() * 40),
      date: localDate,
      insights: ['Good sleep quality', 'Active day', 'Low stress levels'],
      user_id: userId
    };
  }
}