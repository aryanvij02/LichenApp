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
    // Subscribe to streaming heart rate data
    HealthKitBridge.onDataStream((event) => {
      if (event.type === 'HKQuantityTypeIdentifierHeartRate' && event.samples.length > 0) {
        // Get the most recent sample
        const latestSample = event.samples[event.samples.length - 1];
        
        this.latestHeartRate = {
          heartRate: Math.round(latestSample.value ?? 0),
          timestamp: latestSample.startDate,
          source: latestSample.sourceName
        };

        // Notify all subscribers
        this.subscribers.forEach(callback => callback(this.latestHeartRate));
      }
    });
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
    if (this.latestHeartRate) {
      return this.latestHeartRate;
    }

    try {
      // Query the most recent heart rate reading
      const result = await HealthKitBridge.queryRecentDataSafe(
        ['HKQuantityTypeIdentifierHeartRate'], 
        1 // Last 1 hour
      );
      
      const heartRateData = result['HKQuantityTypeIdentifierHeartRate'];
      if (heartRateData && heartRateData.length > 0) {
        const latest = heartRateData[0]; // Most recent
        
        return {
          heartRate: Math.round(latest.value ?? 0),
          timestamp: latest.startDate,
          source: latest.sourceName
        };
      }
    } catch (error) {
      console.error('Error getting recent heart rate:', error);
    }

    return null;
  }
}