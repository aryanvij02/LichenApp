# Reliable Health Data Sync Implementation Plan

## Overview

This document outlines the implementation of a robust health data synchronization system that prioritizes immediate uploads while providing comprehensive data integrity guarantees through persistent queuing and background sync safety nets.

## Current Problems

### 1. **Data Loss from Premature Anchor Updates**

- Anchors are updated immediately after HealthKit queries
- If upload fails or app is killed, data is lost forever
- No way to recover missed data

### 2. **Insufficient Background Execution Time**

- HKObserverQuery provides minimal background time (~30 seconds)
- Complex uploads (especially ECG with S3) exceed time limits
- Network requests fail due to app termination

### 3. **No Retry Mechanism**

- Failed uploads are forgotten
- No persistent storage of pending data
- Manual app opening required to sync missed data

### 4. **Unreliable Background Sync**

- Only relies on HKObserverQuery background delivery
- No systematic approach to missed data recovery

## Solution Architecture

### **Three-Layer Sync Strategy**

```
Layer 1: IMMEDIATE SYNC (Primary - 95% of data)
├── HKObserverQuery detects changes
├── Attempt immediate upload (3 quick retries)
├── Update anchors ONLY after upload success
└── Skip queue if upload succeeds

Layer 2: PERSISTENT QUEUE (Safety Net)
├── Queue data ONLY if immediate upload fails
├── SQLite-backed persistent storage
├── Retry logic with exponential backoff
└── Process on app foreground

Layer 3: BACKGROUND TASKS (Backup)
├── BGProcessingTask for system-optimal timing
├── Process any remaining queued items
├── Scheduled more frequently (every 30-60 minutes)
└── Final safety net for edge cases
```

## Detailed Implementation Plan

### **Phase 1: Core Infrastructure (Week 1)**

#### 1.1 Create Persistent Upload Queue

**New File: `PersistentUploadQueue.swift`**

```swift
class PersistentUploadQueue {
    private let dbURL: URL
    private var db: OpaquePointer?

    struct QueueItem {
        let id: UUID
        let userId: String
        let dataType: String
        let sampleData: Data  // JSON-encoded HealthKit sample
        let anchorData: Data? // Anchor state before this data
        let createdAt: Date
        let retryCount: Int
        let lastAttempt: Date?
        let status: QueueStatus
        let priority: Priority
    }

    enum QueueStatus: String, CaseIterable {
        case pending = "pending"
        case uploading = "uploading"
        case failed = "failed"
        case uploaded = "uploaded"
    }

    enum Priority: Int, CaseIterable {
        case normal = 0
        case high = 1
        case critical = 2
    }
}
```

**SQLite Schema:**

```sql
CREATE TABLE upload_queue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    data_type TEXT NOT NULL,
    sample_data TEXT NOT NULL,  -- JSON
    anchor_data BLOB,           -- Encoded HKQueryAnchor
    created_at TIMESTAMP NOT NULL,
    retry_count INTEGER DEFAULT 0,
    last_attempt TIMESTAMP,
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    INDEX idx_status_priority (status, priority, created_at)
);
```

#### 1.2 Background Task Manager

**New File: `BackgroundTaskManager.swift`**

```swift
class BackgroundTaskManager {
    static let shared = BackgroundTaskManager()
    private let taskIdentifier = "com.yourapp.health-data-sync"

    func registerBackgroundTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: taskIdentifier,
            using: nil
        ) { task in
            self.handleHealthDataSync(task: task as! BGProcessingTask)
        }
    }

    func scheduleFrequentSync() {
        let request = BGProcessingTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60) // 30 minutes
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false

        do {
            try BGTaskScheduler.shared.submit(request)
            log("📅 Frequent background sync scheduled")
        } catch {
            log("❌ Failed to schedule background sync: \(error)")
        }
    }
}
```

### **Phase 2: Modified Sync Logic (Week 2)**

#### 2.1 Updated HKObserverQuery Handler

**Modified: `ExpoHealthkitBridgeModule.swift`**

```swift
@MainActor
private func handleBackgroundUpdate(for type: HKSampleType) async {
    do {
        // 1. Query new data WITHOUT updating anchor
        let newSamples = try await queryNewDataWithoutAnchorUpdate(for: type)

        guard !newSamples.isEmpty else { return }

        log("📥 Detected \(newSamples.count) new \(type.identifier) samples")

        // 2. Attempt immediate upload (3 quick retries)
        let uploadSuccess = await attemptImmediateUpload(samples: newSamples)

        if uploadSuccess {
            // 3a. SUCCESS: Update anchor and we're done
            await updateAnchorAfterSuccessfulUpload(for: type, samples: newSamples)
            log("✅ Immediate sync successful for \(newSamples.count) \(type.identifier) samples")

            // Send success event
            self.sendEvent("onSyncEvent", [
                "phase": "immediate_success",
                "dataType": type.identifier,
                "count": newSamples.count
            ])
        } else {
            // 3b. FAILED: Add to persistent queue for retry
            await UploadQueue.shared.enqueue(
                samples: newSamples,
                dataType: type.identifier,
                anchorData: tempAnchors[type.identifier]
            )

            log("⚠️ Immediate sync failed - \(newSamples.count) \(type.identifier) samples queued for retry")

            // Send failure event
            self.sendEvent("onSyncEvent", [
                "phase": "immediate_failed",
                "dataType": type.identifier,
                "count": newSamples.count,
                "queued": true
            ])

            // Schedule background processing for queued items
            BackgroundTaskManager.shared.scheduleFrequentSync()
        }

    } catch {
        log("❌ Error in background update for \(type.identifier): \(error)")
    }
}
```

#### 2.2 Deferred Anchor Management

```swift
// Temporary storage for anchors before upload confirmation
private var tempAnchors: [String: HKQueryAnchor] = [:]

private func queryNewDataWithoutAnchorUpdate(for type: HKSampleType) async throws -> [[String: Any]] {
    let currentAnchor = anchors[type.identifier] ?? HKQueryAnchor(fromValue: Int(HKAnchoredObjectQueryNoAnchor))

    return try await withCheckedThrowingContinuation { continuation in
        let query = HKAnchoredObjectQuery(
            type: type,
            predicate: nil,
            anchor: currentAnchor,
            limit: HKObjectQueryNoLimit
        ) { [weak self] query, samples, deletedObjects, newAnchor, error in

            if let error = error {
                continuation.resume(throwing: error)
                return
            }

            // Store new anchor temporarily - don't persist yet
            if let newAnchor = newAnchor {
                self?.tempAnchors[type.identifier] = newAnchor
            }

            // Process samples
            Task { [weak self] in
                var processedSamples: [[String: Any]] = []

                if let samples = samples {
                    for sample in samples {
                        if let processed = await self?.sampleToDictionaryWithVoltage(sample) {
                            processedSamples.append(processed)
                        }
                    }
                }

                continuation.resume(returning: processedSamples)
            }
        }

        healthStore.execute(query)
    }
}

private func updateAnchorAfterSuccessfulUpload(for type: HKSampleType, samples: [[String: Any]]) async {
    if let tempAnchor = tempAnchors[type.identifier] {
        await MainActor.run {
            self.anchors[type.identifier] = tempAnchor
            self.saveAnchors()
            self.tempAnchors.removeValue(forKey: type.identifier)
            self.setLastSyncDate()
        }
        log("📍 Updated anchor for \(type.identifier) after successful upload")
    }
}
```

#### 2.3 Immediate Upload with Quick Retries

```swift
private func attemptImmediateUpload(samples: [[String: Any]]) async -> Bool {
    let retryDelays: [TimeInterval] = [0, 1, 3] // 0 sec, 1 sec, 3 sec

    for (attempt, delay) in retryDelays.enumerated() {
        if delay > 0 {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        }

        log("🔄 Immediate upload attempt \(attempt + 1)/\(retryDelays.count)")

        do {
            let rawSamples = samples.map { RawHealthSample(rawData: $0) }

            // Use existing uploader with timeout for immediate sync
            let uploadTask = Task {
                await uploader.uploadRawSamples(rawSamples, batchType: "immediate")
            }

            // Timeout for immediate upload (10 seconds max)
            let result = try await withThrowingTaskGroup(of: Bool.self) { group in
                group.addTask { await uploadTask.value }
                group.addTask {
                    try await Task.sleep(nanoseconds: 10_000_000_000) // 10 seconds
                    throw TimeoutError.uploadTimeout
                }
                return try await group.next()!
            }

            if result {
                log("✅ Immediate upload succeeded on attempt \(attempt + 1)")
                return true
            }

        } catch {
            log("❌ Upload attempt \(attempt + 1) failed: \(error)")
        }
    }

    log("❌ All immediate upload attempts failed")
    return false
}

enum TimeoutError: Error {
    case uploadTimeout
}
```

### **Phase 3: Foreground Reconciliation (Week 3)**

#### 3.1 App Lifecycle Integration

**Modified: `AppDelegate.swift` or Main App**

```swift
func applicationDidBecomeActive(_ application: UIApplication) {
    Task {
        await ForegroundSyncManager.shared.handleAppBecameActive()
    }
}

func applicationDidEnterBackground(_ application: UIApplication) {
    // Only schedule background task if there are pending items
    let pendingCount = UploadQueue.shared.getPendingItemCount()
    if pendingCount > 0 {
        BackgroundTaskManager.shared.scheduleFrequentSync()
        log("📱 App backgrounded with \(pendingCount) pending items - background sync scheduled")
    }
}
```

#### 3.2 Foreground Sync Manager

**New File: `ForegroundSyncManager.swift`**

```swift
class ForegroundSyncManager {
    static let shared = ForegroundSyncManager()

    func handleAppBecameActive() async {
        log("🚀 App became active - checking for pending data")

        // 1. Process any items in upload queue immediately
        await processPendingUploads()

        // 2. Check for any data missed while app was closed
        await recheckForMissedData()

        // 3. Verify sync integrity
        await verifySyncIntegrity()
    }

    private func processPendingUploads() async {
        let pendingItems = UploadQueue.shared.getPendingItems()

        guard !pendingItems.isEmpty else {
            log("✅ No pending uploads")
            return
        }

        log("📦 Processing \(pendingItems.count) pending uploads immediately")

        // Group by data type for efficient batch uploads
        let groupedItems = Dictionary(grouping: pendingItems, by: { $0.dataType })

        for (dataType, items) in groupedItems {
            let samples = items.compactMap { item -> [String: Any]? in
                try? JSONSerialization.jsonObject(with: item.sampleData) as? [String: Any]
            }

            let success = await attemptImmediateUpload(samples: samples)

            if success {
                // Mark as uploaded and update anchors
                for item in items {
                    await UploadQueue.shared.markAsUploaded(item.id)
                    // Update anchor if we have anchor data
                    if let anchorData = item.anchorData {
                        await updateAnchorFromQueueItem(dataType: dataType, anchorData: anchorData)
                    }
                }
                log("✅ Foreground sync: uploaded \(items.count) \(dataType) items")
            } else {
                // Increment retry count for failed items
                for item in items {
                    await UploadQueue.shared.incrementRetryCount(item.id)
                }
                log("❌ Foreground sync: failed to upload \(dataType)")
            }
        }
    }

    private func recheckForMissedData() async {
        // Check if any new data appeared while app was closed
        // This handles edge cases where background delivery didn't work
        log("🔍 Checking for missed data while app was closed")

        let monitoredTypes = getDefaultHealthKitTypes()

        for type in monitoredTypes {
            // Query recent data (last 24 hours) and compare with known state
            let recentData = try? await queryRecentDataForMissedCheck(type: type)
            if let newData = recentData, !newData.isEmpty {
                log("🔍 Found \(newData.count) potentially missed \(type.identifier) samples")
                await handleMissedData(type: type, samples: newData)
            }
        }
    }

    private func verifySyncIntegrity() async {
        // Optional: Verify that our anchor state matches HealthKit's actual state
        // This is an additional safety check
        let lastSyncTime = getLastSyncDate()
        let currentTime = Date()

        if let lastSync = lastSyncTime {
            let hoursSinceSync = currentTime.timeIntervalSince(ISO8601DateFormatter().date(from: lastSync) ?? currentTime) / 3600

            if hoursSinceSync > 48 { // More than 48 hours
                log("⚠️ Last sync was \(Int(hoursSinceSync)) hours ago - running integrity check")
                await performFullIntegrityCheck()
            }
        }
    }
}
```

### **Phase 4: Background Processing Enhancement (Week 4)**

#### 4.1 Queue-Based Background Processing

```swift
class QueuedSyncOperation: Operation {
    override func main() {
        guard !isCancelled else { return }

        let pendingItems = UploadQueue.shared.getPendingItems()

        guard !pendingItems.isEmpty else {
            log("✅ Background sync: No pending items")
            return
        }

        log("🔄 Background sync: Processing \(pendingItems.count) queued items")

        // Process with longer retry logic and exponential backoff
        let groupedItems = Dictionary(grouping: pendingItems, by: { $0.dataType })

        for (dataType, items) in groupedItems {
            guard !isCancelled else { break }

            let success = processQueuedItems(items: items, dataType: dataType)

            if success {
                log("✅ Background sync: uploaded \(items.count) \(dataType) items")
            } else {
                log("❌ Background sync: failed \(dataType), will retry later")
            }
        }

        // Clean up old successfully uploaded items
        UploadQueue.shared.cleanupOldItems(olderThan: Date().addingTimeInterval(-7 * 24 * 3600)) // 7 days
    }

    private func processQueuedItems(items: [QueueItem], dataType: String) -> Bool {
        // Implementation with exponential backoff
        // This runs in background with longer timeouts
        return true // Placeholder
    }
}
```

### **Phase 5: Configuration and Monitoring**

#### 5.1 Configuration

**Modified: `UploadModels.swift`**

```swift
struct SyncConfiguration {
    static let immediateRetryDelays: [TimeInterval] = [0, 1, 3] // Quick retries
    static let immediateUploadTimeout: TimeInterval = 10 // 10 seconds
    static let backgroundSyncInterval: TimeInterval = 30 * 60 // 30 minutes
    static let maxQueueSize: Int = 10000 // Maximum items in queue
    static let queueCleanupInterval: TimeInterval = 7 * 24 * 3600 // 7 days
}
```

#### 5.2 Monitoring and Analytics

```swift
class SyncAnalytics {
    static func trackSyncEvent(_ event: SyncEvent) {
        let eventData: [String: Any] = [
            "event_type": event.type,
            "data_type": event.dataType,
            "sample_count": event.count,
            "success": event.success,
            "duration_ms": event.duration,
            "retry_count": event.retryCount,
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ]

        // Send to analytics service
        Analytics.track("health_data_sync", properties: eventData)

        // Log locally for debugging
        log("📊 SYNC_EVENT: \(event.type) - \(event.dataType) - \(event.count) samples - Success: \(event.success)")
    }
}

struct SyncEvent {
    let type: String // "immediate_success", "immediate_failed", "background_success", etc.
    let dataType: String
    let count: Int
    let success: Bool
    let duration: TimeInterval
    let retryCount: Int
}
```

## Implementation Timeline

### **Week 1: Foundation**

- [ ] Create `PersistentUploadQueue.swift` with SQLite backend
- [ ] Create `BackgroundTaskManager.swift` with BGTaskScheduler
- [ ] Add background processing capabilities to app
- [ ] Add required Info.plist entries

### **Week 2: Core Logic Migration**

- [ ] Modify `handleBackgroundUpdate` to use new flow
- [ ] Implement deferred anchor management
- [ ] Add immediate upload with quick retries
- [ ] Test immediate sync path thoroughly

### **Week 3: Foreground Integration**

- [ ] Create `ForegroundSyncManager.swift`
- [ ] Integrate with app lifecycle events
- [ ] Implement missed data detection
- [ ] Add sync integrity verification

### **Week 4: Background Processing**

- [ ] Implement `QueuedSyncOperation`
- [ ] Add comprehensive retry logic
- [ ] Implement queue cleanup
- [ ] Add monitoring and analytics

### **Week 5: Testing and Optimization**

- [ ] Background testing with TestFlight
- [ ] Performance optimization
- [ ] Edge case handling
- [ ] Documentation and logging improvements

## Testing Strategy

### **Unit Tests**

- Queue persistence across app restarts
- Anchor management logic
- Retry mechanisms
- Data integrity verification

### **Integration Tests**

- End-to-end sync flows
- Network failure scenarios
- App lifecycle transitions
- Background task execution

### **Production Testing**

- TestFlight with background task debugging
- Analytics monitoring for sync success rates
- Performance metrics collection
- User feedback integration

## Expected Outcomes

### **Performance Metrics**

- **Immediate Sync Success Rate**: >95% when network available
- **Data Loss Rate**: 0% (no data should ever be lost)
- **Average Sync Latency**: <5 seconds for immediate sync
- **Background Recovery Rate**: >99% within 24 hours

### **User Experience**

- Transparent, real-time data synchronization
- No manual intervention required
- Reliable sync status visibility
- Graceful handling of network issues

### **System Reliability**

- Complete elimination of data loss
- Robust recovery from all failure scenarios
- Efficient background processing
- Comprehensive monitoring and diagnostics

## API Deduplication Considerations

Since the API has deduplication logic:

- Safe to retry uploads without worrying about duplicates
- Can implement aggressive retry strategies
- Background tasks can reprocess entire date ranges safely
- Integrity checks can re-upload historical data if needed

## Rollback Plan

If issues arise during implementation:

1. Feature flags to switch between old and new sync logic
2. Database migration rollback scripts
3. Anchor state backup and restore
4. Gradual rollout via TestFlight groups

## Success Criteria

✅ **Primary Goals**

- Zero data loss under all conditions
- > 95% immediate sync success rate
- <10 second average sync latency
- Automatic recovery from all failure scenarios

✅ **Secondary Goals**

- Comprehensive sync monitoring
- User-visible sync status
- Efficient background processing
- Minimal battery impact

This implementation provides a robust, scalable foundation for reliable health data synchronization with multiple safety nets and recovery mechanisms.
