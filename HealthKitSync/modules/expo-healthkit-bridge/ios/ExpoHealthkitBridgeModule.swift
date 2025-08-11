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
    print("✅ DEBUG: Converted to \(healthKitTypes.count) valid HealthKit types")

    let typesToRequest = Set(healthKitTypes)
    
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

  private func startBackgroundSync(types: [String]) async throws {
    let healthKitTypes = types.compactMap { typeString -> HKSampleType? in
      return self.healthKitTypeFromString(typeString)
    }
    
    self.stopAllObservers()
    
    for type in healthKitTypes {
      let observerQuery = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] query, completionHandler, error in
        if let error = error {
          print("Observer query error: \(error)")
          return
        }
        
        Task { @MainActor in
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
          Task { @MainActor in
            self?.anchors[type.identifier] = newAnchor
            self?.saveAnchors()
          }
        }
        
        // Update last sync date
        Task { @MainActor in
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
      
      let sampleData = samples.compactMap { sample -> [String: Any]? in
        return self.sampleToDictionarySafely(sample)
      }
      
      log("✅ Processed \(sampleData.count) valid samples for \(type.identifier)")
      continuation.resume(returning: sampleData)
    }
    
    healthStore.execute(query)
  }
}

// MARK: - Enhanced Data Dictionary
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
  
  // Safely handle different sample types
  if let quantitySample = sample as? HKQuantitySample {
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
  } else if let workout = sample as? HKWorkout {
    dict["workoutActivityType"] = workout.workoutActivityType.rawValue
    dict["duration"] = workout.duration
    dict["unit"] = "workout"
  }

  // Safely handle metadata
  if let metadata = sample.metadata, !metadata.isEmpty {
    let safeMetadata = metadata.compactMapValues { value -> Any? in
      if JSONSerialization.isValidJSONObject([value]) {
        return value
      } else {
        return String(describing: value)
      }
    }
    if !safeMetadata.isEmpty {
      dict["metadata"] = safeMetadata
    }
  }

  return dict
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

// MARK: - Enhanced Background Updates with Streaming
@MainActor
private func handleBackgroundUpdate(for type: HKSampleType) async {
  do {
    let result = try await self.performAnchoredQuery(for: type)
    
    // Get the actual new samples for streaming
    if result.added > 0 {
      let newSamples = try await getRecentSamples(for: type, count: result.added)
      
      // Send streaming event with actual sample data
      self.sendEvent("onDataStream", [
        "type": type.identifier,
        "samples": newSamples,
        "timestamp": ISO8601DateFormatter().string(from: Date())
      ])
      
      // Also save locally for offline capability
      await saveDataLocally(samples: newSamples)
    }
    
    self.sendEvent("onSyncEvent", [
      "phase": "observer",
      "message": "Background update for \(type.identifier)",
      "counts": [
        "added": result.added,
        "deleted": result.deleted
      ]
    ])
  } catch {
    log("Error in background update for \(type.identifier): \(error)")
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
      
      let sampleData = samples?.compactMap { sample -> [String: Any]? in
        return self.sampleToDictionarySafely(sample)
      } ?? []
      
      continuation.resume(returning: sampleData)
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
}