import Foundation
import ExpoModulesCore
import BackgroundTasks

/// ExpoAppDelegateSubscriber for BGTaskScheduler registration during app launch
/// This ensures background tasks are registered at the correct iOS timing
/// while keeping ExpoModulesCore module initialization lightweight
public class BackgroundTaskAppDelegateSubscriber: ExpoAppDelegateSubscriber {
    
    // Background task identifiers (must match app.config.js)
    private let appRefreshTaskId = "com.lichenapp.healthsync.refresh"
    private let processingTaskId = "com.lichenapp.healthsync.process"
    
    /// Called during iOS app launch - perfect timing for BGTaskScheduler registration
    /// This satisfies Apple's requirement: "All launch handlers must be registered before application finishes launching"
    public func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        
        print("🚀 ExpoAppDelegateSubscriber: Registering background task slots during app launch")
        
        // Register background task handlers early - they start INACTIVE
        // Handlers will check BackgroundTaskManager.shared.isActivated before doing real work
        self.registerBackgroundTaskSlots()
        
        print("✅ ExpoAppDelegateSubscriber: Background task slots registered successfully")
        print("ℹ️ ExpoAppDelegateSubscriber: Tasks are INACTIVE until user enables background sync")
        
        // Return true to allow other AppDelegate subscribers to run
        return true
    }
    
    /// Register background task slots with iOS during app launch
    /// Handlers are registered but inactive until BackgroundTaskManager activation
    private func registerBackgroundTaskSlots() {
        print("🔄 ExpoAppDelegateSubscriber: Registering BGTaskScheduler handlers...")
        
        // Register app refresh task slot (frequent, short)
        // Handler starts inactive - will check isActivated flag before doing work
        BGTaskScheduler.shared.register(forTaskWithIdentifier: appRefreshTaskId, using: nil) { task in
            print("🔄 ExpoAppDelegateSubscriber: BGAppRefreshTask triggered - delegating to BackgroundTaskManager")
            BackgroundTaskManager.shared.handleConditionalAppRefreshTask(task as! BGAppRefreshTask)
        }
        
        // Register processing task slot (occasional, longer)  
        // Handler starts inactive - will check isActivated flag before doing work
        BGTaskScheduler.shared.register(forTaskWithIdentifier: processingTaskId, using: nil) { task in
            print("🔄 ExpoAppDelegateSubscriber: BGProcessingTask triggered - delegating to BackgroundTaskManager")
            BackgroundTaskManager.shared.handleConditionalProcessingTask(task as! BGProcessingTask)
        }
        
        print("✅ ExpoAppDelegateSubscriber: BGTaskScheduler handlers registered")
        print("🎯 ExpoAppDelegateSubscriber: Background tasks will remain inactive until BackgroundTaskManager activation")
    }
}
