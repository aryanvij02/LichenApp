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

export interface UploaderConfig {
  apiUrl: string;
  userId: string;
  authHeaders?: Record<string, string>;
}

export interface SyncEvent {
  phase: 'permissions' | 'observer' | 'anchored' | 'upload' | 'historical' | 'uploading' | 'completed' | 'failed';
  message: string;
  counts?: {
    added?: number;
    deleted?: number;
  };
  progress?: {
    completed: number;
    total: number;
  };
  samplesFound?: number;
  samplesUploaded?: number;
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

  export interface DateRangeUploadResult {
    success: boolean;
    message: string;
    samplesFound: number;
    samplesUploaded: number;
    dataTypes: string[];
    dataTypeBreakdown: Record<string, number>;
  }

  export interface HeartbeatData {
    time_since_start: number;
    absolute_time: string;
    preceded_by_gap: boolean;
  }

  export interface HeartbeatSeries {
    uuid: string;
    start_date: string;
    end_date: string;
    source_name: string;
    beat_count: number;
    beats: HeartbeatData[];
  }

  export interface HeartbeatSeriesResult {
    success: boolean;
    message: string;
    series_count: number;
    total_beats: number;
    date_range: {
      start: string;
      end: string;
    };
    series: HeartbeatSeries[];
  }

  // ECG Data Interfaces
  export interface ECGVoltagePoint {
    t: number; // time since start in seconds
    v: number; // voltage in volts
  }

  export interface ECGSample extends HealthSample {
    // ECG-specific metadata (added to metadata field)
    ecgClassification?: string;
    symptomsStatus?: string;
    averageHeartRate?: number;
    samplingFrequency?: number;
    numberOfVoltageMeasurements?: number;
    voltagePoints?: ECGVoltagePoint[]; // voltage data array
  }
  
  export interface StreamEvent {
    type: string;
    samples: HealthSample[];
    timestamp: string;
  }
  

// Importing the native Swift module
//React Native uses a bridge to communicate with native modules
  // Arguments from JS code get serialized to JSON, sent across this 'bridge' to native code, and responses are serialized back to JSON and returned to JS
const ExpoHealthkitBridgeModule = requireNativeModule('ExpoHealthkitBridge');

//Functions that are wrapped which can be called from the RN code, but query the native Swift module
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

  async configureUploader(config: UploaderConfig): Promise<void> {
    return await ExpoHealthkitBridgeModule.configureUploader(
      config.apiUrl,
      config.userId,
      config.authHeaders || {}
    );
  }

  /**
   * Upload health data for a specific date range
   * Combines querying and uploading in one operation
   * @param types - Array of HealthKit type identifiers
   * @param startDate - Start date in ISO 8601 format
   * @param endDate - End date in ISO 8601 format
   * @returns Promise with upload result details
   */
  async uploadDateRange(
    types: string[],
    startDate: string,
    endDate: string
  ): Promise<DateRangeUploadResult> {
    return await ExpoHealthkitBridgeModule.uploadDateRange(types, startDate, endDate);
  }

  /**
   * Query detailed beat-by-beat heartbeat data (iOS 13+)
   * This provides the InstantaneousBeatsPerMinute data equivalent to XML exports
   * @param startDate - Start date in ISO 8601 format
   * @param endDate - End date in ISO 8601 format
   * @returns Promise with heartbeat series data
   */
  async queryHeartbeatSeries(
    startDate: string,
    endDate: string
  ): Promise<HeartbeatSeriesResult> {
    return await ExpoHealthkitBridgeModule.queryHeartbeatSeries(startDate, endDate);
  }

  /**
   * Query ECG data with voltage measurements (iOS 12.2+, Apple Watch Series 4+)
   * Returns ECG samples with high-level metadata and detailed voltage points
   * @param startDate - Start date in ISO 8601 format
   * @param endDate - End date in ISO 8601 format
   * @param maxSamples - Maximum number of ECG samples to return (optional)
   * @returns Promise with ECG samples (enhanced HealthSample objects)
   */
  async queryECGData(
    startDate: string,
    endDate: string,
    maxSamples?: number
  ): Promise<ECGSample[]> {
    return await ExpoHealthkitBridgeModule.queryECGData(startDate, endDate, maxSamples || 50);
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
  // ✅ Updated to include all Apple Watch data types from your analysis
  getAvailableTypes(): string[] {
    return [
      // Core metrics
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
      
      // Energy & Activity
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierAppleExerciseTime',
      'HKQuantityTypeIdentifierAppleMoveTime',
      'HKQuantityTypeIdentifierAppleStandTime',
      
      // 🆕 NEW: Apple Watch specific metrics from your analysis
      'HKQuantityTypeIdentifierWalkingHeartRateAverage',
      'HKQuantityTypeIdentifierEnvironmentalAudioExposure',
      'HKQuantityTypeIdentifierRunningPower',
      'HKQuantityTypeIdentifierEnvironmentalSoundReduction',
      'HKQuantityTypeIdentifierRunningSpeed',
      'HKQuantityTypeIdentifierTimeInDaylight',
      'HKQuantityTypeIdentifierPhysicalEffort',
      
      // 🫀 ECG & Advanced Cardiac Data (iOS 14+)
      // 'HKElectrocardiogramType',
      'HKDataTypeIdentifierElectrocardiogram',
      
      // Categories & Sleep
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
      'HKWorkoutTypeIdentifier': 'Workouts',
      'HKElectrocardiogramType': 'ECG (Electrocardiogram)'
    };
    
    return displayNames[typeIdentifier] || typeIdentifier;
  }
}

export default new ExpoHealthkitBridge();


