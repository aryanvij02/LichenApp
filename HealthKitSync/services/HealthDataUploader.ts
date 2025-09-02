// ⚠️ DEPRECATED: This JavaScript uploader has been replaced with native Swift implementation
// See: HealthKitSync/modules/expo-healthkit-bridge/ios/HealthDataUploader.swift
// 
// This file is kept for reference and manual historical uploads only.
// Real-time background uploads now happen natively in Swift for better performance.
//
//Manages all Health Data Uploads by hitting our API Gateway Endpoint

interface UploadConfig {
  apiUrl: string;
  userId: string;
  getAuthHeaders?: () => Promise<Record<string, string>>;
}

interface HealthSample {
  startDate: string;
  endDate: string;
  type: string;
  sourceName: string;
  uuid: string;
  value?: number;
  unit?: string;
  metadata?: any;
}

//This is what an UploadBatch type is
//Our Lambda function should receive this, and manage the sorting etc.
interface UploadBatch {
  user_id: string;
  batch_type: 'historical' | 'realtime';
  samples: HealthSample[];
  upload_metadata?: {
    total_samples: number;
    data_types: string[];
    data_source?: string;
    time_range?: {
      start: string;
      end: string;
    } | null;
  };
}

export class HealthDataUploader {
  private config: UploadConfig;
  private uploadQueue: HealthSample[] = [];
  private isUploading = false;

  constructor(config: UploadConfig) {
    this.config = config;
  }

  /**
   * Upload a batch of HealthKit samples (automatically groups by data source and type)
   */
  async uploadBatch(samples: HealthSample[], batchType: 'historical' | 'realtime' = 'realtime'): Promise<boolean> {
    if (samples.length === 0) {
      console.log('📤 No samples to upload');
      return true;
    }

    // Group samples by data source, then by data type for optimal organization
    const groupedSamples = this.groupSamplesBySourceAndType(samples);
    const sourcesCount = Object.keys(groupedSamples).length;

    console.log(`📤 Uploading ${samples.length} samples from ${sourcesCount} source(s) (${batchType})`);
    
    // Upload each source/type group separately
    let totalSuccess = true;
    for (const [sourceName, typeGroups] of Object.entries(groupedSamples)) {
      for (const [dataType, typeSamples] of Object.entries(typeGroups)) {
        const cleanDataType = this.cleanDataTypeName(dataType);
        console.log(`📡 Uploading ${typeSamples.length} ${cleanDataType} samples from "${sourceName}"`);
        
        const success = await this.uploadSourceBatch(typeSamples, batchType);
        if (!success) {
          console.error(`❌ Failed to upload ${cleanDataType} samples from source: ${sourceName}`);
          totalSuccess = false;
        }
      }
    }

    if (totalSuccess) {
      console.log(`✅ Successfully uploaded all ${samples.length} samples`);
    } else {
      console.error(`❌ Some uploads failed`);
    }

    return totalSuccess;
  }

  /**
   * Upload samples from a single data source
   */
  private async uploadSourceBatch(samples: HealthSample[], batchType: 'historical' | 'realtime'): Promise<boolean> {
    // Calculate metadata
    const dataTypes = [...new Set(samples.map(s => s.type))];
    const timeRange = this.calculateTimeRange(samples);
    const sourceName = samples[0]?.sourceName || 'unknown';

    const batch: UploadBatch = {
      user_id: this.config.userId,
      batch_type: batchType,
      samples: samples,
      upload_metadata: {
        total_samples: samples.length,
        data_types: dataTypes,
        time_range: timeRange,
        data_source: sourceName
      }
    };

    console.log(`📊 Source: ${sourceName} | Types: ${dataTypes.join(', ')} | Count: ${samples.length}`);
    if (timeRange) {
      console.log(`📅 Time range: ${timeRange.start} to ${timeRange.end}`);
    }

    try {
      const response = await this.uploadWithRetry(batch);
      
      // Log deduplication information - the Lambda always includes this now
      const received = response.total_samples_received;
      const duplicates = response.duplicate_samples_skipped;
      const uploaded = response.new_samples_uploaded;
      
      // Check if we have the new deduplication response format
      if (received !== undefined && duplicates !== undefined && uploaded !== undefined) {
        if (duplicates > 0) {
          console.log(`🔄 Deduplication: ${received} samples → ${uploaded} new, ${duplicates} duplicates skipped`);
        } else {
          console.log(`✅ All ${uploaded} samples were new (no duplicates)`);
        }
      } else {
        // Fallback for old response format (shouldn't happen anymore)
        console.log(`✅ Successfully uploaded ${samples.length} samples from ${sourceName}`);
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Upload failed for ${sourceName}:`, error);
      return false;
    }
  }

  /**
   * Upload historical data from your queryDataInRange results
   */
  async uploadHistoricalData(historicalResult: {[typeIdentifier: string]: HealthSample[]}, days: number = 30): Promise<boolean> {
    try {
      console.log(`📊 Starting historical upload for last ${days} days`);
      
      // Flatten all the data into a single array
      const allSamples: HealthSample[] = [];
      Object.entries(historicalResult).forEach(([type, samples]: [string, HealthSample[]]) => {
        console.log(`📈 ${type}: ${samples.length} samples`);
        allSamples.push(...samples);
      });

      console.log(`📈 Total historical samples: ${allSamples.length}`);

      if (allSamples.length === 0) {
        console.log('📭 No historical data to upload');
        return true;
      }

      // Upload in chunks to avoid large payloads
      const chunkSize = 100;
      let uploadedCount = 0;

      for (let i = 0; i < allSamples.length; i += chunkSize) {
        const chunk = allSamples.slice(i, i + chunkSize);
        const chunkNumber = Math.floor(i / chunkSize) + 1;
        const totalChunks = Math.ceil(allSamples.length / chunkSize);
        
        console.log(`📦 Uploading chunk ${chunkNumber}/${totalChunks} (${chunk.length} samples)`);
        
        const success = await this.uploadBatch(chunk, 'historical');
        
        if (!success) {
          console.error(`❌ Failed to upload chunk ${chunkNumber}`);
          return false;
        }

        uploadedCount += chunk.length;
        
        // Small delay between chunks to be nice to the API
        if (i + chunkSize < allSamples.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`✅ Historical upload completed: ${uploadedCount} samples`);
      return true;

    } catch (error) {
      console.error('❌ Historical upload failed:', error);
      return false;
    }
  }

  /**
   * Queue samples from real-time streaming for batch upload
   * 
   * BATCHING STRATEGY:
   * - Samples are queued locally (not uploaded immediately)
   * - Upload triggers:
   *   1. QUEUE SIZE: 50+ samples → immediate batch upload
   *   2. TIME INTERVAL: 5-minute timer → flush remaining samples
   * - Each batch upload contains 1-100 samples (API optimized)
   * - Includes retry logic and deduplication handling
   * 
   * FREQUENCY:
   * - Data streams: Real-time (as HealthKit receives it)
   * - Queue checks: Every new sample
   * - Batch uploads: When 50+ samples OR every 5 minutes
   * - API calls: Significantly reduced vs per-sample uploads
   */
  queueStreamingSamples(streamEvent: {type: string, samples: HealthSample[], timestamp: string}) {
    if (streamEvent.samples.length === 0) {
      return;
    }

    this.uploadQueue.push(...streamEvent.samples);
    console.log(`📥 Queued ${streamEvent.samples.length} ${streamEvent.type} samples. Queue size: ${this.uploadQueue.length}`);

    // Auto-upload when queue gets large enough (configurable threshold)
    const BATCH_SIZE_THRESHOLD = 50;
    if (this.uploadQueue.length >= BATCH_SIZE_THRESHOLD) {
      console.log(`🚀 Queue threshold reached (${BATCH_SIZE_THRESHOLD}+ samples), triggering immediate batch upload`);
      this.flushQueue();
    }
  }

  /**
   * Upload all queued samples immediately
   * 
   * Called by:
   * 1. Automatic queue threshold (50+ samples)
   * 2. 5-minute timer interval (SettingsScreen)
   * 3. Manual flush (user-triggered)
   * 
   * Process:
   * - Takes snapshot of current queue
   * - Clears queue immediately (prevents duplicates)
   * - Uploads in single batch with retry logic
   * - Handles network failures gracefully
   */
  async flushQueue(): Promise<boolean> {
    if (this.isUploading || this.uploadQueue.length === 0) {
      console.log('📭 Nothing to flush or upload already in progress');
      return true;
    }

    this.isUploading = true;
    const samplesToUpload = [...this.uploadQueue];
    this.uploadQueue = [];

    console.log(`🔄 Flushing queue: ${samplesToUpload.length} samples`);

    try {
      const success = await this.uploadBatch(samplesToUpload, 'realtime');
      return success;
    } finally {
      this.isUploading = false;
    }
  }

  /**
   * HTTP upload with retry logic
   */
  private async uploadWithRetry(batch: UploadBatch, maxRetries = 3): Promise<any> {
    let lastError;
    const uploadUrl = `${this.config.apiUrl}/upload-health-data`; // Move outside try block

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get auth headers if available
        const baseHeaders = {
          'Content-Type': 'application/json',
        };
        
        const authHeaders = this.config.getAuthHeaders 
          ? await this.config.getAuthHeaders() 
          : {};

        const headers = { ...baseHeaders, ...authHeaders };

        console.log(`🔗 Attempting upload to: ${uploadUrl}`);
        console.log(`📤 Request method: POST`);
        console.log(`📋 Request headers:`, headers);
        console.log(`📦 Request body size:`, JSON.stringify(batch).length, 'bytes');
        
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(batch)
        });

        console.log(`📥 Response status: ${response.status} ${response.statusText}`);
        console.log(`📥 Response headers:`, Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
          const errorText = await response.text();
          console.log(`❌ Error response body:`, errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        return result;

      } catch (error) {
        lastError = error;
        console.log(`❌ Upload attempt ${attempt} failed:`, error);
        
        // Add more detailed error information
        if (error instanceof TypeError && error.message === 'Network request failed') {
          console.log('🔍 Network request failed - possible causes:');
          console.log('  - Server is unreachable or down');
          console.log('  - Invalid URL or DNS resolution failed');
          console.log('  - SSL/TLS certificate issues');
          console.log('  - Network connectivity problems');
          console.log(`  - Attempted URL: ${uploadUrl}`);
        }
        
        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`⏱️ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Calculate time range from samples
   */
  private calculateTimeRange(samples: HealthSample[]): {start: string, end: string} | null {
    if (samples.length === 0) return null;

    const dates = samples.map(s => new Date(s.startDate).getTime()).filter(d => !isNaN(d));
    if (dates.length === 0) return null;

    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    return {
      start: minDate.toISOString(),
      end: maxDate.toISOString()
    };
  }

  /**
   * Group samples by data source
   */
  private groupSamplesBySource(samples: HealthSample[]): {[sourceName: string]: HealthSample[]} {
    const grouped: {[sourceName: string]: HealthSample[]} = {};
    
    for (const sample of samples) {
      const sourceName = sample.sourceName || 'unknown-source';
      if (!grouped[sourceName]) {
        grouped[sourceName] = [];
      }
      grouped[sourceName].push(sample);
    }
    
    return grouped;
  }

  /**
   * Group samples by data source, then by data type for hierarchical S3 structure
   */
  private groupSamplesBySourceAndType(samples: HealthSample[]): {[sourceName: string]: {[dataType: string]: HealthSample[]}} {
    const grouped: {[sourceName: string]: {[dataType: string]: HealthSample[]}} = {};
    
    for (const sample of samples) {
      const sourceName = sample.sourceName || 'unknown-source';
      const dataType = sample.type || 'unknown-type';
      
      if (!grouped[sourceName]) {
        grouped[sourceName] = {};
      }
      if (!grouped[sourceName][dataType]) {
        grouped[sourceName][dataType] = [];
      }
      grouped[sourceName][dataType].push(sample);
    }
    
    return grouped;
  }

  /**
   * Clean data type names for better readability
   */
  private cleanDataTypeName(dataType: string): string {
    return dataType
      .replace('HKQuantityTypeIdentifier', '')
      .replace('HKCategoryTypeIdentifier', '')
      .replace('HKWorkoutTypeIdentifier', 'Workout');
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    const queuedSources = [...new Set(this.uploadQueue.map(s => s.sourceName || 'unknown'))];
    
    return {
      queueSize: this.uploadQueue.length,
      isUploading: this.isUploading,
      queuedDataTypes: [...new Set(this.uploadQueue.map(s => s.type))],
      queuedDataSources: queuedSources
    };
  }
}