import ExpoModulesCore
import HealthKit
import Foundation
import BackgroundTasks
import UIKit
// Custom logging function for easy filtering
func log(_ message: String) {
    print("🔍 HEALTHKIT_DEBUG: \(message)")
}

public class ExpoHealthkitBridgeModule: Module {
  private let healthStore = HKHealthStore()
  private var observerQueries: [HKObserverQuery] = []
  private var anchors: [String: HKQueryAnchor] = [:]
  // Temporary storage for anchors before upload confirmation
  //HKQueryAnchor is a bookmark that lets you efficiently fetch only incremental HealthKit updates, avoiding reprocessing all past data.
  private var tempAnchors: [String: HKQueryAnchor] = [:]
  private let uploader = HealthDataUploader()
  
  public func definition() -> ModuleDefinition {
    Name("ExpoHealthkitBridge")

    Events("onSyncEvent")

    AsyncFunction("requestPermissions") { (types: [String]) -> [String: [String]] in
      return try await self.requestPermissions(types: types)
    }

    AsyncFunction("startBackgroundSync") { (types: [String]) in
      try await self.startBackgroundSync(types: types)
    }

    AsyncFunction("stopBackgroundSync") {
      await self.stopBackgroundSync()
    }

    AsyncFunction("syncNow") { (types: [String]) -> [String: Int] in
      return try await self.syncNow(types: types)
    }

    AsyncFunction("getSyncStatus") { () -> [String: Any?] in
      return await self.getSyncStatus()
    }

    AsyncFunction("configureUploader") { (apiUrl: String, userId: String, authHeaders: [String: String]) in
      try self.uploader.configure(apiUrl: apiUrl, userId: userId, authHeaders: authHeaders)
    }

    AsyncFunction("uploadDateRange") { (types: [String], startDateISO: String, endDateISO: String) -> [String: Any] in
      return try await self.uploadDateRange(types: types, startDateISO: startDateISO, endDateISO: endDateISO)
    }


    AsyncFunction("queryECGData") { (startDateISO: String, endDateISO: String, maxSamples: Int) -> [[String: Any]] in
      return try await self.queryECGData(startDateISO: startDateISO, endDateISO: endDateISO, maxSamples: maxSamples)
    }



    // Add these to your module definition
AsyncFunction("queryDataInRange") { (types: [String], startDateISO: String, endDateISO: String) -> [String: [[String: Any]]] in
  return try await self.queryDataInRange(types: types, startDateISO: startDateISO, endDateISO: endDateISO)
}

AsyncFunction("resetAnchorsAndSync") { (types: [String]) -> [String: Int] in
  // Clear all stored anchors to fetch all data
  self.anchors.removeAll()
  self.saveAnchors()
  log("Cleared all anchors - will fetch ALL historical data")
  
  return try await self.syncNow(types: types)
}

AsyncFunction("saveDataLocally") { (samples: [[String: Any]]) in
  await self.saveDataLocally(samples: samples)
}

AsyncFunction("getLocalData") { (types: [String], limit: Int) -> [[String: Any]] in
  return await self.getLocalData(types: types, limit: limit)
}

    AsyncFunction("clearLocalData") { (beforeDate: String?) in
      await self.clearLocalData(beforeDate: beforeDate)
    }
    
    // MARK: - Testing and Validation Functions
    
    AsyncFunction("getQueueStatus") { () -> [String: Any] in
      return await self.getQueueStatus()
    }
    
    AsyncFunction("getSyncHealthReport") { () -> String in
      return SyncAnalytics.shared.generateHealthReport()
    }
    
    AsyncFunction("forceSyncProcessing") { () -> [String: Any] in
      return await self.forceSyncProcessing()
    }
    
    AsyncFunction("validateSyncIntegrity") { () -> [String: Any] in
      return await self.validateSyncIntegrity()
    }
    

AsyncFunction("queryRecentDataSafe") { (types: [String], hours: Int) -> [String: [[String: Any]]] in
  let endDate = Date()
  let startDate = Calendar.current.date(byAdding: .hour, value: -hours, to: endDate) ?? endDate
  
  return try await self.queryDataInRange(
    types: types, 
    startDateISO: ISO8601DateFormatter().string(from: startDate),
    endDateISO: ISO8601DateFormatter().string(from: endDate)
  )
}


//-----------------------------------------------DIAGNOSTIC FUNCTIONS-----------------------------------------------
AsyncFunction("runDiagnostics") { () -> [String: Any] in
    var diagnostics: [String: Any] = [:]
    
    // 1. Check HealthKit authorization
    let types = self.getDefaultHealthKitTypes()
    var authStatus: [String: String] = [:]
    for type in types {
        let status = self.healthStore.authorizationStatus(for: type)
        authStatus[type.identifier] = self.authorizationStatusDescription(status)
    }
    diagnostics["healthkit_auth"] = authStatus
    
    // 2. Check background delivery status
    diagnostics["observer_queries_active"] = self.observerQueries.count
    
    // 3. Check queue status
    let queueStats = PersistentUploadQueue.shared.getQueueStatistics()
    diagnostics["queue_stats"] = queueStats
    
    // 4. Check anchors
    diagnostics["anchors_count"] = self.anchors.count
    diagnostics["temp_anchors_count"] = self.tempAnchors.count
    
    // 5. Check background task
    diagnostics["background_task_status"] = BackgroundTaskManager.shared.getSchedulingStatus()
    
    // 6. Test immediate background task scheduling
    let bgRequest = BGProcessingTaskRequest(identifier: "com.lichenapp.health-data-sync")
    bgRequest.earliestBeginDate = Date(timeIntervalSinceNow: 60) // 1 minute
    bgRequest.requiresNetworkConnectivity = true
    
    do {
        try BGTaskScheduler.shared.submit(bgRequest)
        diagnostics["test_bg_schedule"] = "success - task scheduled for 1 minute"
        DiagnosticLogger.shared.log("diagnostic_bg_test_scheduled")
    } catch {
        diagnostics["test_bg_schedule"] = "failed: \(error.localizedDescription)"
        DiagnosticLogger.shared.log("diagnostic_bg_test_failed", details: ["error": error.localizedDescription])
    }
    
    // Send diagnostic summary
    DiagnosticLogger.shared.log("diagnostics_complete", details: diagnostics)
    
    return diagnostics
}

AsyncFunction("testBackgroundSync") { () -> [String: Any] in
    // Force trigger a background sync NOW
    DiagnosticLogger.shared.log("test_background_sync_triggered")
    
    var results: [String: Any] = [:]
    
    // Test each data type
    let types = self.getDefaultHealthKitTypes()
    for type in types.prefix(3) { // Test first 3 types only
        do {
            let samples = try await self.queryRecentDataForComponent(type: type, hours: 1)
            results[type.identifier] = [
                "samples_found": samples.count,
                "success": true
            ]
            
            if !samples.isEmpty {
                let uploadSuccess = await self.attemptImmediateUpload(samples: samples)
                results[type.identifier + "_upload"] = uploadSuccess
            }
            
        } catch {
            results[type.identifier] = [
                "error": error.localizedDescription,
                "success": false
            ]
        }
    }
    
    DiagnosticLogger.shared.log("test_background_sync_complete", details: results)
    
    return results
}

// Add new event for data streaming
Events("onSyncEvent")
Events("onDataStream")
    OnCreate {
      self.loadAnchors()

      // Configure diagnostic logger (This is logger for our entire application)
      if let config = try? UploadConfig.load() {
          DiagnosticLogger.shared.configure(apiUrl: config.apiUrl, userId: config.userId)
          DiagnosticLogger.shared.log("module_initialized", details: [
              "anchors_loaded": self.anchors.count,
              "config_exists": true
          ])
      }
      
      // Register background tasks for health data sync
      BackgroundTaskManager.shared.registerBackgroundTasks()
      
      // Set up coordination with all sync managers
      ForegroundSyncManager.shared.setHealthModule(self)
      BackgroundTaskManager.shared.setHealthModule(self)
      
      // Listen for anchor update notifications from background tasks
      self.setupNotificationListeners()
      
      // Set up app lifecycle notifications
      self.setupAppLifecycleNotifications()
    }

    OnDestroy {
      self.stopAllObservers()
      self.cleanupNotificationListeners()
      self.cleanupAppLifecycleNotifications()
    }
  }
  
  // MARK: - Notification Handling
  
  /// Set up notification listeners for component coordination
  private func setupNotificationListeners() {
    NotificationCenter.default.addObserver(
      forName: NSNotification.Name("UpdateAnchorFromQueue"),
      object: nil,
      queue: .main
    ) { [weak self] notification in
      guard let userInfo = notification.userInfo,
            let dataType = userInfo["dataType"] as? String,
            let anchorData = userInfo["anchorData"] as? Data else {
        log("❌ Invalid anchor update notification")
        return
      }
      
      Task {
        await self?.updateAnchorFromQueueItem(dataType: dataType, anchorData: anchorData)
      }
    }
    
    log("✅ Notification listeners set up")
  }
  
  /// Clean up notification listeners
  private func cleanupNotificationListeners() {
    NotificationCenter.default.removeObserver(self, name: NSNotification.Name("UpdateAnchorFromQueue"), object: nil)
    log("🧹 Notification listeners cleaned up")
  }
  
  /// Set up app lifecycle notification listeners
  private func setupAppLifecycleNotifications() {
    NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      Task {
        await ForegroundSyncManager.shared.handleAppBecameActive()
      }
      BackgroundTaskManager.shared.handleAppDidBecomeActive()
    }
    
    NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      ForegroundSyncManager.shared.handleAppWillEnterBackground()
      BackgroundTaskManager.shared.handleAppDidEnterBackground()
    }
    
    log("✅ App lifecycle notifications set up")
  }
  
  /// Clean up app lifecycle notification listeners
  private func cleanupAppLifecycleNotifications() {
    NotificationCenter.default.removeObserver(self, name: UIApplication.didBecomeActiveNotification, object: nil)
    NotificationCenter.default.removeObserver(self, name: UIApplication.didEnterBackgroundNotification, object: nil)
    log("🧹 App lifecycle notification listeners cleaned up")
  }

    private func requestPermissions(types: [String]) async throws -> [String: [String]] {
    print("🔍 DEBUG: requestPermissions called with types: \(types)")

    guard HKHealthStore.isHealthDataAvailable() else {
        print("❌ DEBUG: HealthKit not available on device")
        throw NSError(domain: "HealthKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "HealthKit not available"])
    }
    print("✅ DEBUG: HealthKit is available")

    let healthKitTypes = types.compactMap { typeString -> HKSampleType? in
        let type = self.healthKitTypeFromString(typeString)
        print("🔍 DEBUG: Converting \(typeString) to \(type?.identifier ?? "nil")")
        return type
    }
    //TODO: Add this to Javascript code later to request for this type as well
    // Add heartbeat series type for detailed beat-by-beat data
    var allTypesToRequest = Set(healthKitTypes)
    if #available(iOS 13.0, *) {
      allTypesToRequest.insert(HKSeriesType.heartbeat())
      print("✅ DEBUG: Added HKSeriesType.heartbeat() for beat-by-beat data")
    }
    print("✅ DEBUG: Converted to \(healthKitTypes.count) valid HealthKit types")

    let typesToRequest = allTypesToRequest
    
    // Check status BEFORE requesting
    print("🔍 DEBUG: Status BEFORE authorization request:")
    for type in healthKitTypes {
        let statusBefore = healthStore.authorizationStatus(for: type)
        print("🔍 DEBUG: BEFORE - \(type.identifier) has status: \(statusBefore.rawValue)")
    }
    
    do {
        print("🔍 DEBUG: About to request authorization...")
        try await healthStore.requestAuthorization(toShare: Set<HKSampleType>(), read: typesToRequest)
        print("✅ DEBUG: Authorization request completed")
        
        // Wait longer
        try await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
        
        print("🔍 DEBUG: Status AFTER authorization request (after 1 second delay):")

        var granted: [String] = []
        var denied: [String] = []

        for type in healthKitTypes {
        let status = healthStore.authorizationStatus(for: type)
        let typeString = type.identifier
        
        print("🔍 DEBUG: AFTER - Type \(typeString) has status: \(status.rawValue)")
        
        // Test if we can actually query data
        print("🔍 DEBUG: Testing if we can actually query \(typeString)...")
        let canQuery = await testDataAccess(for: type)
        
        // Use the actual query result instead of authorization status
        if canQuery {
            print("✅ DEBUG: \(typeString) - CAN QUERY DATA (Permission granted)")
            granted.append(typeString)
        } else {
            print("❌ DEBUG: \(typeString) - CANNOT QUERY DATA (Permission denied)")
            denied.append(typeString)
        }
        }
        
        print("📊 DEBUG: Final result - Granted: \(granted.count), Denied: \(denied.count)")
        
        self.sendEvent("onSyncEvent", [
        "phase": "permissions",
        "message": "Permissions requested: \(granted.count) granted, \(denied.count) denied"
        ])
        
        return ["granted": granted, "denied": denied]
    } catch {
        print("❌ DEBUG: Authorization failed with error: \(error)")
        throw NSError(domain: "HealthKit", code: 2, userInfo: [NSLocalizedDescriptionKey: "Authorization failed: \(error.localizedDescription)"])
    }
    }

private func testDataAccess(for type: HKSampleType) async -> Bool {
  let predicate = HKQuery.predicateForSamples(withStart: Calendar.current.date(byAdding: .day, value: -7, to: Date()), end: Date(), options: .strictStartDate)
  
  return await withCheckedContinuation { continuation in
    let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: nil) { _, samples, error in
      if let error = error {
        print("🔍 DEBUG: Query test FAILED for \(type.identifier): \(error.localizedDescription)")
        continuation.resume(returning: false)
      } else {
        print("🔍 DEBUG: Query test SUCCESS for \(type.identifier): found \(samples?.count ?? 0) samples")
        continuation.resume(returning: true)
      }
    }
    healthStore.execute(query)
  }
}
  //Starts the background sync
  private func startBackgroundSync(types: [String]) async throws {

    //Diagnostic logging
    DiagnosticLogger.shared.log("start_background_sync", details: [
      "types_count": types.count,
      "types": types
    ])

    //Converts the types strings to Healthkit types. JS can only send a list of Strings, but we convert them to HKSampleType
    let healthKitTypes = types.compactMap { typeString -> HKSampleType? in
      return self.healthKitTypeFromString(typeString)
    }
    
    log("👁️ Starting background sync for: \(healthKitTypes.map { $0.identifier })")
    
    self.stopAllObservers()
    
    for type in healthKitTypes {
      let observerQuery = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] query, completionHandler, error in
        //Diagnostic Logging immediately when HKObserverQuery is triggered (when data is immediately received from healthkit)
        DiagnosticLogger.shared.log("observer_triggered", details: [
                "type": type.identifier,
                "has_error": error != nil,
                "error": error?.localizedDescription ?? "none"
            ], severity: "important")
        
        if let error = error {
          print("Observer query error: \(error)")
          return
        }
        
        Task { [weak self] in
          await self?.handleBackgroundUpdate(for: type)
          completionHandler()
        }
      }
      
      observerQueries.append(observerQuery)
      healthStore.execute(observerQuery)
      
      // Enable background delivery
      do {
        try await healthStore.enableBackgroundDelivery(for: type, frequency: .immediate)
         DiagnosticLogger.shared.log("background_delivery_enabled", details: [
                "type": type.identifier
            ])
      } catch {
        print("Failed to enable background delivery for \(type.identifier): \(error)")
        DiagnosticLogger.shared.log("background_delivery_failed", details: [
                "type": type.identifier,
                "error": error.localizedDescription
        ], severity: "error")
      }
    }
    
    self.sendEvent("onSyncEvent", [
      "phase": "observer",
      "message": "Background sync started for \(healthKitTypes.count) types"
    ])
  }

  private func stopBackgroundSync() async {
    self.stopAllObservers()
    
    self.sendEvent("onSyncEvent", [
      "phase": "observer", 
      "message": "Background sync stopped"
    ])
  }

  private func syncNow(types: [String]) async throws -> [String: Int] {
    let healthKitTypes: [HKSampleType]
    
    if types.isEmpty {
      // Use all previously configured types or default set
      healthKitTypes = self.getDefaultHealthKitTypes()
    } else {
      healthKitTypes = types.compactMap { typeString -> HKSampleType? in
        return self.healthKitTypeFromString(typeString)
      }
    }
    
    var totalAdded = 0
    var totalDeleted = 0
    
    for type in healthKitTypes {
      let result = try await self.performAnchoredQuery(for: type)
      totalAdded += result.added
      totalDeleted += result.deleted
    }
    
    self.sendEvent("onSyncEvent", [
      "phase": "anchored",
      "message": "Manual sync completed",
      "counts": [
        "added": totalAdded,
        "deleted": totalDeleted
      ]
    ])
    
    return ["added": totalAdded, "deleted": totalDeleted]
  }

  private func getSyncStatus() async -> [String: Any?] {
    return [
      "lastSyncISO": self.getLastSyncDate(),
      "queuedBatches": 0, // TODO: Implement actual queue tracking
      "lastError": nil    // TODO: Implement error tracking
    ]
  }
}

// MARK: - Helper Methods
extension ExpoHealthkitBridgeModule {

    private func getPreferredUnit(for quantityType: HKQuantityType) -> HKUnit? {
  switch quantityType.identifier {
  // Steps and Movement
  case HKQuantityTypeIdentifier.stepCount.rawValue:
    return HKUnit.count()
  case HKQuantityTypeIdentifier.flightsClimbed.rawValue:
    return HKUnit.count()
  case HKQuantityTypeIdentifier.distanceWalkingRunning.rawValue:
    return HKUnit.meter()
  
  // Heart Rate and Cardiovascular
  case HKQuantityTypeIdentifier.heartRate.rawValue,
       HKQuantityTypeIdentifier.restingHeartRate.rawValue:
    return HKUnit(from: "count/min")
  case HKQuantityTypeIdentifier.heartRateVariabilitySDNN.rawValue:
    return HKUnit.secondUnit(with: .milli)
  
  // Energy and Activity
  case HKQuantityTypeIdentifier.basalEnergyBurned.rawValue,
       HKQuantityTypeIdentifier.activeEnergyBurned.rawValue:
    return HKUnit.kilocalorie()
  case HKQuantityTypeIdentifier.appleExerciseTime.rawValue,
       HKQuantityTypeIdentifier.appleMoveTime.rawValue,
       HKQuantityTypeIdentifier.appleStandTime.rawValue:
    return HKUnit.minute()
  
  // Vitals and Health Metrics
  case HKQuantityTypeIdentifier.vo2Max.rawValue:
    return HKUnit(from: "ml/kg*min")
  case HKQuantityTypeIdentifier.oxygenSaturation.rawValue:
    return HKUnit.percent()
  case HKQuantityTypeIdentifier.respiratoryRate.rawValue:
    return HKUnit(from: "count/min")
  case HKQuantityTypeIdentifier.bodyTemperature.rawValue:
    return HKUnit.degreeCelsius()
  
  default:
    // For unknown types, return nil to skip unit conversion
    // This prevents incompatible unit conversion crashes
    return nil
  }
}
  
  private func healthKitTypeFromString(_ typeString: String) -> HKSampleType? {
    // ECG type (iOS 12.2+) - use the actual HealthKit identifier
    if typeString == HKObjectType.electrocardiogramType().identifier {
      // Above gives us -> HKDataTypeIdentifierElectrocardiogram, maybe change this in 
      return HKObjectType.electrocardiogramType()
    }

    // if typeString == "HKElectrocardiogramType" {
    //   return HKObjectType.electrocardiogramType()
    // }

    
    // Quantity types
    if let quantityType = HKQuantityType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: typeString)) {
      return quantityType
    }
    
    // Category types  
    if let categoryType = HKCategoryType.categoryType(forIdentifier: HKCategoryTypeIdentifier(rawValue: typeString)) {
      return categoryType
    }
    
    // Workout type
    if typeString == HKWorkoutType.workoutType().identifier {
      return HKWorkoutType.workoutType()
    }
    
    return nil
  }
  
  private func getDefaultHealthKitTypes() -> [HKSampleType] {
    let quantityIdentifiers: [HKQuantityTypeIdentifier] = [
      .stepCount, .distanceWalkingRunning, .flightsClimbed,
      .heartRate, .restingHeartRate, .heartRateVariabilitySDNN,
      .vo2Max, .oxygenSaturation, .respiratoryRate,
      .bodyTemperature, .basalEnergyBurned,
      .appleExerciseTime, .appleMoveTime, .appleStandTime,
      .activeEnergyBurned
    ]
    
    let categoryIdentifiers: [HKCategoryTypeIdentifier] = [
      .sleepAnalysis, .appleStandHour, .mindfulSession
    ]
    
    var types: [HKSampleType] = []
    
    for identifier in quantityIdentifiers {
      if let type = HKQuantityType.quantityType(forIdentifier: identifier) {
        types.append(type)
      }
    }
    
    for identifier in categoryIdentifiers {
      if let type = HKCategoryType.categoryType(forIdentifier: identifier) {
        types.append(type)
      }
    }
    
    types.append(HKWorkoutType.workoutType())
    
    // Add ECG type if available (iOS 12.2+)
    if #available(iOS 12.2, *) {
      types.append(HKObjectType.electrocardiogramType())
    }
    
    return types
  }
  

  private func performAnchoredQuery(for type: HKSampleType) async throws -> (added: Int, deleted: Int) {
    let anchor = anchors[type.identifier] ?? HKQueryAnchor(fromValue: Int(HKAnchoredObjectQueryNoAnchor))
    
    return try await withCheckedThrowingContinuation { continuation in
      let query = HKAnchoredObjectQuery(
        type: type,
        predicate: nil,
        anchor: anchor,
        limit: HKObjectQueryNoLimit
      ) { [weak self] query, samples, deletedObjects, newAnchor, error in
        
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        
        let addedCount = samples?.count ?? 0
        let deletedCount = deletedObjects?.count ?? 0
        
        // Store the new anchor
        if let newAnchor = newAnchor {
          Task { [weak self] in
            await MainActor.run {
              self?.anchors[type.identifier] = newAnchor
              self?.saveAnchors()
            }
          }
        }
        
        // Update last sync date
        Task { @MainActor [weak self] in
          self?.setLastSyncDate()
        }
        
        continuation.resume(returning: (added: addedCount, deleted: deletedCount))
      }
      
      healthStore.execute(query)
    }
  }
  
  private func stopAllObservers() {
    for query in observerQueries {
      healthStore.stop(query)
    }
    observerQueries.removeAll()
  }
  
  // MARK: - Anchor Storage
  
  private func loadAnchors() {
    // Load anchors from UserDefaults (in production, consider using Keychain)
    if let data = UserDefaults.standard.data(forKey: "HealthKitAnchors"),
       let decoded = try? JSONDecoder().decode([String: Data].self, from: data) {
      
      for (key, anchorData) in decoded {
        if let anchor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: anchorData) {
          anchors[key] = anchor
        }
      }
    }
  }
  
  private func saveAnchors() {
    var encodedAnchors: [String: Data] = [:]
    
    for (key, anchor) in anchors {
      if let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) {
        encodedAnchors[key] = data
      }
    }
    
    if let data = try? JSONEncoder().encode(encodedAnchors) {
      UserDefaults.standard.set(data, forKey: "HealthKitAnchors")
    }
  }
  
  private func getLastSyncDate() -> String? {
    if let date = UserDefaults.standard.object(forKey: "LastSyncDate") as? Date {
      return ISO8601DateFormatter().string(from: date)
    }
    return nil
  }
  
  private func setLastSyncDate() {
    UserDefaults.standard.set(Date(), forKey: "LastSyncDate")
  }

  // MARK: - Deferred Anchor Management
  
  /// Query new data WITHOUT updating anchors immediately
  /// Anchors are stored temporarily until upload succeeds
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
          Task { @MainActor [weak self] in
            self?.tempAnchors[type.identifier] = newAnchor
            log("📍 Stored temporary anchor for \(type.identifier)")
          }
        }
        
        // Process samples without updating persistent anchors
        Task { [weak self] in
          var processedSamples: [[String: Any]] = []
          
          if let samples = samples {
            for sample in samples {
              if let processed = await self?.sampleToDictionaryWithVoltage(sample) {
                processedSamples.append(processed)
              }
            }
          }
          
          log("📥 Queried \(processedSamples.count) samples for \(type.identifier) without updating anchor")
          continuation.resume(returning: processedSamples)
        }
      }
      
      healthStore.execute(query)
    }
  }
  
  /// Update anchor ONLY after successful upload
  /// This ensures no data is lost if upload fails
  private func updateAnchorAfterSuccessfulUpload(for type: HKSampleType, samples: [[String: Any]]) async {
    if let tempAnchor = tempAnchors[type.identifier] {
      await MainActor.run {
        self.anchors[type.identifier] = tempAnchor
        self.saveAnchors()
        self.tempAnchors.removeValue(forKey: type.identifier)
        self.setLastSyncDate()
      }
      log("✅ Updated persistent anchor for \(type.identifier) after successful upload")
    } else {
      log("⚠️ No temporary anchor found for \(type.identifier)")
    }
  }
  
  /// Update anchor from queued item data (for background processing)
  public func updateAnchorFromQueueItem(dataType: String, anchorData: Data) async {
    do {
      if let anchor = try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: anchorData) {
        await MainActor.run {
          self.anchors[dataType] = anchor
          self.saveAnchors()
          self.setLastSyncDate()
        }
        log("📍 Updated anchor for \(dataType) from queued data")
      }
    } catch {
      log("❌ Failed to decode anchor data for \(dataType): \(error)")
    }
  }
  
  /// Get current user ID for queue operations
  private func getCurrentUserId() -> String {
    // Get user ID from the already-configured uploader
    do {
      let config = try UploadConfig.load()
      return config.userId
    } catch {
      log("⚠️ Could not load user ID from uploader config: \(error)")
      return "unknown_user"  // Fallback - indicates a configuration problem
    }
  }
  
  // MARK: - Public API for Component Integration
  
  /// Provide access to HealthStore for other components
  public func getHealthStore() -> HKHealthStore {
    return healthStore
  }
  
  /// Provide access to default monitored types
  public func getMonitoredTypes() -> [HKSampleType] {
    return getDefaultHealthKitTypes()
  }
  
  /// Query recent data for missed data detection (used by ForegroundSyncManager)
  public func queryRecentDataForComponent(type: HKSampleType, hours: Int = 24) async throws -> [[String: Any]] {
    let endDate = Date()
    let startDate = Calendar.current.date(byAdding: .hour, value: -hours, to: endDate) ?? endDate
    
    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
    
    return try await withCheckedThrowingContinuation { continuation in
      let query = HKSampleQuery(
        sampleType: type,
        predicate: predicate,
        limit: 100, // Limit for missed data check
        sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]
      ) { _, samples, error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        
        // Process samples with basic processing for missed data check
        Task { [weak self] in
          var processedSamples: [[String: Any]] = []
          
          if let samples = samples {
            for sample in samples {
              if let processed = self?.sampleToDictionarySafely(sample) {
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
  
  // MARK: - Immediate Upload with Retries
  
  /// Attempt immediate upload with quick retries and timeout
  /// Returns true if upload succeeds, false if it should be queued for later
  private func attemptImmediateUpload(samples: [[String: Any]]) async -> Bool {
    let retryDelays: [TimeInterval] = [0, 1, 3] // 0 sec, 1 sec, 3 sec
    
    for (attempt, delay) in retryDelays.enumerated() {
      if delay > 0 {
        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
      }
      
      log("🔄 Immediate upload attempt \(attempt + 1)/\(retryDelays.count)")
      
      do {
        // Use existing uploader with timeout for immediate sync
        let uploadTask = Task {
          await uploader.uploadRawSamples(samples, batchType: "immediate")
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
        
      } catch TimeoutError.uploadTimeout {
        log("⏰ Upload attempt \(attempt + 1) timed out after 10 seconds")
      } catch {
        log("❌ Upload attempt \(attempt + 1) failed: \(error)")
      }
    }
    
    log("❌ All immediate upload attempts failed")
    return false
  }
  
  /// Encode anchor data for queue storage
  private func encodeAnchorData(for type: HKSampleType) -> Data? {
    guard let tempAnchor = tempAnchors[type.identifier] else { return nil }
    
    do {
      return try NSKeyedArchiver.archivedData(withRootObject: tempAnchor, requiringSecureCoding: true)
    } catch {
      log("❌ Failed to encode anchor data for \(type.identifier): \(error)")
      return nil
    }
  }
  
  // MARK: - Testing and Validation Implementation
  
  /// Get comprehensive queue status for debugging
  private func getQueueStatus() async -> [String: Any] {
    let queueStats = PersistentUploadQueue.shared.getQueueStatistics()
    let healthStatus = SyncAnalytics.shared.getSyncHealthStatus()
    let bgTaskStatus = BackgroundTaskManager.shared.getSchedulingStatus()
    let foregroundStatus = ForegroundSyncManager.shared.getSyncStatus()
    
    return [
      "queue": queueStats,
      "health": [
        "overallHealth": healthStatus.overallHealth.rawValue,
        "successRate": healthStatus.successRate,
        "averageResponseTime": healthStatus.averageResponseTime,
        "consecutiveFailures": healthStatus.systemStatus.consecutiveFailures
      ],
      "backgroundTasks": bgTaskStatus,
      "foreground": foregroundStatus,
      "anchors": anchors.keys.sorted(),
      "tempAnchors": tempAnchors.keys.sorted()
    ]
  }
  
  /// Force processing of queue for testing
  private func forceSyncProcessing() async -> [String: Any] {
    log("🧪 Force processing queue for testing")
    
    let startTime = Date()
    
    // Process foreground queue
    let foregroundResult = await ForegroundSyncManager.shared.forceProcessQueue()
    
    // Process background queue
    let backgroundResult = await BackgroundTaskManager.shared.processQueueNow()
    
    let duration = Date().timeIntervalSince(startTime)
    
    return [
      "foreground": foregroundResult,
      "background": backgroundResult,
      "totalDuration": duration,
      "timestamp": ISO8601DateFormatter().string(from: Date())
    ]
  }
  
  /// Validate sync integrity and consistency
  private func validateSyncIntegrity() async -> [String: Any] {
    log("🔍 Validating sync integrity")
    
    var results: [String: Any] = [:]
    var issues: [String] = []
    
    // Check anchor consistency
    let anchorCount = anchors.count
    let tempAnchorCount = tempAnchors.count
    results["anchorCount"] = anchorCount
    results["tempAnchorCount"] = tempAnchorCount
    
    if tempAnchorCount > 10 {
      issues.append("High number of temporary anchors (\(tempAnchorCount)) - possible upload failures")
    }
    
    // Check queue health
    let queueStats = PersistentUploadQueue.shared.getQueueStatistics()
    let pendingCount = queueStats["pending"] ?? 0
    let failedCount = queueStats["failed"] ?? 0
    
    if pendingCount > 1000 {
      issues.append("High number of pending items (\(pendingCount))")
    }
    
    if failedCount > 500 {
      issues.append("High number of failed items (\(failedCount))")
    }
    
    // Check sync health
    let healthStatus = SyncAnalytics.shared.getSyncHealthStatus()
    if healthStatus.successRate < 0.8 {
      issues.append("Low success rate (\(String(format: "%.1f", healthStatus.successRate * 100))%)")
    }
    
    if healthStatus.systemStatus.consecutiveFailures > 10 {
      issues.append("High consecutive failures (\(healthStatus.systemStatus.consecutiveFailures))")
    }
    
    // Check background task status
    let bgStatus = BackgroundTaskManager.shared.getDetailedStatus()
    if let bgEnabled = bgStatus["backgroundTasksEnabled"] as? Bool, !bgEnabled {
      issues.append("Background tasks not enabled")
    }
    
    results["issues"] = issues
    results["isHealthy"] = issues.isEmpty
    results["queueStats"] = queueStats
    results["healthStatus"] = [
      "overallHealth": healthStatus.overallHealth.rawValue,
      "successRate": healthStatus.successRate
    ]
    
    log("🔍 Integrity check found \(issues.count) issues")
    
    return results
  }
  
  // MARK: - Date Range Queries
  private func queryDataInRange(types: [String], startDateISO: String, endDateISO: String) async throws -> [String: [[String: Any]]] {
  log("Raw input dates - Start: \(startDateISO), End: \(endDateISO)")
  
  // Create a more robust date formatter
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  
  // Try multiple date parsing strategies
  var startDate: Date?
  var endDate: Date?
  
  // Strategy 1: Full ISO8601 with fractional seconds
  startDate = formatter.date(from: startDateISO)
  endDate = formatter.date(from: endDateISO)
  
  // Strategy 2: Standard ISO8601 without fractional seconds
  if startDate == nil || endDate == nil {
    formatter.formatOptions = [.withInternetDateTime]
    startDate = formatter.date(from: startDateISO)
    endDate = formatter.date(from: endDateISO)
  }
  
  // Strategy 3: Try with timezone
  if startDate == nil || endDate == nil {
    formatter.formatOptions = [.withInternetDateTime, .withTimeZone]
    startDate = formatter.date(from: startDateISO)
    endDate = formatter.date(from: endDateISO)
  }
  
  // Strategy 4: Fallback to simple format
  if startDate == nil || endDate == nil {
    let fallbackFormatter = DateFormatter()
    fallbackFormatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
    fallbackFormatter.locale = Locale(identifier: "en_US_POSIX")
    fallbackFormatter.timeZone = TimeZone(secondsFromGMT: 0)
    
    startDate = fallbackFormatter.date(from: startDateISO)
    endDate = fallbackFormatter.date(from: endDateISO)
  }
  
  // Final validation
  guard let validStartDate = startDate,
        let validEndDate = endDate else {
    log("❌ Could not parse dates. Start: \(startDateISO), End: \(endDateISO)")
    throw NSError(domain: "HealthKit", code: 3, userInfo: [
      NSLocalizedDescriptionKey: "Invalid date format. Received: start=\(startDateISO), end=\(endDateISO)"
    ])
  }
  
  log("✅ Parsed dates successfully - Start: \(validStartDate), End: \(validEndDate)")
  
  // Calculate date range to determine query strategy
  let daysDiff = Calendar.current.dateComponents([.day], from: validStartDate, to: validEndDate).day ?? 0
  log("📅 Date range: \(daysDiff) days")
  
  // Check if ECG is in original types
  //Fix1
  let ecgIdentifier: String
    if #available(iOS 12.2, *) {
      ecgIdentifier = HKObjectType.electrocardiogramType().identifier
      //HKDataTypeIdentifierElectrocardiogram
      log("CHECKING ARYAN: THIS IS THE ECG IDENTIFIER: " + ecgIdentifier)
    } else {
      ecgIdentifier = ""
    }

  let hasECG = types.contains(ecgIdentifier)
  log("🫀 ECG_DEBUG: Original types include ECG: \(hasECG)")
  log("🫀 ECG_DEBUG: ECG identifier: \(ecgIdentifier)")
  if hasECG {
    log("🫀 ECG_DEBUG: ECG found in original types list")
  }
  
  // Limit to essential types for large date ranges
  let limitedTypes = daysDiff > 7 ? getLimitedHealthTypes(from: types) : types
  log("🎯 Processing \(limitedTypes.count) types (limited from \(types.count) due to \(daysDiff) day range)")
  
  // Check if ECG survived the filtering
  let hasECGAfterFilter = limitedTypes.contains(ecgIdentifier)
  log("🫀 ECG_DEBUG: ECG included after filtering: \(hasECGAfterFilter)")
  if daysDiff > 7 && hasECG && !hasECGAfterFilter {
    log("🫀 ECG_DEBUG: WARNING - ECG was filtered out due to large date range!")
  }
  
  let healthKitTypes = limitedTypes.compactMap { typeString -> HKSampleType? in
    let healthKitType = self.healthKitTypeFromString(typeString)
    if typeString == ecgIdentifier {
      log("🫀 ECG_DEBUG: Converting ECG type string to HealthKit type: \(healthKitType?.identifier ?? "FAILED")")
    }
    return healthKitType
  }
  
  var allData: [String: [[String: Any]]] = [:]
  
  // Process types one by one to avoid memory issues
  for (index, type) in healthKitTypes.enumerated() {
    log("📊 Processing type \(index + 1)/\(healthKitTypes.count): \(type.identifier)")
    
    // Special logging for ECG
    if type.identifier == ecgIdentifier {
      log("🫀 ECG_DEBUG: Starting ECG data processing...")
    }
    
    do {
      let samples = try await queryHistoricalDataSafely(for: type, from: validStartDate, to: validEndDate)
      allData[type.identifier] = samples
      log("✅ Found \(samples.count) samples for \(type.identifier)")
      
      // Special logging for ECG results
      if type.identifier == ecgIdentifier {
        log("🫀 ECG_DEBUG: Successfully processed \(samples.count) ECG samples")
        if samples.isEmpty {
          log("🫀 ECG_DEBUG: No ECG samples found - check permissions and date range")
        } else {
          log("🫀 ECG_DEBUG: ECG samples will be included in upload payload")
        }
      }
      
      // Send progress event
      self.sendEvent("onSyncEvent", [
        "phase": "historical",
        "message": "Processed \(type.identifier): \(samples.count) samples",
        "progress": [
          "completed": index + 1,
          "total": healthKitTypes.count
        ]
      ])
      
      // Add small delay between queries to prevent overwhelming the system
      if index < healthKitTypes.count - 1 {
        try await Task.sleep(nanoseconds: 200_000_000) // 0.2 second
      }
    } catch {
      log("❌ Error querying \(type.identifier): \(error)")
      allData[type.identifier] = []
    }
  }
  
  log("🏁 Historical query completed. Total types: \(allData.count)")
  return allData
}

// MARK: - Date Range Upload (Query + Upload Combined)
private func uploadDateRange(types: [String], startDateISO: String, endDateISO: String) async throws -> [String: Any] {
  log("🚀 Starting date range upload from \(startDateISO) to \(endDateISO)")
  
  // First, query the data
  let historicalData = try await queryDataInRange(types: types, startDateISO: startDateISO, endDateISO: endDateISO)
  
  // Count total samples
  let totalSamples = historicalData.values.reduce(0) { $0 + $1.count }
  
  guard totalSamples > 0 else {
    let result: [String: Any] = [
      "success": false,
      "message": "No data found for the specified date range",
      "samplesFound": 0,
      "samplesUploaded": 0,
      "dataTypes": historicalData.keys.sorted()
    ]
    log("📭 No data found for upload")
    return result
  }
  
  log("📊 Found \(totalSamples) samples across \(historicalData.count) data types")
  
  // Log data summary
  for (dataType, samples) in historicalData {
    if #available(iOS 12.2, *), dataType == HKObjectType.electrocardiogramType().identifier {
      log("🫀 Found \(samples.count) ECG samples with voltage data")
    } else {
      log("📊 Found \(samples.count) \(dataType) samples")
    }
  }
  
  // Send progress event
  self.sendEvent("onSyncEvent", [
    "phase": "uploading",
    "message": "Starting upload of \(totalSamples) samples",
    "samplesFound": totalSamples
  ])
  
  // Log final payload details before upload
  log("📤 ECG_BATCH_DEBUG: About to upload \(totalSamples) samples to uploader.uploadHistoricalData()")
  
  // Calculate total payload size for debugging
  do {
    let payloadData = try JSONSerialization.data(withJSONObject: historicalData, options: [])
    let payloadSizeMB = Double(payloadData.count) / 1024 / 1024
    log("📦 ECG_BATCH_DEBUG: Total payload size: \(payloadData.count) bytes (\(String(format: "%.2f", payloadSizeMB)) MB)")
    
    // Log breakdown by data type
    for (dataType, samples) in historicalData {
      if let typeData = try? JSONSerialization.data(withJSONObject: samples, options: []) {
        let typeSizeMB = Double(typeData.count) / 1024 / 1024
        log("📊 ECG_BATCH_DEBUG: \(dataType): \(samples.count) samples, \(String(format: "%.2f", typeSizeMB)) MB")
      }
    }
  } catch {
    log("⚠️ ECG_BATCH_DEBUG: Could not calculate payload size: \(error)")
  }
  
  let uploadResult = await uploader.uploadHistoricalData(historicalData, startDate: startDateISO, endDate: endDateISO)
  
  // Prepare result
  let result: [String: Any] = [
    "success": uploadResult.success,
    "message": uploadResult.message,
    "samplesFound": totalSamples,
    "samplesUploaded": uploadResult.success ? totalSamples : 0,
    "dataTypes": historicalData.keys.sorted(),
    "dataTypeBreakdown": historicalData.mapValues { $0.count }
  ]
  
  // Send completion event
  self.sendEvent("onSyncEvent", [
    "phase": uploadResult.success ? "completed" : "failed",
    "message": uploadResult.message,
    "samplesUploaded": uploadResult.success ? totalSamples : 0
  ])
  
  log("🏁 Date range upload completed: \(uploadResult.success ? "SUCCESS" : "FAILED")")
  return result
}


private func queryHistoricalDataSafely(for type: HKSampleType, from startDate: Date, to endDate: Date) async throws -> [[String: Any]] {
  let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
  
  // Smart sample limiting based on data type and date range
  let daysDiff = Calendar.current.dateComponents([.day], from: startDate, to: endDate).day ?? 1
  let sampleLimit = getSampleLimit(for: type.identifier, days: daysDiff)
  
  log("🔍 Querying \(type.identifier) with limit \(sampleLimit) for \(daysDiff) days")
  
  return try await withCheckedThrowingContinuation { continuation in
    let query = HKSampleQuery(
      sampleType: type,
      predicate: predicate,
      limit: sampleLimit,
      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)] // Most recent first
    ) { _, samples, error in
      if let error = error {
        log("❌ Query error for \(type.identifier): \(error.localizedDescription)")
        continuation.resume(throwing: error)
        return
      }
      
      guard let samples = samples else {
        log("⚠️ No samples returned for \(type.identifier)")
        continuation.resume(returning: [])
        return
      }
      
      log("📥 Raw samples count for \(type.identifier): \(samples.count)")
      
      // Process samples with ECG voltage data support in async context
      Task { [weak self] in
        guard let self = self else {
          continuation.resume(returning: [])
          return
        }
        
        var sampleData: [[String: Any]] = []
        for sample in samples {
          if let processedSample = await self.sampleToDictionaryWithVoltage(sample) {
            sampleData.append(processedSample)
          }
        }
        
        log("✅ Processed \(sampleData.count) valid samples for \(type.identifier)")
        continuation.resume(returning: sampleData)
      }
    }
    
    healthStore.execute(query)
  }
}

// MARK: - Enhanced Data Dictionary
//This converts the incoming HealthKit data into a dictionary that is JSON-serializable
private func sampleToDictionarySafely(_ sample: HKSample) -> [String: Any]? {
  //HKSample is the generic base class for all HealthKit data
  //We need to handle the different types of samples differently
  // Validate sample data
  guard sample.startDate.timeIntervalSince1970 > 0,
        sample.endDate.timeIntervalSince1970 > 0,
        sample.startDate <= sample.endDate else {
    log("⚠️ Invalid sample dates for \(sample.sampleType.identifier), skipping")
    return nil
  }
  
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  
  var dict: [String: Any] = [
    "startDate": formatter.string(from: sample.startDate),
    "endDate": formatter.string(from: sample.endDate),
    "type": sample.sampleType.identifier,
    "sourceName": sample.sourceRevision.source.name,
    "uuid": sample.uuid.uuidString
  ]
  
  // Safely handle different sample types - check most specific types first
  //--------------------------------ECG Sample Handling--------------------------------
  if let ecgSample = sample as? HKElectrocardiogram {
    // ECG samples get basic metadata here, full voltage data via dedicated query
    dict["ecgClassification"] = ecgClassificationToString(ecgSample.classification)
    dict["symptomsStatus"] = symptomStatusToString(ecgSample.symptomsStatus)
    dict["unit"] = "ecg"
    
    if let averageHeartRate = ecgSample.averageHeartRate {
      dict["averageHeartRate"] = averageHeartRate.doubleValue(for: HKUnit(from: "count/min"))
    }
    
    if let samplingFrequency = ecgSample.samplingFrequency {
      dict["samplingFrequency"] = samplingFrequency.doubleValue(for: HKUnit.hertz())
    }
    
    dict["numberOfVoltageMeasurements"] = ecgSample.numberOfVoltageMeasurements
    
    // Note: Basic ECG metadata only - for voltage data use sampleToDictionaryWithVoltage()
  } else if let workout = sample as? HKWorkout {
    dict["workoutActivityType"] = workout.workoutActivityType.rawValue
    dict["duration"] = workout.duration
    dict["unit"] = "workout"
  } else if let quantitySample = sample as? HKQuantitySample {
    if let unit = getPreferredUnit(for: quantitySample.quantityType) {
      let value = quantitySample.quantity.doubleValue(for: unit)
      if value.isFinite && !value.isNaN && value >= 0 {
        dict["value"] = value
        dict["unit"] = unit.unitString
      }
    }
  } else if let categorySample = sample as? HKCategorySample {
    dict["value"] = categorySample.value
    dict["unit"] = "category"
    
    // Add descriptive string for sleep analysis
    if categorySample.categoryType.identifier == "HKCategoryTypeIdentifierSleepAnalysis" {
      dict["sleep_stage"] = sleepAnalysisValueToString(categorySample.value)
    }
  }

  // Handle metadata with proper nested structure preservation
  if let metadata = sample.metadata, !metadata.isEmpty {
    
    // Note: Detailed HRV metadata (InstantaneousBeatsPerMinute) is only available 
    // in manual XML exports, not via the programmatic HealthKit API
    
    let processedMetadata = processMetadataSafely(metadata)
    if !processedMetadata.isEmpty {
      dict["metadata"] = processedMetadata
    }
  }

  return dict
}

//--------------------------------Queries ECG Voltage Data, and handles upload to S3, and obtains the ECG Data Dictionary --------------------------------
private func sampleToDictionaryWithVoltage(_ sample: HKSample) async -> [String: Any]? {
  // For ECG samples, include voltage data
  if #available(iOS 12.2, *), let ecgSample = sample as? HKElectrocardiogram {
    let voltagePoints = await queryECGVoltageDataSafely(ecgSample)
    return await ecgSampleToDictionary(ecgSample, voltagePoints: voltagePoints) //Awaiting since it is an Asyn function
  }
  
  // For all other samples, use standard processing
  return sampleToDictionarySafely(sample)
}

private func queryECGVoltageDataSafely(_ ecgSample: HKElectrocardiogram) async -> [[String: Any]] {
  do {
    return try await queryECGVoltageData(ecgSample)
  } catch {
    log("⚠️ Failed to get voltage data for ECG \(ecgSample.uuid): \(error)")
    return [] // Return empty array if voltage data fails
  }
}

// MARK: - Metadata Processing
/// Properly process metadata preserving nested structures like InstantaneousBeatsPerMinute
private func processMetadataSafely(_ metadata: [String: Any]) -> [String: Any] {
  var processedMetadata: [String: Any] = [:]
  
  for (key, value) in metadata {
    processedMetadata[key] = processMetadataValue(value)
  }
  
  return processedMetadata
}

/// Recursively process metadata values to preserve nested structures
private func processMetadataValue(_ value: Any) -> Any {
  // Handle arrays (like InstantaneousBeatsPerMinute)
  if let arrayValue = value as? [Any] {
    return arrayValue.map { processMetadataValue($0) }
  }
  
  // Handle dictionaries (nested metadata)
  if let dictValue = value as? [String: Any] {
    var processedDict: [String: Any] = [:]
    for (key, val) in dictValue {
      processedDict[key] = processMetadataValue(val)
    }
    return processedDict
  }
  
  // Handle primitive types that are JSON-safe
  if value is String || value is NSNumber || value is Bool {
    return value
  }
  
  // Handle NSDate -> ISO8601 string
  if let date = value as? Date {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
  
  // Handle NSData -> base64 string
  if let data = value as? Data {
    return data.base64EncodedString()
  }
  
  // For any other complex types, try JSON serialization first
  if JSONSerialization.isValidJSONObject([value]) {
    return value
  }
  
  // Last resort: convert to string but log it
  let stringValue = String(describing: value)
  log("⚠️ Converting complex metadata value to string: \(stringValue.prefix(100))...")
  return stringValue
}

// MARK: - Sleep Analysis Helper
private func sleepAnalysisValueToString(_ value: Int) -> String {
  switch value {
  case 0: return "HKCategoryValueSleepAnalysisInBed"
  case 1: return "HKCategoryValueSleepAnalysisAsleepUnspecified"  
  case 2: return "HKCategoryValueSleepAnalysisAwake"
  case 3: return "HKCategoryValueSleepAnalysisAsleepCore"
  case 4: return "HKCategoryValueSleepAnalysisAsleepDeep"
  case 5: return "HKCategoryValueSleepAnalysisAsleepREM"
  default: return "HKCategoryValueSleepAnalysisUnknown"
  }
}

// MARK: - Smart Sample Limiting
private func getSampleLimit(for typeIdentifier: String, days: Int) -> Int {
  let baseLimit: Int
  
  // Set different limits based on data frequency
  switch typeIdentifier {
  case "HKQuantityTypeIdentifierHeartRate":
    baseLimit = 100 // Heart rate can be very frequent
  case "HKQuantityTypeIdentifierStepCount":
    baseLimit = days * 24 // Usually hourly or daily
  case "HKQuantityTypeIdentifierActiveEnergyBurned",
       "HKQuantityTypeIdentifierBasalEnergyBurned":
    baseLimit = days * 10 // Multiple readings per day
  case "HKCategoryTypeIdentifierSleepAnalysis":
    baseLimit = days * 5 // Multiple sleep periods
  case "HKWorkoutTypeIdentifier":
    baseLimit = days * 2 // Usually few workouts per day
  default:
    baseLimit = 50 // Conservative default
  }
  
  // Scale down for longer date ranges
  let scaledLimit = max(20, baseLimit / max(1, days / 7))
  
  return min(scaledLimit, 500) // Never exceed 500 samples per type
}

private func getLimitedHealthTypes(from types: [String]) -> [String] {
  // For large date ranges, limit to essential types to avoid memory issues
  var essentialTypes = [
    "HKQuantityTypeIdentifierStepCount",
    "HKQuantityTypeIdentifierHeartRate", 
    "HKQuantityTypeIdentifierActiveEnergyBurned",
    "HKCategoryTypeIdentifierSleepAnalysis",
    "HKWorkoutTypeIdentifier"
  ]
  
  // Add ECG type identifier if available (iOS 12.2+)
  if #available(iOS 12.2, *) {
    essentialTypes.append(HKObjectType.electrocardiogramType().identifier)
  }
  
  return types.filter { essentialTypes.contains($0) }
}

// MARK: - Reliable Background Updates with Queue Fallback
@MainActor
private func handleBackgroundUpdate(for type: HKSampleType) async {
  DiagnosticLogger.shared.log("background_update_started", details: [
        "type": type.identifier,
        "app_state": UIApplication.shared.applicationState.rawValue
    ])
  do {
    // 1. Query new data WITHOUT updating anchor
    let newSamples = try await queryNewDataWithoutAnchorUpdate(for: type)
    // 1. Query new data WITHOUT updating anchor
    DiagnosticLogger.shared.log("background_update_queried", details: [
            "type": type.identifier,
            "samples_found": newSamples.count
        ])
    
    guard !newSamples.isEmpty else { return }
    
    log("📥 Detected \(newSamples.count) new \(type.identifier) samples")
    
    // 2. Attempt immediate upload (3 quick retries)
    let uploadSuccess = await attemptImmediateUpload(samples: newSamples)
    
    if uploadSuccess {
      // 3a. SUCCESS: Update anchor and we're done
      await updateAnchorAfterSuccessfulUpload(for: type, samples: newSamples)
      log("✅ Immediate sync successful for \(newSamples.count) \(type.identifier) samples")
      
      // Track successful sync event
      let successEvent = SyncAnalytics.SyncEvent(
        type: "immediate_success",
        dataType: type.identifier,
        sampleCount: newSamples.count,
        success: true,
        duration: 0 // TODO: Track actual duration
      )
      SyncAnalytics.shared.trackSyncEvent(successEvent)
      
      // Send success event
      self.sendEvent("onSyncEvent", [
        "phase": "immediate_success",
        "dataType": type.identifier,
        "count": newSamples.count
      ])
    } else {
      // 3b. FAILED: Add to persistent queue for retry
      let userId = getCurrentUserId()
      let anchorData = encodeAnchorData(for: type)
      
      await PersistentUploadQueue.shared.enqueue(
        samples: newSamples,
        dataType: type.identifier,
        userId: userId,
        anchorData: anchorData
      )
      
      log("⚠️ Immediate sync failed - \(newSamples.count) \(type.identifier) samples queued for retry")
      
      // Track failed sync event
      let failureEvent = SyncAnalytics.SyncEvent(
        type: "immediate_failed",
        dataType: type.identifier,
        sampleCount: newSamples.count,
        success: false,
        duration: 0 // TODO: Track actual duration
      )
      SyncAnalytics.shared.trackSyncEvent(failureEvent)
      
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
    DiagnosticLogger.shared.log("background_update_error", details: [
            "type": type.identifier,
            "error": error.localizedDescription
        ], severity: "error")
    
    // Send error event
    self.sendEvent("onSyncEvent", [
      "phase": "error",
      "dataType": type.identifier,
      "error": error.localizedDescription
    ])
  }
}

private func getRecentSamples(for type: HKSampleType, count: Int) async throws -> [[String: Any]] {
  let predicate = HKQuery.predicateForSamples(withStart: Calendar.current.date(byAdding: .hour, value: -1, to: Date()), end: Date(), options: .strictStartDate)
  
  return try await withCheckedThrowingContinuation { continuation in
    let query = HKSampleQuery(
      sampleType: type,
      predicate: predicate,
      limit: count,
      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]
    ) { _, samples, error in
      if let error = error {
        continuation.resume(throwing: error)
        return
      }
      
      // Process samples with ECG voltage data support in async context
      Task { [weak self] in
        guard let self = self else {
          continuation.resume(returning: [])
          return
        }
        
        var sampleData: [[String: Any]] = []
        if let samples = samples {
          for sample in samples {
            if let processedSample = await self.sampleToDictionaryWithVoltage(sample) {
              sampleData.append(processedSample)
            }
          }
        }
        
        continuation.resume(returning: sampleData)
      }
    }
    
    healthStore.execute(query)
  }
}

// MARK: - Local Data Storage
private func saveDataLocally(samples: [[String: Any]]) async {
  guard !samples.isEmpty else { return }
  
  let existingData = await getLocalData(types: [], limit: 10000)
  let allData = existingData + samples
  
  // Keep only the most recent 10,000 samples to avoid storage bloat
  let limitedData = Array(allData.suffix(10000))
  
  if let data = try? JSONSerialization.data(withJSONObject: limitedData, options: []) {
    UserDefaults.standard.set(data, forKey: "LocalHealthData")
    log("Saved \(samples.count) samples locally. Total stored: \(limitedData.count)")
  }
}

private func getLocalData(types: [String], limit: Int) async -> [[String: Any]] {
  guard let data = UserDefaults.standard.data(forKey: "LocalHealthData"),
        let allSamples = try? JSONSerialization.jsonObject(with: data, options: []) as? [[String: Any]] else {
    return []
  }
  
  var filteredSamples = allSamples
  
  // Filter by types if specified
  if !types.isEmpty {
    filteredSamples = allSamples.filter { sample in
      if let type = sample["type"] as? String {
        return types.contains(type)
      }
      return false
    }
  }
  
  // Return limited results
  return Array(filteredSamples.suffix(limit))
}

private func clearLocalData(beforeDate: String?) async {
  if let beforeDate = beforeDate,
     let cutoffDate = ISO8601DateFormatter().date(from: beforeDate) {
    // Clear data before a specific date
    let existingData = await getLocalData(types: [], limit: 10000)
    let filteredData = existingData.filter { sample in
      if let dateString = sample["startDate"] as? String,
         let sampleDate = ISO8601DateFormatter().date(from: dateString) {
        return sampleDate >= cutoffDate
      }
      return true
    }
    
    if let data = try? JSONSerialization.data(withJSONObject: filteredData, options: []) {
      UserDefaults.standard.set(data, forKey: "LocalHealthData")
      log("Cleared local data before \(beforeDate)")
    }
  } else {
    // Clear all local data
    UserDefaults.standard.removeObject(forKey: "LocalHealthData")
    log("Cleared all local data")
  }
}

// MARK: - ECG Data Query
@available(iOS 12.2, *)
private func queryECGData(startDateISO: String, endDateISO: String, maxSamples: Int) async throws -> [[String: Any]] {
  log("🫀 Starting ECG data query from \(startDateISO) to \(endDateISO), max samples: \(maxSamples)")
  
  // Parse dates using the same logic as other queries
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  
  var startDate: Date?
  var endDate: Date?
  
  // Try multiple date parsing strategies (same as queryDataInRange)
  startDate = formatter.date(from: startDateISO)
  endDate = formatter.date(from: endDateISO)
  
  if startDate == nil || endDate == nil {
    formatter.formatOptions = [.withInternetDateTime]
    startDate = formatter.date(from: startDateISO)
    endDate = formatter.date(from: endDateISO)
  }
  
  guard let validStartDate = startDate,
        let validEndDate = endDate else {
    log("❌ Could not parse ECG query dates. Start: \(startDateISO), End: \(endDateISO)")
    throw NSError(domain: "HealthKit", code: 3, userInfo: [
      NSLocalizedDescriptionKey: "Invalid date format for ECG query. Received: start=\(startDateISO), end=\(endDateISO)"
    ])
  }
  
  log("✅ Parsed ECG query dates - Start: \(validStartDate), End: \(validEndDate)")
  
  // Step 1: Query ECG samples
  let ecgSamples = try await queryECGSamples(from: validStartDate, to: validEndDate, limit: maxSamples)
  
  if ecgSamples.isEmpty {
    log("⚠️ No ECG samples found in date range")
    return []
  }
  
  log("✅ Found \(ecgSamples.count) ECG samples")
  
  // Step 2: Process each ECG sample to get metadata + voltage data
  var allECGData: [[String: Any]] = []
  
  for (index, ecgSample) in ecgSamples.enumerated() {
    log("🫀 Processing ECG sample \(index + 1)/\(ecgSamples.count): \(ecgSample.uuid)")
    
    do {
      // Get voltage measurements for this ECG sample
      let voltagePoints = try await queryECGVoltageData(ecgSample)
      
      // Convert to our standard format (enhanced HealthSample)
      let ecgDict = await ecgSampleToDictionary(ecgSample, voltagePoints: voltagePoints)
      allECGData.append(ecgDict)
      
      log("✅ Processed ECG sample: \(voltagePoints.count) voltage points")
      
      // Send progress event
      self.sendEvent("onSyncEvent", [
        "phase": "historical",
        "message": "Processed ECG sample \(index + 1)/\(ecgSamples.count): \(voltagePoints.count) voltage points",
        "progress": [
          "completed": index + 1,
          "total": ecgSamples.count
        ]
      ])
      
    } catch {
      log("❌ Error processing ECG sample \(ecgSample.uuid): \(error)")
      // Continue with other samples even if one fails
    }
  }
  
  log("🏁 ECG query completed: \(allECGData.count) samples processed")
  return allECGData
}

@available(iOS 12.2, *)
private func queryECGSamples(from startDate: Date, to endDate: Date, limit: Int) async throws -> [HKElectrocardiogram] {
  let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
  
  return try await withCheckedThrowingContinuation { continuation in
    let query = HKSampleQuery(
      sampleType: HKObjectType.electrocardiogramType(),
      predicate: predicate,
      limit: limit,
      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]
    ) { _, samples, error in
      if let error = error {
        log("❌ ECG sample query error: \(error.localizedDescription)")
        continuation.resume(throwing: error)
        return
      }
      
      let ecgSamples = (samples as? [HKElectrocardiogram]) ?? []
      log("📥 Found \(ecgSamples.count) ECG samples")
      continuation.resume(returning: ecgSamples)
    }
    
    healthStore.execute(query)
  }
}

//ECG Voltage Data Querying
//https://developer.apple.com/documentation/healthkit/hkelectrocardiogramquery
@available(iOS 12.2, *)
private func queryECGVoltageData(_ ecgSample: HKElectrocardiogram) async throws -> [[String: Any]] {
  return try await withCheckedThrowingContinuation { continuation in
    var voltagePoints: [[String: Any]] = []
    
    let query = HKElectrocardiogramQuery(ecgSample) { query, result in
      switch result {
      case .measurement(let measurement):
        // Get voltage for Apple Watch Lead I equivalent
        if let voltageQuantity = measurement.quantity(for: .appleWatchSimilarToLeadI) {
          let voltage = voltageQuantity.doubleValue(for: HKUnit.volt())
          let timeSinceStart = measurement.timeSinceSampleStart
          
          let voltagePoint: [String: Any] = [
            "t": timeSinceStart, // time since start in seconds
            "v": voltage         // voltage in volts
          ]
          voltagePoints.append(voltagePoint)
        }
        
      case .done:
        log("✅ Collected \(voltagePoints.count) voltage points from ECG \(ecgSample.uuid)")
        continuation.resume(returning: voltagePoints)
        
      case .error(let error):
        log("❌ ECG voltage query error: \(error.localizedDescription)")
        continuation.resume(throwing: error)
        
      @unknown default:
        log("⚠️ Unknown ECG query result case")
        continuation.resume(returning: voltagePoints)
      }
    }
    
    healthStore.execute(query)
  }
}


//--------------------------------Function that handles ECG Voltage Upload and Creates ECG Data Dictionary which is sent to Lambda --------------------------------
//The s3Threshold below is what decides whether we upload to S3 or not
    //Change it later on to tweak. 

@available(iOS 12.2, *)
private func ecgSampleToDictionary(_ ecgSample: HKElectrocardiogram, voltagePoints: [[String: Any]]) async -> [String: Any] {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  
  var dict: [String: Any] = [
    "startDate": formatter.string(from: ecgSample.startDate),
    "endDate": formatter.string(from: ecgSample.endDate),
    "type": HKObjectType.electrocardiogramType().identifier,
    "sourceName": ecgSample.sourceRevision.source.name,
    "uuid": ecgSample.uuid.uuidString,
    "unit": "ecg"
  ]
  
  // Add ECG-specific metadata
  dict["ecgClassification"] = ecgClassificationToString(ecgSample.classification)
  dict["symptomsStatus"] = symptomStatusToString(ecgSample.symptomsStatus)
  
  if let averageHeartRate = ecgSample.averageHeartRate {
    dict["averageHeartRate"] = averageHeartRate.doubleValue(for: HKUnit(from: "count/min"))
  }
  
  if let samplingFrequency = ecgSample.samplingFrequency {
    dict["samplingFrequency"] = samplingFrequency.doubleValue(for: HKUnit.hertz())
  }
  
  dict["numberOfVoltageMeasurements"] = ecgSample.numberOfVoltageMeasurements
  
  // Handle voltage data - upload to S3 if data is large
  if !voltagePoints.isEmpty {
    // Estimate voltage data size
    do {
      let voltageDataSize = try JSONSerialization.data(withJSONObject: voltagePoints, options: []).count
      log("🫀 ECG_UPLOAD_DEBUG: ECG Sample \(ecgSample.uuid.uuidString)")
      log("🫀 ECG_UPLOAD_DEBUG: Voltage data size: \(voltageDataSize) bytes (\(String(format: "%.2f", Double(voltageDataSize) / 1024)) KB)")
      log("🫀 ECG_UPLOAD_DEBUG: Voltage points count: \(voltagePoints.count)")
      
      // Lower threshold to 500KB to prevent batch payload issues (was 1MB)
      let s3Threshold = 512 * 1024 // 500KB
      log("🫀 ECG_UPLOAD_DEBUG: S3 threshold: \(s3Threshold) bytes (\(s3Threshold / 1024) KB)")
      
      if voltageDataSize > s3Threshold {
        log("📤 ECG_UPLOAD_DEBUG: TRIGGERING S3 UPLOAD - voltage data (\(String(format: "%.2f", Double(voltageDataSize) / 1024)) KB) > threshold (\(s3Threshold / 1024) KB)")
        
        // Upload to S3 and get S3 key
        log("🔗 ECG_UPLOAD_DEBUG: Calling uploader.uploadVoltageDataToS3()...")
        if let s3Key = await uploader.uploadVoltageDataToS3(voltagePoints, sampleUUID: ecgSample.uuid.uuidString) {
          // Replace voltage points with S3 reference
          dict["voltageS3Key"] = s3Key
          dict["voltageDataUploaded"] = true
          dict["voltagePointsCount"] = voltagePoints.count
          log("✅ ECG_UPLOAD_DEBUG: S3 UPLOAD SUCCESS - voltage data replaced with S3 key: \(s3Key)")
          log("🎯 ECG_UPLOAD_DEBUG: Payload size reduced from \(String(format: "%.2f", Double(voltageDataSize) / 1024)) KB to S3 reference")
        } else {
          // S3 upload failed, include smaller subset of voltage data
          log("❌ ECG_UPLOAD_DEBUG: S3 UPLOAD FAILED - falling back to truncated voltage data")
          let limitedVoltagePoints = Array(voltagePoints.prefix(50)) // Reduced to 50 points (was 100)
          let limitedDataSize = (try? JSONSerialization.data(withJSONObject: limitedVoltagePoints).count) ?? 0
          dict["voltagePoints"] = limitedVoltagePoints
          dict["voltageDataTruncated"] = true
          dict["originalVoltagePointsCount"] = voltagePoints.count
          dict["voltageDataUploaded"] = false
          log("⚠️ ECG_UPLOAD_DEBUG: Using \(limitedVoltagePoints.count) truncated voltage points (\(String(format: "%.2f", Double(limitedDataSize) / 1024)) KB)")
        }
      } else {
        // Small voltage data, include directly in payload
        log("📦 ECG_UPLOAD_DEBUG: SMALL VOLTAGE DATA - including directly in payload (\(String(format: "%.2f", Double(voltageDataSize) / 1024)) KB < \(s3Threshold / 1024) KB threshold)")
        dict["voltagePoints"] = voltagePoints
        dict["voltageDataUploaded"] = false
      }
      
      // Log final payload decision
      if dict["voltageS3Key"] != nil {
        log("🎯 ECG_UPLOAD_DEBUG: FINAL PAYLOAD - ECG sample with S3 reference (no voltage data in payload)")
      } else if dict["voltageDataTruncated"] as? Bool == true {
        let truncatedCount = (dict["voltagePoints"] as? [[String: Any]])?.count ?? 0
        log("🎯 ECG_UPLOAD_DEBUG: FINAL PAYLOAD - ECG sample with \(truncatedCount) truncated voltage points")
      } else {
        let fullCount = (dict["voltagePoints"] as? [[String: Any]])?.count ?? 0
        log("🎯 ECG_UPLOAD_DEBUG: FINAL PAYLOAD - ECG sample with \(fullCount) full voltage points")
      }
      
    } catch {
      log("❌ Error processing voltage data: \(error)")
      dict["voltageProcessingError"] = true
      dict["voltagePointsCount"] = voltagePoints.count
    }
  } else {
    log("⚠️ No voltage points available for ECG sample")
    dict["voltagePointsCount"] = 0
  }
  
  // Add metadata container for additional info
  let voltageUploadAttempted: Bool = {
    guard voltagePoints.count > 0 else { return false }
    do {
      let data = try JSONSerialization.data(withJSONObject: voltagePoints, options: [])
      return data.count > 1024 * 1024
    } catch {
      return false
    }
  }()
  
  dict["metadata"] = [
    "classification": ecgClassificationToString(ecgSample.classification),
    "symptomsStatus": symptomStatusToString(ecgSample.symptomsStatus),
    "hasVoltageData": !voltagePoints.isEmpty,
    "voltageUploadAttempted": voltageUploadAttempted
  ]
  
  return dict
}

// MARK: - ECG Helper Methods
@available(iOS 12.2, *)
private func ecgClassificationToString(_ classification: HKElectrocardiogram.Classification) -> String {
  switch classification {
  case .notSet:
    return "not_set"
  case .sinusRhythm:
    return "sinus_rhythm"
  case .atrialFibrillation:
    return "atrial_fibrillation"
  case .inconclusiveLowHeartRate:
    return "inconclusive_low_heart_rate"
  case .inconclusiveHighHeartRate:
    return "inconclusive_high_heart_rate"
  case .inconclusivePoorReading:
    return "inconclusive_poor_reading"
  case .inconclusiveOther:
    return "inconclusive_other"
  case .unrecognized:
    return "unrecognized"
  @unknown default:
    return "unknown"
  }
}

@available(iOS 12.2, *)
private func symptomStatusToString(_ symptomsStatus: HKElectrocardiogram.SymptomsStatus) -> String {
  switch symptomsStatus {
  case .notSet:
    return "not_set"
  case .none:
    return "none"
  case .present:
    return "present"
  @unknown default:
    return "unknown"
  }
}



private func authorizationStatusDescription(_ status: HKAuthorizationStatus) -> String {
  switch status {
  case .notDetermined:
    return "not_determined"
  case .sharingDenied:
    return "sharing_denied"
  case .sharingAuthorized:
    return "sharing_authorized"
  @unknown default:
    return "unknown"
  }
}

}

// MARK: - Timeout Error
enum TimeoutError: Error {
  case uploadTimeout
  
  var localizedDescription: String {
    switch self {
    case .uploadTimeout:
      return "Upload operation timed out"
    }
  }
}