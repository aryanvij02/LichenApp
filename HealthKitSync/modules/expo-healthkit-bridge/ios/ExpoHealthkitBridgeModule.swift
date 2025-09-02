import ExpoModulesCore
import HealthKit
import Foundation
// Custom logging function for easy filtering
func log(_ message: String) {
    print("🔍 HEALTHKIT_DEBUG: \(message)")
}

public class ExpoHealthkitBridgeModule: Module {
  private let healthStore = HKHealthStore()
  private var observerQueries: [HKObserverQuery] = []
  private var anchors: [String: HKQueryAnchor] = [:]
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

    AsyncFunction("queryHeartbeatSeries") { (startDateISO: String, endDateISO: String) -> [String: Any] in
      return try await self.queryHeartbeatSeries(startDateISO: startDateISO, endDateISO: endDateISO)
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

AsyncFunction("queryRecentDataSafe") { (types: [String], hours: Int) -> [String: [[String: Any]]] in
  let endDate = Date()
  let startDate = Calendar.current.date(byAdding: .hour, value: -hours, to: endDate) ?? endDate
  
  return try await self.queryDataInRange(
    types: types, 
    startDateISO: ISO8601DateFormatter().string(from: startDate),
    endDateISO: ISO8601DateFormatter().string(from: endDate)
  )
}

// Add new event for data streaming
Events("onSyncEvent")
Events("onDataStream")
    OnCreate {
      self.loadAnchors()
    }

    OnDestroy {
      self.stopAllObservers()
    }
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
    //Converts the types strings to Healthkit types. JS can only send a list of Strings, but we convert them to HKSampleType
    let healthKitTypes = types.compactMap { typeString -> HKSampleType? in
      return self.healthKitTypeFromString(typeString)
    }
    
    log("👁️ Starting background sync for: \(healthKitTypes.map { $0.identifier })")
    
    self.stopAllObservers()
    
    for type in healthKitTypes {
      let observerQuery = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] query, completionHandler, error in
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
      } catch {
        print("Failed to enable background delivery for \(type.identifier): \(error)")
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
    // ECG type (iOS 12.2+)
    if typeString == "HKElectrocardiogramType" {
      if #available(iOS 12.2, *) {
        return HKObjectType.electrocardiogramType()
      }
    }
    
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
  
  // Limit to essential types for large date ranges
  let limitedTypes = daysDiff > 7 ? getLimitedHealthTypes(from: types) : types
  log("🎯 Processing \(limitedTypes.count) types (limited from \(types.count) due to \(daysDiff) day range)")
  
  let healthKitTypes = limitedTypes.compactMap { typeString -> HKSampleType? in
    return self.healthKitTypeFromString(typeString)
  }
  
  var allData: [String: [[String: Any]]] = [:]
  
  // Process types one by one to avoid memory issues
  for (index, type) in healthKitTypes.enumerated() {
    log("📊 Processing type \(index + 1)/\(healthKitTypes.count): \(type.identifier)")
    
    do {
      let samples = try await queryHistoricalDataSafely(for: type, from: validStartDate, to: validEndDate)
      allData[type.identifier] = samples
      log("✅ Found \(samples.count) samples for \(type.identifier)")
      
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
    if dataType == "HKDataTypeIdentifierElectrocardiogram" {
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
  
  // Upload the data
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

// MARK: - Heartbeat Series Query
@available(iOS 13.0, *)
private func queryHeartbeatSeries(startDateISO: String, endDateISO: String) async throws -> [String: Any] {
  log("🫀 Starting heartbeat series query from \(startDateISO) to \(endDateISO)")
  
  // Parse dates using the same logic as other queries
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  
  guard let startDate = formatter.date(from: startDateISO),
        let endDate = formatter.date(from: endDateISO) else {
    throw NSError(domain: "HealthKit", code: 3, userInfo: [
      NSLocalizedDescriptionKey: "Invalid date format for heartbeat series query"
    ])
  }
  
  // Step 1: Query for HKHeartbeatSeriesSample objects
  let heartbeatSeriesSamples = try await queryHeartbeatSeriesSamples(from: startDate, to: endDate)
  
  if heartbeatSeriesSamples.isEmpty {
    log("⚠️ No heartbeat series samples found in date range")
    return [
      "success": true,
      "message": "No heartbeat series data found",
      "series_count": 0,
      "total_beats": 0,
      "series": []
    ]
  }
  
  log("✅ Found \(heartbeatSeriesSamples.count) heartbeat series samples")
  
  // Step 2: Query beat-by-beat data for each series
  var allSeriesData: [[String: Any]] = []
  var totalBeats = 0
  
  for (index, seriesSample) in heartbeatSeriesSamples.enumerated() {
    log("🫀 Processing series \(index + 1)/\(heartbeatSeriesSamples.count): \(seriesSample.uuid)")
    
    let beatsData = try await queryBeatsInSeries(seriesSample)
    totalBeats += beatsData.count
    
    let seriesInfo: [String: Any] = [
      "uuid": seriesSample.uuid.uuidString,
      "start_date": ISO8601DateFormatter().string(from: seriesSample.startDate),
      "end_date": ISO8601DateFormatter().string(from: seriesSample.endDate),
      "source_name": seriesSample.sourceRevision.source.name,
      "beat_count": beatsData.count,
      "beats": beatsData
    ]
    
    allSeriesData.append(seriesInfo)
  }
  
  log("✅ Heartbeat series query complete: \(allSeriesData.count) series, \(totalBeats) total beats")
  
  return [
    "success": true,
    "message": "Heartbeat series data retrieved successfully",
    "series_count": allSeriesData.count,
    "total_beats": totalBeats,
    "date_range": [
      "start": startDateISO,
      "end": endDateISO
    ],
    "series": allSeriesData
  ]
}

@available(iOS 13.0, *)
private func queryHeartbeatSeriesSamples(from startDate: Date, to endDate: Date) async throws -> [HKHeartbeatSeriesSample] {
  let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
  
  return try await withCheckedThrowingContinuation { continuation in
    let query = HKSampleQuery(
      sampleType: HKSeriesType.heartbeat(),
      predicate: predicate,
      //TODO: Maybe change this limit?
      limit: 50, // Reasonable limit for series samples
      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]
    ) { _, samples, error in
      if let error = error {
        log("❌ Heartbeat series sample query error: \(error.localizedDescription)")
        continuation.resume(throwing: error)
        return
      }
      
      let heartbeatSamples = (samples as? [HKHeartbeatSeriesSample]) ?? []
      log("📥 Found \(heartbeatSamples.count) heartbeat series samples")
      continuation.resume(returning: heartbeatSamples)
    }
    
    healthStore.execute(query)
  }
}

@available(iOS 13.0, *)
private func queryBeatsInSeries(_ seriesSample: HKHeartbeatSeriesSample) async throws -> [[String: Any]] {
  return try await withCheckedThrowingContinuation { continuation in
    var beatsData: [[String: Any]] = []
    let seriesStartDate = seriesSample.startDate
    
    let query = HKHeartbeatSeriesQuery(heartbeatSeries: seriesSample) { query, timeSinceSeriesStart, precededByGap, done, error in
      
      if let error = error {
        log("❌ Heartbeat series query error: \(error.localizedDescription)")
        continuation.resume(throwing: error)
        return
      }
      
      // Process each beat
      if timeSinceSeriesStart >= 0 {
        let absoluteTime = seriesStartDate.addingTimeInterval(timeSinceSeriesStart)
        let beatInfo: [String: Any] = [
          "time_since_start": timeSinceSeriesStart,
          "absolute_time": ISO8601DateFormatter().string(from: absoluteTime),
          "preceded_by_gap": precededByGap
        ]
        beatsData.append(beatInfo)
      }
      
      // When done, return all collected beats
      if done {
        log("✅ Collected \(beatsData.count) beats from series \(seriesSample.uuid)")
        continuation.resume(returning: beatsData)
      }
    }
    
    healthStore.execute(query)
  }
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
  if #available(iOS 12.2, *), let ecgSample = sample as? HKElectrocardiogram {
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
  let essentialTypes = [
    "HKQuantityTypeIdentifierStepCount",
    "HKQuantityTypeIdentifierHeartRate", 
    "HKQuantityTypeIdentifierActiveEnergyBurned",
    "HKCategoryTypeIdentifierSleepAnalysis",
    "HKWorkoutTypeIdentifier"
  ]
  
  return types.filter { essentialTypes.contains($0) }
}

// MARK: - Enhanced Background Updates with Native Upload
@MainActor
private func handleBackgroundUpdate(for type: HKSampleType) async {
  do {
    let result = try await self.performAnchoredQuery(for: type)
    
    // Get the actual new samples for upload
    if result.added > 0 {
      let newSamplesDict = try await getRecentSamples(for: type, count: result.added)
      
      // Save locally for offline capability
      await saveDataLocally(samples: newSamplesDict)
      
      // Upload samples directly via Swift
      await uploader.uploadRawSamples(newSamplesDict, batchType: "realtime")
      
      if type.identifier == "HKDataTypeIdentifierElectrocardiogram" {
        log("✅ Background update: \(result.added) ECG samples with voltage data uploaded")
      } else {
        log("✅ Background update: \(result.added) \(type.identifier) samples uploaded")
      }
    }
    
    // Send sync event for monitoring (keep for debugging)
    self.sendEvent("onSyncEvent", [
      "phase": "observer",
      "message": "Background update for \(type.identifier)",
      "counts": [
        "added": result.added,
        "deleted": result.deleted
      ]
    ])
  } catch {
    log("❌ Error in background update for \(type.identifier): \(error)")
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
@available(iOS 12.2, *)
private func ecgSampleToDictionary(_ ecgSample: HKElectrocardiogram, voltagePoints: [[String: Any]]) async -> [String: Any] {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  
  var dict: [String: Any] = [
    "startDate": formatter.string(from: ecgSample.startDate),
    "endDate": formatter.string(from: ecgSample.endDate),
    "type": "HKElectrocardiogramType",
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
      log("🫀 ECG voltage data size: \(voltageDataSize) bytes (\(String(format: "%.2f", Double(voltageDataSize) / 1024 / 1024)) MB)")
      
      // If voltage data is larger than 1MB, upload to S3
      if voltageDataSize > 1024 * 1024 {
        log("📤 Large voltage data detected, uploading to S3...")
        
        // Upload to S3 and get S3 key
        if let s3Key = await uploader.uploadVoltageDataToS3(voltagePoints, sampleUUID: ecgSample.uuid.uuidString) {
          // Replace voltage points with S3 reference
          dict["voltageS3Key"] = s3Key
          dict["voltageDataUploaded"] = true
          log("✅ Voltage data uploaded to S3: \(s3Key)")
        } else {
          // S3 upload failed, include smaller subset of voltage data
          log("❌ S3 upload failed, including limited voltage data")
          let limitedVoltagePoints = Array(voltagePoints.prefix(100)) // First 100 points only
          dict["voltagePoints"] = limitedVoltagePoints
          dict["voltageDataTruncated"] = true
          dict["originalVoltagePointsCount"] = voltagePoints.count
        }
      } else {
        // Small voltage data, include directly in payload
        log("📦 Small voltage data, including in payload")
        dict["voltagePoints"] = voltagePoints
        dict["voltageDataUploaded"] = false
      }
      
      // Always include voltage points count for reference
      dict["voltagePointsCount"] = voltagePoints.count
      
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