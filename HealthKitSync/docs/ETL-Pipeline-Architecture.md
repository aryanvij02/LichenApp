# HealthKit ETL Pipeline Architecture

## Overview

This document outlines the three-tier ETL (Extract, Transform, Load) pipeline for HealthKit data synchronization designed to ensure reliable data transfer while working within iOS background processing limitations.

## Core Design Philosophy

**Reliability over Optimization**: The architecture prioritizes data integrity and guaranteed delivery over perfect real-time performance. Every piece of data will eventually reach the cloud, even if not immediately.

**Embrace iOS Limitations**: Rather than fighting Apple's background processing constraints, we work with them by providing multiple fallback layers.

**Simplicity over Complexity**: Minimize moving parts, use proven patterns, and maintain clear separation of concerns.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Data Flow Diagram                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Tier 1 (Real-time)           Tier 2 (Background)                  │
│  ┌─────────────────┐          ┌─────────────────┐                  │
│  │ 5 HKObserver    │          │ BGProcessingTask│                  │
│  │ Queries         │          │ (Batch Upload)  │                  │
│  │ • HRV SDNN      │          │ • Heart Rate    │                  │
│  │ • ECG           │          │ • Steps         │                  │
│  │ • Sleep         │          │ • Distance      │                  │
│  │ • Resting HR    │          │ • Active Energy │                  │
│  │ • Exercise Time │          │ • Basal Energy  │                  │
│  └─────────────────┘          └─────────────────┘                  │
│          │                            │                            │
│          ▼                            ▼                            │
│  ┌─────────────────┐          ┌─────────────────┐                  │
│  │ Immediate Upload│          │ Batch Upload    │                  │
│  │ (3 retries)     │          │ (All 5 types)   │                  │
│  └─────────────────┘          └─────────────────┘                  │
│          │                            │                            │
│      Success │    Failure         Success │    Failure             │
│          │         │                    │         │                │
│          ▼         ▼                    ▼         ▼                │
│      ┌────────┐ ┌──────────────┐   ┌────────┐ ┌──────────────┐     │
│      │ Done   │ │ Queue Tier 1 │   │ Done   │ │ Queue Tier 2 │     │
│      └────────┘ └──────────────┘   └────────┘ └──────────────┘     │
│                        │                            │              │
│                        └────────────────────────────┘              │
│                                     │                               │
│                                     ▼                               │
│                        ┌─────────────────────────┐                  │
│                        │    Tier 3 (Foreground) │                  │
│                        │  • Process Queue        │                  │
│                        │  • 24hr Catch-up Sync  │                  │
│                        │  • Guaranteed Success  │                  │
│                        └─────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tier Definitions

### Tier 1: Real-Time Streaming (Critical Intervention Data)

**Purpose**: Immediate processing of low-frequency, high-importance health events that trigger acute interventions.

**Data Types**:

- `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` - Stress detection triggers
- `HKDataTypeIdentifierElectrocardiogram` - Manual stress assessments
- `HKCategoryTypeIdentifierSleepAnalysis` - Morning recovery scores
- `HKQuantityTypeIdentifierRestingHeartRate` - Daily recovery calculations
- `HKQuantityTypeIdentifierAppleExerciseTime` - Workout context

**Implementation Strategy**:

- **5 separate HKObserverQueries** with `frequency: .immediate`
- **Immediate upload attempt** with 3 quick retries (0s, 1s, 3s delays)
- **Queue failed uploads** for Tier 3 processing
- **Individual processing** - each data type handled independently

**Why These Data Types**:

- **Naturally infrequent**: HRV is sporadic, ECG is manual, sleep happens once/day
- **Critical timing**: Used for acute stress interventions and recovery calculations
- **Low battery impact**: Minimal observer overhead due to infrequent data generation

### Tier 2: Background Batch Processing (Contextual Data)

**Purpose**: Efficient background processing of higher-frequency contextual data used for baseline calculations and event analysis.

**Data Types**:

- `HKQuantityTypeIdentifierHeartRate` - Daily baselines and event analysis
- `HKQuantityTypeIdentifierStepCount` - Activity context for events
- `HKQuantityTypeIdentifierDistanceWalkingRunning` - Physical activity context
- `HKQuantityTypeIdentifierActiveEnergyBurned` - Movement detection
- `HKQuantityTypeIdentifierBasalEnergyBurned` - Metabolic baseline

**Implementation Strategy**:

- **Single BGProcessingTask** handles all 5 data types together
- **Anchored queries** for incremental sync since last successful upload
- **Batch upload** - all 5 types in single API call
- **All-or-nothing failure handling** - entire batch queued if any part fails

**Why Background Processing**:

- **Higher volume data**: Heart rate can generate thousands of samples per day
- **Less time-sensitive**: Used for trends and baselines, not immediate interventions
- **Efficient batching**: Reduces network overhead and battery usage

### Tier 3: Foreground Fallback (Comprehensive Safety Net)

**Purpose**: Guaranteed data delivery when app is actively used, handling all failed uploads and providing comprehensive catch-up sync.

**Responsibilities**:

1. **Process failed upload queues** from Tier 1 and Tier 2
2. **24-hour catch-up sync** for all 10 data types
3. **Handle extended offline periods** when background sync failed
4. **Anchor recovery** and consistency maintenance

**Implementation Strategy**:

- **Immediate queue processing** on app activation
- **Comprehensive 24-hour sync** as safety net for all data types
- **Unlimited execution time** and full network access
- **Priority processing**: Tier 1 queue → Tier 2 queue → 24hr sync

**Why Foreground Is Reliable**:

- **No iOS time limits**: App can run indefinitely in foreground
- **Full network access**: No background networking restrictions
- **User presence**: Guaranteed execution when user opens app
- **Recovery mechanism**: Can handle any background sync failures

---

## Key Design Decisions

### 1. Observer Throttling Strategy: Embrace iOS Limitations

**Decision**: Set all Tier 1 observers to `.immediate` frequency and let iOS manage throttling naturally.

**Why Not Fight Throttling**:

- **Tier 1 data is naturally infrequent**: HRV, ECG, sleep don't generate constant data
- **Complex throttling prevention adds failure points**: Monitoring, adjusting, retry logic
- **Foreground sync provides safety net**: 24hr catch-up handles any missed data
- **iOS knows best**: System-level throttling based on battery, usage, device state

**Alternative Rejected**: Dynamic frequency adjustment based on system behavior
**Reason**: Adds complexity without significant benefit given infrequent Tier 1 data

### 2. Queue Storage: Unified SQLite Table

**Decision**: Single SQLite table with tier priority flags for all failed uploads.

**Schema**:

```sql
CREATE TABLE upload_queue (
  id TEXT PRIMARY KEY,
  tier INTEGER,           -- 1 or 2 (priority)
  data_type TEXT,         -- HealthKit identifier
  sample_data TEXT,       -- JSON serialized samples
  timestamp INTEGER,      -- Unix timestamp
  retry_count INTEGER,    -- Number of retry attempts
  created_at INTEGER      -- When queued
);
```

**Why Unified Storage**:

- **Simpler database management**: One connection, one table, unified CRUD operations
- **Easier queue processing**: Single priority-sorted query
- **Unified retry logic**: Same mechanics for both tiers
- **Less complexity**: No table synchronization or multiple connection management

**Alternative Rejected**: Separate tables for Tier 1 and Tier 2 failures
**Reason**: Unnecessary complexity for the same operational patterns

### 3. Background Batch Size: All-in-One Upload

**Decision**: Upload all 5 Tier 2 data types in a single batch API call.

**Why Single Batch**:

- **Minimizes network overhead**: One HTTP request vs 5 separate requests
- **Simpler error handling**: Binary success/failure for entire batch
- **Efficient BGProcessingTask usage**: Maximizes work done in limited time window
- **Server-side deduplication**: Cloud handles duplicate data, so sending everything is fine

**Batch Structure**:

```json
{
  "tier": 2,
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "heartRate": [...samples],
    "stepCount": [...samples],
    "distanceWalkingRunning": [...samples],
    "activeEnergyBurned": [...samples],
    "basalEnergyBurned": [...samples]
  }
}
```

**Alternative Rejected**: Individual uploads per data type
**Reason**: Increases network requests, battery usage, and error handling complexity

### 4. Anchor Management: Per-Data-Type (Existing Pattern)

**Decision**: Maintain existing per-data-type anchor system with individual updates.

**Why Keep Current System**:

- **Already implemented and working**: Don't fix what's not broken
- **HealthKit design principle**: Anchors are designed to be per-data-type
- **Granular recovery**: Individual data type failures don't affect others
- **Easier debugging**: Can track sync progress per data type

**Anchor Update Strategy**:

- **Tier 1**: Update anchor immediately after successful individual upload
- **Tier 2**: Update all 5 anchors only after successful batch upload
- **Tier 3**: Update anchors after successful queue processing and catch-up sync

**Alternative Rejected**: Unified anchor system across all data types
**Reason**: Complicates failure recovery and goes against HealthKit design patterns

### 5. Failure Handling: Tier-Specific Strategies

**Decision**: Different failure handling approaches optimized for each tier's characteristics.

**Tier 1 (Individual Handling)**:

```swift
if uploadTier1Sample(sample) {
  updateAnchor(for: dataType)
} else {
  queueForRetry(sample, tier: 1)
}
```

**Tier 2 (All-or-Nothing)**:

```swift
if uploadTier2Batch(allSamples) {
  updateAnchors(for: allTier2Types)
} else {
  queueForRetry(allSamples, tier: 2)
}
```

**Why Different Approaches**:

- **Tier 1**: Each data type has different urgency and timing requirements
- **Tier 2**: Batch processing is more efficient and simpler to manage
- **Both tiers**: Failed uploads always preserved in queue for guaranteed delivery

---

## Technical Specifications

### Background Task Configuration

**Task Identifier**: `"com.lichenapp.health-data-sync"`
**Task Type**: `BGProcessingTaskRequest`
**Frequency**: Request daily execution (iOS determines actual timing)
**Execution Time**: 5-10 minutes when iOS permits

### HealthKit Background Delivery

**Tier 1 Data Types**: `frequency: .immediate`
**Tier 2 Data Types**: No background delivery (processed by BGProcessingTask)

### Queue Processing Priority

1. **Tier 1 queue** (highest priority - immediate processing)
2. **Tier 2 queue** (normal priority - batch processing)
3. **24-hour catch-up sync** (safety net - comprehensive sync)

### Network Retry Strategy

**Tier 1 (Real-time)**: 3 quick retries (0s, 1s, 3s delays)
**Tier 2 (Background)**: Single attempt (queue if failed)
**Tier 3 (Foreground)**: Aggressive retries with exponential backoff

---

## Data Flow Examples

### Normal Operation Flow

1. **Tier 1 Event**: User takes ECG reading

   - HKObserverQuery fires immediately
   - Upload attempted with 3 quick retries
   - Success: Anchor updated, done
   - Failure: Sample queued with tier=1

2. **Tier 2 Processing**: iOS triggers BGProcessingTask

   - Query incremental data for all 5 types using anchors
   - Single batch upload of all samples
   - Success: All anchors updated
   - Failure: Entire batch queued with tier=2

3. **Tier 3 Activation**: User opens app
   - Process Tier 1 queue (high priority)
   - Process Tier 2 queue (normal priority)
   - 24-hour catch-up sync for all 10 data types
   - Update all anchors after successful uploads

### Edge Case Handling

**Observer Throttling**: iOS limits Tier 1 observer frequency

- No complex mitigation attempted
- Foreground sync catches missed data via 24hr sync

**Background Task Not Scheduled**: iOS doesn't run BGProcessingTask for days

- Tier 2 data accumulates
- Foreground sync handles everything when user opens app

**Extended Offline Period**: Network unavailable for hours/days

- All uploads queue successfully
- Massive but comprehensive sync when network returns

**App Termination**: User force-quits app for extended period

- Background delivery stops completely
- 24hr foreground sync handles all missed data when app reopens

---

## Implementation Benefits

### Reliability Guarantees

- **No data loss**: Multiple fallback layers ensure eventual delivery
- **Comprehensive recovery**: 24hr foreground sync catches any gaps
- **Queue persistence**: SQLite ensures failed uploads survive app termination

### Performance Characteristics

- **Low battery impact**: Tier 1 observers handle naturally infrequent data
- **Efficient background processing**: Single batch upload reduces overhead
- **Optimal foreground performance**: Unlimited execution time for catch-up sync

### Maintenance Benefits

- **Simple debugging**: Clear data flow with minimal state management
- **Unified retry logic**: Same queue processing for both tiers
- **iOS-friendly design**: Works with system limitations rather than against them

---

## Assumptions and Dependencies

### User Behavior

- **Daily app usage**: User opens app at least once per day
- **Foreground sync window**: User keeps app open long enough for catch-up sync

### System Behavior

- **iOS background delivery**: Works for Tier 1 data types when device unlocked
- **BGProcessingTask scheduling**: Runs periodically when iOS permits
- **Network availability**: Eventually available during foreground usage

### Server Capabilities

- **Deduplication handling**: Cloud infrastructure handles duplicate data
- **Batch processing**: API endpoints support batched uploads
- **Large payload handling**: Can process 24hrs worth of health data

---

## Future Considerations

### Potential Optimizations

- **Intelligent queue prioritization**: Age-based or data-type-specific priorities
- **Network-aware batching**: Adjust batch sizes based on connection quality
- **User behavior learning**: Adapt sync timing to user patterns

### Monitoring and Analytics

- **Sync success rates**: Track reliability metrics per tier
- **Queue size monitoring**: Alert on excessive queue growth
- **Background task execution**: Monitor iOS scheduling patterns

### Scalability Concerns

- **Queue size limits**: Implement cleanup policies for old failed uploads
- **Memory management**: Handle large datasets efficiently during sync
- **API rate limiting**: Respect server-side rate limits during catch-up sync

---

## Conclusion

This three-tier architecture ensures reliable HealthKit data synchronization by embracing iOS limitations rather than fighting them. The design prioritizes data integrity through multiple fallback layers while maintaining simplicity and performance efficiency.

The key insight is that **perfect real-time sync is less important than guaranteed eventual delivery**. By accepting that background processing is unreliable and using foreground sync as the ultimate safety net, we achieve a robust system that works reliably across all user scenarios and device conditions.
