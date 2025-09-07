import Foundation
import BackgroundTasks
import HealthKit

/// Manages background task scheduling and execution for health data sync
/// Uses BGTaskScheduler for system-optimal background processing
class BackgroundTaskManager {
    static let shared = BackgroundTaskManager()
    
    private let taskIdentifier = "com.lichenapp.health-data-sync"
    private let operationQueue = OperationQueue()
    private weak var healthModule: ExpoHealthkitBridgeModule? // Weak reference to prevent retain cycles
    
    // MARK: - Initialization
    
    private init() {
        operationQueue.maxConcurrentOperationCount = 1
        operationQueue.qualityOfService = .utility
    }
    
    // MARK: - Public Interface
    
    /// Set reference to health module for coordination
    func setHealthModule(_ module: ExpoHealthkitBridgeModule) {
        self.healthModule = module
    }
    
    /// Register background tasks with the system
    func registerBackgroundTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: taskIdentifier,
            using: nil
        ) { [weak self] task in
            self?.handleHealthDataSync(task: task as! BGProcessingTask)
        }
        
        print("✅ Background tasks registered for health data sync")
    }
    
    /// Schedule frequent background sync (every hour when possible)
    public func scheduleFrequentSync() {
        let request = BGProcessingTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60) // 1 hour
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        
        do {
            try BGTaskScheduler.shared.submit(request)
            print("📅 Background sync scheduled for ~1 hour from now")
        } catch {
            print("❌ Failed to schedule background sync: \(error)")
        }
    }
    
    /// Handle background task execution
    private func handleHealthDataSync(task: BGProcessingTask) {
        print("🔄 Background health data sync started")
        
        // Schedule next sync before processing
        scheduleFrequentSync()
        
        // Create operation to process queued items
        let syncOperation = QueuedSyncOperation()
        syncOperation.completionBlock = {
            print("🏁 Background sync operation completed")
            task.setTaskCompleted(success: !syncOperation.isCancelled)
        }
        
        // Handle task expiration
        task.expirationHandler = {
            print("⏰ Background sync task expired - cancelling operation")
            syncOperation.cancel()
        }
        
        // Execute the sync operation
        operationQueue.addOperation(syncOperation)
    }
    
    // MARK: - App Lifecycle Integration
    
    /// Handle app becoming active
    func handleAppDidBecomeActive() {
        print("📱 App became active - background task manager notified")
        // Cancel any background scheduling since foreground sync will handle it
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskIdentifier)
    }
    
    /// Handle app entering background
    func handleAppDidEnterBackground() {
        print("📱 App entered background - checking if sync needed")
        
        // Only schedule background task if there are pending items
        let stats = PersistentUploadQueue.shared.getQueueStatistics()
        let pendingCount = stats["pending"] ?? 0
        let failedCount = stats["failed"] ?? 0
        
        if pendingCount > 0 || failedCount > 0 {
            scheduleFrequentSync()
            print("📱 Background sync scheduled due to \(pendingCount) pending + \(failedCount) failed items")
        } else {
            print("📱 No pending items - background sync not needed")
        }
    }
    
    // MARK: - Testing and Status
    
    /// Process queue immediately (for testing/debugging)
    public func processQueueNow() async -> [String: Any] {
        print("🧪 Force processing queue for testing")
        
        let startTime = Date()
        let operation = QueuedSyncOperation()
        
        return await withCheckedContinuation { continuation in
            operation.completionBlock = {
                let duration = Date().timeIntervalSince(startTime)
                let result = [
                    "success": !operation.isCancelled,
                    "duration": duration,
                    "timestamp": ISO8601DateFormatter().string(from: Date()),
                    "itemsProcessed": operation.getProcessedCount()
                ] as [String: Any]
                
                continuation.resume(returning: result)
            }
            
            operationQueue.addOperation(operation)
        }
    }
    
    /// Get scheduling status for debugging
    public func getSchedulingStatus() -> [String: Any] {
        return [
            "taskIdentifier": taskIdentifier,
            "operationQueueCount": operationQueue.operationCount,
            "backgroundTasksEnabled": true, // BGTaskScheduler is available
            "queueStats": PersistentUploadQueue.shared.getQueueStatistics()
        ]
    }
    
    /// Get detailed status information
    public func getDetailedStatus() -> [String: Any] {
        let queueStats = PersistentUploadQueue.shared.getQueueStatistics()
        
        return [
            "backgroundTasksEnabled": true,
            "taskIdentifier": taskIdentifier,
            "operationQueue": [
                "operationCount": operationQueue.operationCount,
                "isSuspended": operationQueue.isSuspended,
                "qualityOfService": operationQueue.qualityOfService.rawValue
            ],
            "queueStatistics": queueStats,
            "lastUpdate": ISO8601DateFormatter().string(from: Date())
        ]
    }
}

// MARK: - Background Sync Operation

/// Operation that processes queued upload items in background
class QueuedSyncOperation: Operation, @unchecked Sendable {
    private var processedCount = 0
    private let uploader = HealthDataUploader()
    
    override func main() {
        guard !isCancelled else { return }
        
        print("🔄 Starting queued sync operation")
        
        // Run async processing in sync context
        let semaphore = DispatchSemaphore(value: 0)
        
        Task {
            await self.processQueuedItems()
            semaphore.signal()
        }
        
        semaphore.wait()
        
        print("✅ Queued sync operation finished - processed \(processedCount) items")
    }
    
    /// Main processing logic
    private func processQueuedItems() async {
        let pendingItems = PersistentUploadQueue.shared.getPendingItems(limit: 100)
        
        guard !pendingItems.isEmpty else {
            print("📭 No pending items to process in background")
            return
        }
        
        print("📦 Processing \(pendingItems.count) queued items in background")
        
        // Group items by data type for efficient batch processing
        let groupedItems = Dictionary(grouping: pendingItems, by: { $0.dataType })
        
        for (dataType, items) in groupedItems {
            guard !isCancelled else { break }
            
            print("🔄 Processing \(items.count) \(dataType) items")
            let success = await processQueuedItems(items: items, dataType: dataType)
            
            if success {
                print("✅ Background upload successful for \(dataType)")
                processedCount += items.count
            } else {
                print("❌ Background upload failed for \(dataType)")
            }
        }
        
        // Clean up old uploaded items
        let cleanupDate = Date().addingTimeInterval(-7 * 24 * 3600) // 7 days ago
        await PersistentUploadQueue.shared.cleanupOldItems(olderThan: cleanupDate)
    }
    
    /// Process specific items for a data type
    private func processQueuedItems(items: [PersistentUploadQueue.QueueItem], dataType: String) async -> Bool {
        do {
            // Convert queue items back to sample format
            var samples: [[String: Any]] = []
            
            for item in items {
                if let sampleArray = try JSONSerialization.jsonObject(with: item.sampleData) as? [[String: Any]] {
                    samples.append(contentsOf: sampleArray)
                }
            }
            
            guard !samples.isEmpty else {
                print("⚠️ No valid samples decoded from queue items")
                return false
            }
            
            // Attempt upload with longer timeout for background
            let success = await performBackgroundUpload(samples: samples, dataType: dataType)
            
            if success {
                // Mark all items as uploaded and update anchors
                for item in items {
                    await PersistentUploadQueue.shared.markAsUploaded(item.id)
                    
                    // Update anchor if we have anchor data
                    if let anchorData = item.anchorData {
                        await updateAnchorFromQueueItem(dataType: dataType, anchorData: anchorData)
                    }
                }
                return true
            } else {
                // Mark items as failed (increments retry count)
                for item in items {
                    await PersistentUploadQueue.shared.markAsFailed(item.id)
                }
                return false
            }
            
        } catch {
            print("❌ Error processing queued items: \(error)")
            return false
        }
    }
    
    /// Perform upload with background-appropriate timeout
    private func performBackgroundUpload(samples: [[String: Any]], dataType: String) async -> Bool {
        do {
            // Longer timeout for background uploads
            let uploadTask = Task {
                await uploader.uploadRawSamples(samples, batchType: "background")
            }
            
            // 30 second timeout for background uploads
            let result = try await withThrowingTaskGroup(of: Bool.self) { group in
                group.addTask { await uploadTask.value }
                group.addTask {
                    try await Task.sleep(nanoseconds: 30_000_000_000) // 30 seconds
                    throw TimeoutError.uploadTimeout
                }
                return try await group.next()!
            }
            
            return result
            
        } catch {
            print("❌ Background upload failed: \(error)")
            return false
        }
    }
    
    /// Update anchor from queued item (posts notification for coordination)
    private func updateAnchorFromQueueItem(dataType: String, anchorData: Data) async {
        // Post notification to main health module to update anchor
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
    
    /// Get count of processed items (for reporting)
    func getProcessedCount() -> Int {
        return processedCount
    }
}
