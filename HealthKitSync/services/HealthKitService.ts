//Pulls live data from HealthKit for our application
//Any data that needs to be pulled locally from HealthKit should be done here. 
import HealthKitBridge from '../modules/expo-healthkit-bridge/src/index';
import { SettingsService } from './SettingsService';

export interface LiveHeartRateData {
  heartRate: number;
  timestamp: string;
  source: string;
}

export interface StepsSample {
  stepCount: number;
  timestamp: string;
  source: string;
  startDate: string;
  endDate: string;
}

export interface LiveStepsData {
  stepCount: number; // Total after filtering
  timestamp: string; // Most recent timestamp
  date: string; // YYYY-MM-DD format for the day
  sources: StepsSample[]; // All individual samples with their sources
  filteredSources: string[]; // Which sources were used in the total
  availableSources: string[]; // All sources that had data
}

export class HealthKitService {
  private static latestHeartRate: LiveHeartRateData | null = null;
  private static hrSubscribers: ((data: LiveHeartRateData | null) => void)[] = [];
  
  private static latestStepsData: Map<string, LiveStepsData> = new Map(); // Map by date (YYYY-MM-DD)
  private static stepsSubscribers: ((data: LiveStepsData | null, date: string) => void)[] = [];
  
  // Get user preference for data source from settings
  private static async getPreferredSource(metric: string): Promise<string | null> {
    try {
      switch (metric) {
        case 'steps':
          return await SettingsService.getDataSourcePreference('steps');
        case 'heartRate':
          return await SettingsService.getDataSourcePreference('heartRate');
        default:
          return null;
      }
    } catch (error) {
      console.error(`Error getting preferred source for ${metric}:`, error);
      return null;
    }
  }
  
  // Filter and aggregate steps data based on user preferences
  private static async processStepsData(samples: StepsSample[], date: string): Promise<LiveStepsData> {
    const preferredSource = await this.getPreferredSource('steps');
    const availableSources = [...new Set(samples.map(s => s.source))];
    
    console.log(`👟 Processing steps for ${date}:`);
    console.log(`   Available sources: ${availableSources.join(', ')}`);
    console.log(`   Preferred source: ${preferredSource || 'None set'}`);
    console.log(`   Total samples: ${samples.length}`);
    
    // Group ALL samples by source for proper aggregation
    const sourceAggregation = new Map<string, {
      totalSteps: number;
      samples: StepsSample[];
      latestTimestamp: string;
    }>();
    
    samples.forEach(sample => {
      const source = sample.source;
      const existing = sourceAggregation.get(source);
      
      if (existing) {
        existing.totalSteps += sample.stepCount;
        existing.samples.push(sample);
        // Keep the latest timestamp
        if (new Date(sample.timestamp) > new Date(existing.latestTimestamp)) {
          existing.latestTimestamp = sample.timestamp;
        }
      } else {
        sourceAggregation.set(source, {
          totalSteps: sample.stepCount,
          samples: [sample],
          latestTimestamp: sample.timestamp
        });
      }
    });
    
    // Log aggregation results for debugging
    sourceAggregation.forEach((data, source) => {
      console.log(`   📊 ${source}: ${data.totalSteps} steps from ${data.samples.length} samples`);
    });
    
    // Determine which source to use based on user preference
    let selectedSource: string | null = null;
    let selectedData: { totalSteps: number; samples: StepsSample[]; latestTimestamp: string } | null = null;
    
    if (preferredSource) {
      // User has a preference - use it if available
      const sourceData = sourceAggregation.get(preferredSource);
      if (sourceData) {
        selectedSource = preferredSource;
        selectedData = sourceData;
        console.log(`   ✅ Using preferred source ${selectedSource}: ${selectedData.totalSteps} steps`);
      } else {
        console.log(`   ⚠️ Preferred source "${preferredSource}" not available in data`);
      }
    }
    
    // If no preferred source worked (or no preference set), use the source with most steps
    if (!selectedSource && sourceAggregation.size > 0) {
      const entries = Array.from(sourceAggregation.entries());
      const highest = entries.reduce((max, [source, data]) => 
        data.totalSteps > max.data.totalSteps ? { source, data } : max
      , { source: entries[0][0], data: entries[0][1] });
      
      selectedSource = highest.source;
      selectedData = highest.data;
      
      const reason = !preferredSource ? 'no preference set' : 'preferred source not available';
      console.log(`   📊 Using highest source (${reason}): ${selectedSource} (${selectedData.totalSteps} steps)`);
    }
    
    return {
      stepCount: selectedData?.totalSteps || 0,
      timestamp: selectedData?.latestTimestamp || new Date().toISOString(),
      date: date,
      sources: selectedData?.samples || [],
      filteredSources: selectedSource ? [selectedSource] : [],
      availableSources: availableSources
    };
  }

  static initialize() {
    console.log('🔍 HealthKitService: Initializing...');
    
    // Discover historical sources for better source management
    this.discoverHistoricalSourcesOnInit();
    
    // Subscribe to streaming heart rate and steps data
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
        this.hrSubscribers.forEach(callback => callback(this.latestHeartRate));
      }
      
      if (event.type === 'HKQuantityTypeIdentifierStepCount' && event.samples.length > 0) {
        // Group samples by date
        const samplesByDate = new Map<string, StepsSample[]>();
        
        event.samples.forEach((sample: any) => {
          const date = new Date(sample.startDate).toLocaleDateString('en-CA'); // YYYY-MM-DD format
          
          const stepsSample: StepsSample = {
            stepCount: Math.round(sample.value ?? 0),
            timestamp: sample.startDate,
            source: sample.sourceName || 'Unknown',
            startDate: sample.startDate,
            endDate: sample.endDate || sample.startDate
          };
          
          if (!samplesByDate.has(date)) {
            samplesByDate.set(date, []);
          }
          samplesByDate.get(date)!.push(stepsSample);
        });
        
        // Process each date's samples asynchronously
        samplesByDate.forEach(async (samples, date) => {
          try {
            const processedData = await this.processStepsData(samples, date);
            
            // Update the latest data for this date
            const existingData = this.latestStepsData.get(date);
            if (!existingData || new Date(processedData.timestamp) > new Date(existingData.timestamp)) {
              this.latestStepsData.set(date, processedData);
              console.log(`👟 HealthKitService: Updated steps for ${date}:`, processedData);
              
              // Notify subscribers for this date
              this.stepsSubscribers.forEach(callback => callback(processedData, date));
            }
          } catch (error) {
            console.error(`❌ Error processing steps data for ${date}:`, error);
          }
        });
      }
    });
    
    console.log('✅ HealthKitService: Initialized with data stream subscription');
  }

  static subscribeToLiveHeartRate(callback: (data: LiveHeartRateData | null) => void) {
    this.hrSubscribers.push(callback);
    
    // Immediately call with current data
    callback(this.latestHeartRate);

    // Return unsubscribe function
    return () => {
      this.hrSubscribers = this.hrSubscribers.filter(sub => sub !== callback);
    };
  }

  static subscribeToLiveSteps(date: string, callback: (data: LiveStepsData | null, date: string) => void) {
    this.stepsSubscribers.push(callback);
    
    // Immediately call with current data for the requested date
    const currentData = this.latestStepsData.get(date);
    callback(currentData || null, date);

    // Return unsubscribe function
    return () => {
      this.stepsSubscribers = this.stepsSubscribers.filter(sub => sub !== callback);
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

  static async getStepsForDate(date: string): Promise<LiveStepsData | null> {
    console.log(`🔍 HealthKitService: getStepsForDate called for ${date}`);
    
    // Check if we have cached data for this date
    const cachedData = this.latestStepsData.get(date);
    if (cachedData) {
      console.log(`✅ HealthKitService: Returning cached steps for ${date}:`, cachedData);
      return cachedData;
    }

    try {
      console.log(`📡 HealthKitService: Querying steps data for ${date}...`);
      
      // Create proper date range for the specific day in user's timezone
      const startDate = new Date(`${date}T00:00:00`);
      const endDate = new Date(`${date}T23:59:59`);
      
      console.log(`📅 Querying steps from ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // Query steps data for the specific date range
      const result = await HealthKitBridge.queryDataInRange(
        ['HKQuantityTypeIdentifierStepCount'],
        startDate.toISOString(),
        endDate.toISOString()
      );
      
      console.log(`📊 HealthKitService: Steps query result:`, result);
      
      const stepsData = result['HKQuantityTypeIdentifierStepCount'];
      if (stepsData && stepsData.length > 0) {
        // Convert raw samples to StepsSample format and filter by exact date
        const samples: StepsSample[] = stepsData
          .filter((sample: any) => {
            const sampleDate = new Date(sample.startDate).toLocaleDateString('en-CA');
            return sampleDate === date;
          })
          .map((sample: any) => ({
            stepCount: Math.round(sample.value ?? 0),
            timestamp: sample.startDate,
            source: sample.sourceName || 'HealthKit',
            startDate: sample.startDate,
            endDate: sample.endDate || sample.startDate
          }));
        
        console.log(`📊 Found ${samples.length} step samples for ${date}`);
        
        if (samples.length > 0) {
          const processedData = await this.processStepsData(samples, date);
          
          // Cache the result
          this.latestStepsData.set(date, processedData);
          
          console.log(`✅ HealthKitService: Found steps for ${date}:`, processedData);
          return processedData;
        }
      }
      
      console.log(`⚠️ HealthKitService: No steps data found for ${date}`);
    } catch (error) {
      console.error(`❌ HealthKitService: Error getting steps for ${date}:`, error);
    }

    return null;
  }

  static getTodaySteps(): LiveStepsData | null {
    const today = new Date().toLocaleDateString('en-CA');
    return this.latestStepsData.get(today) || null;
  }

  // Get all available sources for a specific metric across all cached data
  static getAvailableSourcesForMetric(metric: string): string[] {
    switch (metric) {
      case 'steps':
        const allSources = new Set<string>();
        this.latestStepsData.forEach(data => {
          data.availableSources.forEach(source => allSources.add(source));
        });
        return Array.from(allSources);
      default:
        return [];
    }
  }

  /**
   * Get comprehensive list of available sources by combining cached data and historical discovery
   * This is the preferred method for getting all available sources
   */
  static async getAllAvailableSourcesForMetric(metric: string): Promise<string[]> {
    try {
      // Get sources from cached data (fast)
      const cachedSources = this.getAvailableSourcesForMetric(metric);
      
      // Get sources from historical data (comprehensive)
      const historicalSources = await this.discoverHistoricalSources(metric);
      
      // Combine and deduplicate
      const allSources = new Set<string>([...cachedSources, ...historicalSources]);
      const sourcesList = Array.from(allSources);
      
      console.log(`📊 Found ${sourcesList.length} total sources for ${metric}:`, sourcesList);
      console.log(`   - ${cachedSources.length} from cached data`);
      console.log(`   - ${historicalSources.length} from historical data`);
      
      return sourcesList;
      
    } catch (error) {
      console.error(`❌ Error getting all available sources for ${metric}:`, error);
      // Fallback to cached sources only
      return this.getAvailableSourcesForMetric(metric);
    }
  }

  /**
   * Discover all available data sources by querying historical data from the past 2 days
   * This ensures we find sources even if no streaming data has been received yet
   */
  static async discoverHistoricalSources(metric: string): Promise<string[]> {
    try {
      console.log(`🔍 Discovering historical sources for ${metric}...`);
      
      // Query past 2 days of data to discover sources
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 2);

      const typeIdentifier = this.getHealthKitTypeForMetric(metric);
      if (!typeIdentifier) {
        console.error(`❌ Unknown metric: ${metric}`);
        return [];
      }

      console.log(`📅 Querying ${typeIdentifier} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      const result = await HealthKitBridge.queryDataInRange(
        [typeIdentifier],
        startDate.toISOString(),
        endDate.toISOString()
      );

      const samples = result[typeIdentifier] || [];
      const discoveredSources = new Set<string>();

      // Extract unique source names from samples
      samples.forEach((sample: any) => {
        if (sample.sourceName && sample.sourceName.trim()) {
          discoveredSources.add(sample.sourceName.trim());
        }
      });

      const sourcesList = Array.from(discoveredSources);
      console.log(`✅ Discovered ${sourcesList.length} sources for ${metric} from historical data:`, sourcesList);

      return sourcesList;

    } catch (error) {
      console.error(`❌ Error discovering historical sources for ${metric}:`, error);
      return [];
    }
  }

  /**
   * Get HealthKit type identifier for a given metric
   */
  private static getHealthKitTypeForMetric(metric: string): string | null {
    switch (metric) {
      case 'steps':
        return 'HKQuantityTypeIdentifierStepCount';
      case 'heartRate':
        return 'HKQuantityTypeIdentifierHeartRate';
      default:
        return null;
    }
  }

  /**
   * Discover historical sources on service initialization
   * This runs in the background to populate source information
   */
  private static async discoverHistoricalSourcesOnInit(): Promise<void> {
    try {
      console.log('🔍 HealthKitService: Starting background historical source discovery...');
      
      // NOTE: Discover sources for key metrics in parallel
      const metrics = ['steps', 'heartRate'];
      const discoveryPromises = metrics.map(async (metric) => {
        try {
          const sources = await this.discoverHistoricalSources(metric);
          console.log(`✅ Found ${sources.length} historical sources for ${metric}:`, sources);
          return { metric, sources };
        } catch (error) {
          console.error(`❌ Failed to discover historical sources for ${metric}:`, error);
          return { metric, sources: [] };
        }
      });

      const results = await Promise.all(discoveryPromises);
      
      // Log summary
      const totalSources = results.reduce((sum, result) => sum + result.sources.length, 0);
      console.log(`✅ Historical source discovery completed. Found ${totalSources} total sources across ${metrics.length} metrics.`);
      
    } catch (error) {
      console.error('❌ Error during historical source discovery on init:', error);
    }
  }

  // Get detailed source breakdown for debugging/settings
  static getSourceBreakdown(date: string): { [source: string]: StepsSample[] } | null {
    const data = this.latestStepsData.get(date);
    if (!data) return null;

    const breakdown: { [source: string]: StepsSample[] } = {};
    data.sources.forEach(sample => {
      if (!breakdown[sample.source]) {
        breakdown[sample.source] = [];
      }
      breakdown[sample.source].push(sample);
    });

    return breakdown;
  }

  // Method to update user preference (will be called from settings)
  static async updateSourcePreference(metric: string, preferredSource: string | null): Promise<void> {
    try {
      // Save to persistent storage
      await SettingsService.updateDataSourcePreference(metric as any, preferredSource);
      console.log(`📝 Updated ${metric} source preference:`, preferredSource);
      
      // Reprocess all cached data with new preferences
      if (metric === 'steps') {
        const dates = Array.from(this.latestStepsData.keys());
        for (const date of dates) {
          const data = this.latestStepsData.get(date);
          if (data) {
            try {
              const reprocessed = await this.processStepsData(data.sources, date);
              this.latestStepsData.set(date, reprocessed);
              
              // Notify subscribers of the change
              this.stepsSubscribers.forEach(callback => callback(reprocessed, date));
            } catch (error) {
              console.error(`❌ Error reprocessing steps data for ${date}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error updating source preferences for ${metric}:`, error);
      throw error;
    }
  }

  // Debug method to help understand source conflicts
  static async debugStepsData(date?: string): Promise<void> {
    const targetDate = date || new Date().toLocaleDateString('en-CA');
    const data = this.latestStepsData.get(targetDate);
    
    console.log(`\n🔍 DEBUG: Steps data for ${targetDate}`);
    
    if (!data) {
      console.log('❌ No data found for this date');
      return;
    }
    
    console.log(`📊 Final result: ${data.stepCount} steps from ${data.filteredSources.join(', ')}`);
    console.log(`📱 Available sources: ${data.availableSources.join(', ')}`);
    console.log(`\n📋 Breakdown by source:`);
    
    const breakdown = this.getSourceBreakdown(targetDate);
    if (breakdown) {
      Object.entries(breakdown).forEach(([source, samples]) => {
        const totalFromSource = samples.reduce((sum, sample) => sum + sample.stepCount, 0);
        console.log(`   ${source}: ${totalFromSource} steps (${samples.length} samples)`);
        samples.forEach(sample => {
          console.log(`      ${sample.stepCount} steps at ${new Date(sample.timestamp).toLocaleTimeString()}`);
        });
      });
    }
    
    const preferredSource = await this.getPreferredSource('steps');
    console.log(`\n🎯 Preferred source: ${preferredSource || 'None set'}`);
    console.log(`✅ Selected: ${data.filteredSources[0] || 'None'}\n`);
  }
}