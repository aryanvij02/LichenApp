import { requireNativeModule } from 'expo-modules-core';

export interface PermissionResult {
  granted: string[];
  denied: string[];
}

export interface SyncResult {
  added: number;
  deleted: number;
}

export interface SyncStatus {
  lastSyncISO: string | null;
  queuedBatches: number;
  lastError?: string;
}

export interface SyncEvent {
  phase: 'permissions' | 'observer' | 'anchored' | 'upload';
  message: string;
  counts?: {
    added?: number;
    deleted?: number;
  };
}

// Add these new interfaces after your existing ones
export interface HealthSample {
    startDate: string;
    endDate: string;
    type: string;
    sourceName: string;
    uuid: string;
    value?: number;
    unit?: string;
    metadata?: any;
  }
  
  export interface DateRangeResult {
    [typeIdentifier: string]: HealthSample[];
  }
  
  export interface StreamEvent {
    type: string;
    samples: HealthSample[];
    timestamp: string;
  }
  

// Import the native module directly
const ExpoHealthkitBridgeModule = requireNativeModule('ExpoHealthkitBridge');

class ExpoHealthkitBridge {
  async requestPermissions(types: string[]): Promise<PermissionResult> {
    return await ExpoHealthkitBridgeModule.requestPermissions(types);
  }

  async startBackgroundSync(types: string[]): Promise<void> {
    return await ExpoHealthkitBridgeModule.startBackgroundSync(types);
  }

  async stopBackgroundSync(): Promise<void> {
    return await ExpoHealthkitBridgeModule.stopBackgroundSync();
  }

  async syncNow(types?: string[]): Promise<SyncResult> {
    return await ExpoHealthkitBridgeModule.syncNow(types || []);
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return await ExpoHealthkitBridgeModule.getSyncStatus();
  }

 // Updated safer historical query with better date handling
 async queryDataInRange(types: string[], startDateISO: string, endDateISO: string): Promise<DateRangeResult> {
    try {
      // Validate and format dates
      const startDate = new Date(startDateISO);
      const endDate = new Date(endDateISO);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error(`Invalid dates: start=${startDateISO}, end=${endDateISO}`);
      }
      
      // Ensure proper ISO formatting
      const formattedStartDate = this.createISODate(startDate);
      const formattedEndDate = this.createISODate(endDate);
      
      console.log(`📅 Querying from ${formattedStartDate} to ${formattedEndDate}`);
      
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`📊 Date range: ${daysDiff} days for ${types.length} types`);
      
      // Use direct query for all requests - the native module handles large queries appropriately
      console.log('⚡ Using direct query');
      return await ExpoHealthkitBridgeModule.queryDataInRange(types, formattedStartDate, formattedEndDate);
    } catch (error) {
      console.error('❌ Query error:', error);
      throw error;
    }
  }

   // New safe recent data query
   async queryRecentDataSafe(types: string[], hours: number = 24): Promise<DateRangeResult> {
    console.log(`🕐 Querying last ${hours} hours of data for ${types.length} types`);
    return await ExpoHealthkitBridgeModule.queryRecentDataSafe(types, hours);
  }

  // Progressive query with better error handling - DISABLED (function not implemented in native module)
  // async queryDataInRangeProgressive(types: string[], startDateISO: string, endDateISO: string, maxSamplesPerType: number = 100): Promise<DateRangeResult> {
  //   try {
  //     console.log(`🔄 Progressive query: ${types.length} types, max ${maxSamplesPerType} samples each`);
  //     return await ExpoHealthkitBridgeModule.queryDataInRangeProgressive(types, startDateISO, endDateISO, maxSamplesPerType);
  //   } catch (error) {
  //     console.error('❌ Progressive query error:', error);
  //     throw error;
  //   }
  // }

  // Quick query for specific time periods
  async queryLast24Hours(types?: string[]): Promise<DateRangeResult> {
    const typesToQuery = types || this.getEssentialTypes();
    return await this.queryRecentDataSafe(typesToQuery, 24);
  }

  async queryLastWeek(types?: string[]): Promise<DateRangeResult> {
    const typesToQuery = types || this.getEssentialTypes();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    return await this.queryDataInRange(
      typesToQuery,
      this.createISODate(startDate),
      this.createISODate(endDate)
    );
  }

  async queryLastMonth(types?: string[]): Promise<DateRangeResult> {
    const typesToQuery = types || this.getEssentialTypes();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    return await this.queryDataInRange(
      typesToQuery,
      this.createISODate(startDate),
      this.createISODate(endDate)
    );
  }

  // Get essential types (for safer testing)
  getEssentialTypes(): string[] {
    return [
      'HKQuantityTypeIdentifierStepCount',
      'HKQuantityTypeIdentifierHeartRate',
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKCategoryTypeIdentifierSleepAnalysis'
    ];
  }

  // Get high-frequency types (that generate lots of data)
  getHighFrequencyTypes(): string[] {
    return [
      'HKQuantityTypeIdentifierHeartRate',
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierAppleStandTime',
      'HKQuantityTypeIdentifierAppleExerciseTime'
    ];
  }

  // Get low-frequency types (safer for large date ranges)
  getLowFrequencyTypes(): string[] {
    return [
      'HKQuantityTypeIdentifierStepCount',
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      'HKCategoryTypeIdentifierSleepAnalysis',
      'HKWorkoutTypeIdentifier',
      'HKQuantityTypeIdentifierVO2Max'
    ];
  }


    // 2. Reset anchors to get all data fresh
    async resetAnchorsAndSync(types?: string[]): Promise<SyncResult> {
        return await ExpoHealthkitBridgeModule.resetAnchorsAndSync(types || []);
    }

    // 3. Listen to streaming data events
    onDataStream(listener: (event: StreamEvent) => void) {
        return ExpoHealthkitBridgeModule.addListener('onDataStream', listener);
    }

    // 4. Save data locally (for offline storage before cloud sync)
    async saveDataLocally(samples: HealthSample[]): Promise<void> {
        return await ExpoHealthkitBridgeModule.saveDataLocally(samples);
    }

    // 5. Get locally stored data
    async getLocalData(types?: string[], limit?: number): Promise<HealthSample[]> {
        return await ExpoHealthkitBridgeModule.getLocalData(types || [], limit || 100);
    }

    // 6. Clear local data (after successful cloud sync)
    async clearLocalData(beforeDate?: string): Promise<void> {
        return await ExpoHealthkitBridgeModule.clearLocalData(beforeDate);
    }

    private createISODate(date: Date): string {
        // Use a more compatible ISO format
        return date.toISOString();
      }

  onSyncEvent(listener: (event: SyncEvent) => void) {
    return ExpoHealthkitBridgeModule.addListener('onSyncEvent', listener);
  }

  // Helper method to get available health types
  getAvailableTypes(): string[] {
    return [
      'HKQuantityTypeIdentifierStepCount',
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      'HKQuantityTypeIdentifierFlightsClimbed',
      'HKQuantityTypeIdentifierHeartRate',
      'HKQuantityTypeIdentifierRestingHeartRate',
      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      'HKQuantityTypeIdentifierVO2Max',
      'HKQuantityTypeIdentifierOxygenSaturation',
      'HKQuantityTypeIdentifierRespiratoryRate',
      'HKQuantityTypeIdentifierBodyTemperature',
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      'HKQuantityTypeIdentifierAppleExerciseTime',
      'HKQuantityTypeIdentifierAppleMoveTime',
      'HKQuantityTypeIdentifierAppleStandTime',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKCategoryTypeIdentifierSleepAnalysis',
      'HKCategoryTypeIdentifierAppleStandHour',
      'HKCategoryTypeIdentifierMindfulSession',
      'HKWorkoutTypeIdentifier'
    ];
  }

  // Helper method to get human-readable names
  getTypeDisplayName(typeIdentifier: string): string {
    const displayNames: { [key: string]: string } = {
      'HKQuantityTypeIdentifierStepCount': 'Steps',
      'HKQuantityTypeIdentifierDistanceWalkingRunning': 'Walking/Running Distance',
      'HKQuantityTypeIdentifierFlightsClimbed': 'Flights Climbed',
      'HKQuantityTypeIdentifierHeartRate': 'Heart Rate',
      'HKQuantityTypeIdentifierRestingHeartRate': 'Resting Heart Rate',
      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': 'Heart Rate Variability (SDNN)',
      'HKQuantityTypeIdentifierVO2Max': 'VO₂ Max',
      'HKQuantityTypeIdentifierOxygenSaturation': 'Oxygen Saturation',
      'HKQuantityTypeIdentifierRespiratoryRate': 'Respiratory Rate',
      'HKQuantityTypeIdentifierBodyTemperature': 'Body Temperature',
      'HKQuantityTypeIdentifierBasalEnergyBurned': 'Basal Energy Burned',
      'HKQuantityTypeIdentifierAppleExerciseTime': 'Exercise Time',
      'HKQuantityTypeIdentifierAppleMoveTime': 'Move Time',
      'HKQuantityTypeIdentifierAppleStandTime': 'Stand Time',
      'HKQuantityTypeIdentifierActiveEnergyBurned': 'Active Energy Burned',
      'HKCategoryTypeIdentifierSleepAnalysis': 'Sleep Analysis',
      'HKCategoryTypeIdentifierAppleStandHour': 'Stand Hours',
      'HKCategoryTypeIdentifierMindfulSession': 'Mindfulness',
      'HKWorkoutTypeIdentifier': 'Workouts'
    };
    
    return displayNames[typeIdentifier] || typeIdentifier;
  }
}

export default new ExpoHealthkitBridge();