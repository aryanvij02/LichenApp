//Pulls live data from HealthKit for our application
//Any data that needs to be pulled locally from HealthKit should be done here. 
import HealthKitBridge from '../modules/expo-healthkit-bridge/src/index';

export interface LiveHeartRateData {
  heartRate: number;
  timestamp: string;
  source: string;
}

export class HealthKitService {
  private static latestHeartRate: LiveHeartRateData | null = null;
  private static subscribers: ((data: LiveHeartRateData | null) => void)[] = [];

  static initialize() {
    console.log('🔍 HealthKitService: Initializing...');
    
    // Subscribe to streaming heart rate data
    const subscription = HealthKitBridge.onDataStream((event) => {
      console.log('📡 HealthKitService: Received data stream event:', event);
      
      if (event.type === 'HKQuantityTypeIdentifierHeartRate' && event.samples.length > 0) {
        // Get the most recent sample
        const latestSample = event.samples[event.samples.length - 1];
        
        this.latestHeartRate = {
          heartRate: Math.round(latestSample.value ?? 0),
          timestamp: latestSample.startDate,
          source: latestSample.sourceName || 'Unknown'
        };

        console.log('💓 HealthKitService: Updated latest heart rate:', this.latestHeartRate);

        // Notify all subscribers
        this.subscribers.forEach(callback => callback(this.latestHeartRate));
      }
    });
    
    console.log('✅ HealthKitService: Initialized with data stream subscription');
  }

  static subscribeToLiveHeartRate(callback: (data: LiveHeartRateData | null) => void) {
    this.subscribers.push(callback);
    
    // Immediately call with current data
    callback(this.latestHeartRate);

    // Return unsubscribe function
    return () => {
      this.subscribers = this.subscribers.filter(sub => sub !== callback);
    };
  }

  static async getRecentHeartRate(): Promise<LiveHeartRateData | null> {
    console.log('🔍 HealthKitService: getRecentHeartRate called');
    
    if (this.latestHeartRate) {
      console.log('✅ HealthKitService: Returning cached heart rate:', this.latestHeartRate);
      return this.latestHeartRate;
    }

    try {
      console.log('📡 HealthKitService: Querying recent heart rate data...');
      
      // Query the most recent heart rate reading (last 24 hours)
      const result = await HealthKitBridge.queryRecentDataSafe(
        ['HKQuantityTypeIdentifierHeartRate'], 
        24 // Last 24 hours (increased from 1 hour)
      );
      
      console.log('📊 HealthKitService: Query result:', result);
      
      const heartRateData = result['HKQuantityTypeIdentifierHeartRate'];
      if (heartRateData && heartRateData.length > 0) {
        const latest = heartRateData[0]; // Most recent
        
        const recentHeartRate = {
          heartRate: Math.round(latest.value ?? 0),
          timestamp: latest.startDate,
          source: latest.sourceName || 'HealthKit'
        };
        
        // Cache the result
        this.latestHeartRate = recentHeartRate;
        
        console.log('✅ HealthKitService: Found recent heart rate:', recentHeartRate);
        return recentHeartRate;
      } else {
        console.log('⚠️ HealthKitService: No heart rate data found in last 24 hours');
      }
    } catch (error) {
      console.error('❌ HealthKitService: Error getting recent heart rate:', error);
    }

    return null;
  }
}