import Foundation
import BackgroundTasks
import UIKit

/// Manages iOS background tasks for health data sync
/// Uses two-phase approach: Early registration + Later activation to satisfy Apple's timing requirements
/// Handles both BGAppRefreshTask (frequent, short) and BGProcessingTask (occasional, longer)
class BackgroundTaskManager {
    static let shared = BackgroundTaskManager()
    
    // Background task identifiers (must match Info.plist)
    private let appRefreshTaskId = "com.lichenapp.healthsync.refresh"
    private let processingTaskId = "com.lichenapp.healthsync.process"
    
    private weak var healthModule: ExpoHealthkitBridgeModule?
    private let uploader = HealthDataUploader()
    
    // MARK: - Two-Phase State Management
    
    /// Tracks whether background tasks are activated and should do real work
    /// - false: Tasks are registered but do nothing (just complete immediately)
    /// - true: Tasks perform actual background sync work
    private var isActivated: Bool = false
    
    // MARK: - Initialization
    
    private init() {}
    
    /// Set reference to health module for coordination
    func setHealthModule(_ module: ExpoHealthkitBridgeModule) {
        self.healthModule = module
    }
    
    // MARK: - Background Task Registration
    // 
    // NOTE: Background task registration now happens in BackgroundTaskAppDelegateSubscriber.swift
    // during iOS app launch (AppDelegate timing). This class only handles activation/deactivation.
    //
    // The AppDelegate subscriber registers handlers that delegate back to this class's
    // handleConditionalAppRefreshTask() and handleConditionalProcessingTask() methods.
    
    // MARK: - Phase 2: Later Background Task Activation (Heavyweight)
    
    /// Activate background tasks to perform real work
    /// This is called later when user enables background sync
    /// Heavy initialization happens here, not during registration
    func activateBackgroundTasks() {
        print("🚀 BG_TASK_MANAGER: Activating background tasks (Phase 2)...")
        
        // Set activation flag - handlers will now do real work
        isActivated = true
        
        print("✅ BG_TASK_MANAGER: Background tasks ACTIVATED - ready for real work")
    }
    
    /// Deactivate background tasks (when user disables sync)
    func deactivateBackgroundTasks() {
        print("🛑 BG_TASK_MANAGER: Deactivating background tasks...")
        
        // Clear activation flag - handlers will just complete immediately
        isActivated = false
        
        print("✅ BG_TASK_MANAGER: Background tasks DEACTIVATED - will complete immediately")
    }
    
    // MARK: - Task Scheduling
    
    /// Schedule next background refresh (called after HealthKit updates)
    func scheduleAppRefreshTask() {
        let request = BGAppRefreshTaskRequest(identifier: appRefreshTaskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes minimum
        
        do {
            try BGTaskScheduler.shared.submit(request)
            print("🔄 BG_TASK_MANAGER: 📅 Scheduled app refresh task for +15 minutes")
        } catch {
            print("🔄 BG_TASK_MANAGER: " + "❌ Failed to schedule app refresh task: \(error)")
        }
    }
    
    /// Schedule processing task for larger queue processing
    func scheduleProcessingTask() {
        let request = BGProcessingTaskRequest(identifier: processingTaskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60) // 1 hour minimum
        request.requiresExternalPower = false // Allow on battery
        request.requiresNetworkConnectivity = true
        
        do {
            try BGTaskScheduler.shared.submit(request)
            print("🔄 BG_TASK_MANAGER: " + "📅 Scheduled processing task for +1 hour")
        } catch {
            print("🔄 BG_TASK_MANAGER: " + "❌ Failed to schedule processing task: \(error)")
        }
    }
    
    // MARK: - Conditional Background Task Handlers
    
    /// Handle app refresh task conditionally based on activation state
    /// This handler is registered by AppDelegate subscriber but only does real work when activated
    /// PUBLIC: Called by BackgroundTaskAppDelegateSubscriber during BGTaskScheduler execution
    public func handleConditionalAppRefreshTask(_ task: BGAppRefreshTask) {
        print("🔄 BG_TASK_MANAGER: BGAppRefreshTask triggered - checking activation state...")
        
        // Check if background tasks are activated
        guard isActivated else {
            print("🔄 BG_TASK_MANAGER: BGAppRefreshTask INACTIVE - completing immediately")
            task.setTaskCompleted(success: true)
            return
        }
        
        // Tasks are activated - do real work
        print("🔄 BG_TASK_MANAGER: BGAppRefreshTask ACTIVE - performing real work")
        handleActiveAppRefreshTask(task)
    }
    
    /// Handle processing task conditionally based on activation state  
    /// This handler is registered by AppDelegate subscriber but only does real work when activated
    /// PUBLIC: Called by BackgroundTaskAppDelegateSubscriber during BGTaskScheduler execution
    public func handleConditionalProcessingTask(_ task: BGProcessingTask) {
        print("🔄 BG_TASK_MANAGER: BGProcessingTask triggered - checking activation state...")
        
        // Check if background tasks are activated
        guard isActivated else {
            print("🔄 BG_TASK_MANAGER: BGProcessingTask INACTIVE - completing immediately")
            task.setTaskCompleted(success: true)
            return
        }
        
        // Tasks are activated - do real work
        print("🔄 BG_TASK_MANAGER: BGProcessingTask ACTIVE - performing real work")
        handleActiveProcessingTask(task)
    }
    
    // MARK: - Active Background Task Handlers (Real Work)
    
    /// Handle active app refresh task (30 seconds typical) - REAL WORK
    private func handleActiveAppRefreshTask(_ task: BGAppRefreshTask) {
        print("🔄 BG_TASK_MANAGER: 🚀 Active BGAppRefreshTask started")
        
        // Schedule next refresh
        scheduleAppRefreshTask()
        
        let startTime = Date()
        
        // Set expiration handler
        task.expirationHandler = {
            print("🔄 BG_TASK_MANAGER: ⏰ Active BGAppRefreshTask expired")
            task.setTaskCompleted(success: false)
        }
        
        // Process small batch from queue
        Task {
            let success = await processSmallBatch()
            let duration = Date().timeIntervalSince(startTime)
            
            print("🔄 BG_TASK_MANAGER: 🏁 Active BGAppRefreshTask completed in \(String(format: "%.2f", duration))s - Success: \(success)")
            task.setTaskCompleted(success: success)
        }
    }
    
    /// Handle active processing task (up to 1 minute+) - REAL WORK
    private func handleActiveProcessingTask(_ task: BGProcessingTask) {
        print("🔄 BG_TASK_MANAGER: 🚀 Active BGProcessingTask started")
        
        // Schedule next processing task
        scheduleProcessingTask()
        
        let startTime = Date()
        
        // Set expiration handler
        task.expirationHandler = {
            print("🔄 BG_TASK_MANAGER: ⏰ Active BGProcessingTask expired")
            task.setTaskCompleted(success: false)
        }
        
        // Process larger batch from queue
        Task {
            let success = await processLargeBatch()
            let duration = Date().timeIntervalSince(startTime)
            
            print("🔄 BG_TASK_MANAGER: 🏁 Active BGProcessingTask completed in \(String(format: "%.2f", duration))s - Success: \(success)")
            task.setTaskCompleted(success: success)
        }
    }
    
    // MARK: - Queue Processing Logic
    
    /// Process small batch (for BGAppRefreshTask)
    private func processSmallBatch() async -> Bool {
        let pendingItems = PersistentUploadQueue.shared.getPendingItems(limit: 20) // Small batch
        
        guard !pendingItems.isEmpty else {
            print("🔄 BG_TASK_MANAGER: " + "✅ No pending items for small batch")
            return true
        }
        
        print("🔄 BG_TASK_MANAGER: " + "📦 Processing \(pendingItems.count) items in small batch")
        
        var successCount = 0
        
        for item in pendingItems {
            do {
                // Decode samples
                guard let samples = try JSONSerialization.jsonObject(with: item.sampleData) as? [[String: Any]] else {
                    await PersistentUploadQueue.shared.markAsFailed(item.id)
                    continue
                }
                
                // Try upload with short timeout
                let success = await attemptBackgroundUpload(samples: samples, timeoutSeconds: 10)
                
                if success {
                    await PersistentUploadQueue.shared.markAsUploaded(item.id)
                    
                    // Update anchor if available
                    if let anchorData = item.anchorData {
                        await updateAnchorFromQueueItem(dataType: item.dataType, anchorData: anchorData)
                    }
                    
                    successCount += 1
                    print("🔄 BG_TASK_MANAGER: " + "✅ Uploaded \(samples.count) \(item.dataType) samples")
                } else {
                    await PersistentUploadQueue.shared.markAsFailed(item.id)
                    print("🔄 BG_TASK_MANAGER: " + "❌ Failed to upload \(item.dataType) samples")
                }
                
            } catch {
                await PersistentUploadQueue.shared.markAsFailed(item.id)
                print("🔄 BG_TASK_MANAGER: " + "❌ Error processing queue item: \(error)")
            }
        }
        
        print("🔄 BG_TASK_MANAGER: " + "🎯 Small batch: \(successCount)/\(pendingItems.count) successful")
        return successCount > 0
    }
    
    /// Process larger batch (for BGProcessingTask)  
    private func processLargeBatch() async -> Bool {
        let pendingItems = PersistentUploadQueue.shared.getPendingItems(limit: 100) // Larger batch
        
        guard !pendingItems.isEmpty else {
            print("🔄 BG_TASK_MANAGER: " + "✅ No pending items for large batch")
            return true
        }
        
        print("🔄 BG_TASK_MANAGER: " + "📦 Processing \(pendingItems.count) items in large batch")
        
        // Group items by data type for efficient batch uploads
        let groupedItems = Dictionary(grouping: pendingItems, by: { $0.dataType })
        
        var totalSuccessful = 0
        var totalProcessed = 0
        
        for (dataType, items) in groupedItems {
            print("🔄 BG_TASK_MANAGER: " + "🔄 Processing \(items.count) \(dataType) items as batch")
            
            // Combine all samples for this data type
            var allSamples: [[String: Any]] = []
            
            for item in items {
                do {
                    if let samples = try JSONSerialization.jsonObject(with: item.sampleData) as? [[String: Any]] {
                        allSamples.append(contentsOf: samples)
                    }
                } catch {
                    print("🔄 BG_TASK_MANAGER: " + "❌ Failed to decode sample data: \(error)")
                }
            }
            
            guard !allSamples.isEmpty else {
                print("🔄 BG_TASK_MANAGER: " + "⚠️ No valid samples for \(dataType)")
                continue
            }
            
            // Attempt batch upload with longer timeout
            let success = await attemptBackgroundUpload(samples: allSamples, timeoutSeconds: 30)
            
            if success {
                // Mark all items as uploaded
                for item in items {
                    await PersistentUploadQueue.shared.markAsUploaded(item.id)
                    
                    // Update anchor if available (use the latest one)
                    if let anchorData = item.anchorData {
                        await updateAnchorFromQueueItem(dataType: item.dataType, anchorData: anchorData)
                    }
                }
                
                totalSuccessful += items.count
                print("🔄 BG_TASK_MANAGER: " + "✅ Batch uploaded \(allSamples.count) \(dataType) samples")
            } else {
                // Mark all items as failed
                for item in items {
                    await PersistentUploadQueue.shared.markAsFailed(item.id)
                }
                print("🔄 BG_TASK_MANAGER: " + "❌ Failed to upload \(dataType) batch")
            }
            
            totalProcessed += items.count
        }
        
        print("🔄 BG_TASK_MANAGER: " + "🎯 Large batch: \(totalSuccessful)/\(totalProcessed) items successful")
        return totalSuccessful > 0
    }
    
    // MARK: - Upload Helpers
    
    /// Attempt background upload with timeout
    private func attemptBackgroundUpload(samples: [[String: Any]], timeoutSeconds: Int) async -> Bool {
        do {
            let uploadTask = Task {
                await uploader.uploadRawSamples(samples, batchType: "background")
            }
            
            // Apply timeout
            let result = try await withThrowingTaskGroup(of: Bool.self) { group in
                group.addTask { await uploadTask.value }
                group.addTask {
                    try await Task.sleep(nanoseconds: UInt64(timeoutSeconds) * 1_000_000_000)
                    throw TimeoutError.uploadTimeout
                }
                return try await group.next()!
            }
            
            return result
            
        } catch {
            print("🔄 BG_TASK_MANAGER: " + "❌ Background upload failed: \(error)")
            return false
        }
    }
    
    /// Update anchor from queued item data
    private func updateAnchorFromQueueItem(dataType: String, anchorData: Data) async {
        await healthModule?.updateAnchorFromQueueItem(dataType: dataType, anchorData: anchorData)
    }
    
    // MARK: - App Lifecycle Handlers
    
    /// Handle app entering background
    func handleAppDidEnterBackground() {
        print("🔄 BG_TASK_MANAGER: " + "📱 App entered background - scheduling tasks")
        scheduleAppRefreshTask()
        scheduleProcessingTask()
    }
    
    /// Handle app becoming active
    func handleAppDidBecomeActive() {
        print("🔄 BG_TASK_MANAGER: " + "📱 App became active")
        // ForegroundSyncManager handles the heavy lifting
    }
    
    // MARK: - Status and Debugging
    
    /// Get comprehensive background task status for debugging
    func getSchedulingStatus() -> [String: Any] {
        // Note: iOS doesn't provide direct access to scheduled task status
        return [
            "appRefreshTaskId": appRefreshTaskId,
            "processingTaskId": processingTaskId,
            "backgroundAppRefreshAvailable": UIApplication.shared.backgroundRefreshStatus == .available,
            "isActivated": isActivated, // NEW: Activation state
            "activationState": isActivated ? "ACTIVE - Tasks do real work" : "INACTIVE - Tasks complete immediately",
            "hasHealthModule": healthModule != nil,
            "lastUpdate": ISO8601DateFormatter().string(from: Date())
        ]
    }
}