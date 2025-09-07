import Foundation
import HealthKit

/// Manages foreground synchronization when app becomes active
/// Processes pending uploads and checks for missed data while app was closed
class ForegroundSyncManager {
    static let shared = ForegroundSyncManager()
    
    private weak var healthModule: ExpoHealthkitBridgeModule? // Weak reference to the main module
    private let uploader = HealthDataUploader() // Use a local uploader instance
    
    // MARK: - Initialization
    
    private init() {}
    
    // MARK: - Public Interface
    
    /// Set reference to health module for coordination
    func setHealthModule(_ module: ExpoHealthkitBridgeModule) {
        self.healthModule = module
    }
    
    /// Handle app becoming active - main entry point
    func handleAppBecameActive() async {
        print("🚀 Foreground sync: App became active - processing pending data")
        
        // 1. Process any items in upload queue immediately
        await processPendingUploads()
        
        // 2. Check for any data missed while app was closed
        await recheckForMissedData()
        
        // 3. Verify sync integrity (optional health check)
        await verifySyncIntegrity()
        
        print("🏁 Foreground sync: App activation processing completed")
    }
    
    /// Handle app entering background
    func handleAppWillEnterBackground() {
        print("📱 Foreground sync: App entering background")
        // No specific action needed - BackgroundTaskManager handles scheduling
    }
    
    // MARK: - Core Processing Logic
    
    /// Process pending uploads immediately in foreground
    private func processPendingUploads() async {
        let pendingItems = PersistentUploadQueue.shared.getPendingItems(limit: 200)
        
        guard !pendingItems.isEmpty else {
            print("✅ No pending uploads to process")
            return
        }
        
        print("📦 Processing \(pendingItems.count) pending uploads immediately")
        
        // Group by data type for efficient batch uploads
        let groupedItems = Dictionary(grouping: pendingItems, by: { $0.dataType })
        
        var totalSuccessful = 0
        var totalProcessed = 0
        
        for (dataType, items) in groupedItems {
            print("🔄 Processing \(items.count) \(dataType) items")
            
            // Convert items back to samples format
            var samples: [[String: Any]] = []
            
            for item in items {
                do {
                    if let sampleArray = try JSONSerialization.jsonObject(with: item.sampleData) as? [[String: Any]] {
                        samples.append(contentsOf: sampleArray)
                    }
                } catch {
                    print("❌ Failed to decode sample data: \(error)")
                }
            }
            
            guard !samples.isEmpty else {
                print("⚠️ No valid samples decoded for \(dataType)")
                continue
            }
            
            // Attempt foreground upload
            let success = await attemptForegroundUpload(samples: samples, dataType: dataType)
            
            if success {
                // Mark as uploaded and update anchors
                for item in items {
                    await PersistentUploadQueue.shared.markAsUploaded(item.id)
                    // Update anchor if we have anchor data
                    if let anchorData = item.anchorData {
                        await updateAnchorFromQueueItem(dataType: dataType, anchorData: anchorData)
                    }
                }
                print("✅ Foreground sync: uploaded \(items.count) \(dataType) items")
                totalSuccessful += items.count
            } else {
                // Increment retry count for failed items
                for item in items {
                    await PersistentUploadQueue.shared.markAsFailed(item.id)
                }
                print("❌ Foreground sync: failed to upload \(dataType)")
            }
            
            totalProcessed += items.count
        }
        
        // Notify about results
        await notifyHealthModuleOfResults(successful: totalSuccessful, total: totalProcessed)
    }
    
    /// Check for data missed while app was closed
    private func recheckForMissedData() async {
        print("🔍 Checking for missed data while app was closed")
        
        guard let healthModule = self.healthModule else {
            print("⚠️ No health module available for missed data check")
            return
        }
        
        let monitoredTypes = getMonitoredHealthKitTypes()
        var foundMissedData = false
        
        for type in monitoredTypes {
            do {
                // Query recent data (last 4 hours) to check for anything we might have missed
                let recentSamples = try await queryRecentDataForMissedCheck(type: type)
                
                if !recentSamples.isEmpty {
                    print("🔍 Found \(recentSamples.count) potentially missed \(type.identifier) samples")
                    
                    // Try immediate upload of missed data
                    let uploadSuccess = await attemptForegroundUpload(samples: recentSamples, dataType: type.identifier)
                    
                    if uploadSuccess {
                        print("✅ Successfully uploaded missed \(type.identifier) data")
                        foundMissedData = true
                    } else {
                        print("⚠️ Failed to upload missed data - it will be queued for retry")
                        // Queue the missed data
                        let userId = getCurrentUserId()
                        await PersistentUploadQueue.shared.enqueue(
                            samples: recentSamples,
                            dataType: type.identifier,
                            userId: userId,
                            priority: .high
                        )
                    }
                }
                
            } catch {
                print("❌ Error checking for missed \(type.identifier) data: \(error)")
            }
        }
        
        if !foundMissedData {
            print("✅ No missed data detected")
        }
    }
    
    /// Verify sync integrity (optional health check)
    private func verifySyncIntegrity() async {
        // Simple integrity check - verify queue is in good state
        let stats = PersistentUploadQueue.shared.getQueueStatistics()
        let pendingCount = stats["pending"] ?? 0
        let failedCount = stats["failed"] ?? 0
        
        if pendingCount > 1000 {
            print("⚠️ High number of pending items (\(pendingCount)) - possible sync issue")
        }
        
        if failedCount > 500 {
            print("⚠️ High number of failed items (\(failedCount)) - possible connectivity issue")
        }
        
        print("📊 Queue health: \(pendingCount) pending, \(failedCount) failed")
    }
    
    // MARK: - Helper Methods
    
    /// Attempt foreground upload with appropriate timeout
    private func attemptForegroundUpload(samples: [[String: Any]], dataType: String) async -> Bool {
        do {
            // Use moderate timeout for foreground uploads
            let uploadTask = Task {
                await uploader.uploadRawSamples(samples, batchType: "foreground")
            }
            
            // 15 second timeout for foreground uploads
            let result = try await withThrowingTaskGroup(of: Bool.self) { group in
                group.addTask { await uploadTask.value }
                group.addTask {
                    try await Task.sleep(nanoseconds: 15_000_000_000) // 15 seconds
                    throw TimeoutError.uploadTimeout
                }
                return try await group.next()!
            }
            
            return result
            
        } catch {
            print("❌ Foreground upload failed: \(error)")
            return false
        }
    }
    
    /// Update anchor from queued item data
    private func updateAnchorFromQueueItem(dataType: String, anchorData: Data) async {
        // Notify the main health module to update the anchor
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: NSNotification.Name("UpdateAnchorFromQueue"),
                object: nil,
                userInfo: [
                    "dataType": dataType,
                    "anchorData": anchorData
                ]
            )
        }
    }
    
    /// Query recent data for missed data detection
    private func queryRecentDataForMissedCheck(type: HKSampleType) async throws -> [[String: Any]] {
        guard let healthModule = self.healthModule else {
            throw NSError(domain: "ForegroundSync", code: 1, userInfo: [NSLocalizedDescriptionKey: "No health module available"])
        }
        
        // Query last 4 hours of data
        return try await healthModule.queryRecentDataForComponent(type: type, hours: 4)
    }
    
    /// Get monitored HealthKit types
    private func getMonitoredHealthKitTypes() -> [HKSampleType] {
        guard let healthModule = self.healthModule else {
            return []
        }
        
        return healthModule.getMonitoredTypes()
    }
    
    /// Get current user ID
    private func getCurrentUserId() -> String {
        do {
            let config = try UploadConfig.load()
            return config.userId
        } catch {
            print("⚠️ Could not load user ID: \(error)")
            return "unknown_user"
        }
    }
    
    /// Notify health module about sync results
    private func notifyHealthModuleOfResults(successful: Int, total: Int) async {
        await MainActor.run {
            // Send event to React Native layer
            healthModule?.sendEvent("onSyncEvent", [
                "phase": "foreground_completed",
                "message": "Processed \(total) pending items, \(successful) successful",
                "counts": [
                    "processed": total,
                    "successful": successful,
                    "failed": total - successful
                ]
            ])
        }
    }
    
    // MARK: - Public Testing Interface
    
    /// Force process queue (for testing/debugging)
    public func forceProcessQueue() async -> [String: Any] {
        print("🧪 Force processing queue for foreground testing")
        
        let startTime = Date()
        await processPendingUploads()
        let duration = Date().timeIntervalSince(startTime)
        
        let stats = PersistentUploadQueue.shared.getQueueStatistics()
        
        return [
            "duration": duration,
            "queueStats": stats,
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ]
    }
    
    /// Get current sync status
    public func getSyncStatus() -> [String: Any] {
        let stats = PersistentUploadQueue.shared.getQueueStatistics()
        
        return [
            "queueStatistics": stats,
            "hasHealthModule": healthModule != nil,
            "lastUpdate": ISO8601DateFormatter().string(from: Date())
        ]
    }
}
