import Foundation

/// Raw health data sample - minimal wrapper around HealthKit data
struct RawHealthSample: Codable {
    let rawData: [String: Any]  // Direct HealthKit sample data
    
    // Custom encoding to handle Any type
    func encode(to encoder: Encoder) throws {
        // Convert [String: Any] to JSON data, then back to a Codable-compatible format
        let jsonData = try JSONSerialization.data(withJSONObject: rawData)
        
        // Decode as [String: String] for simplicity (metadata values as strings)
        if let jsonDict = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
            // Convert all values to strings for JSON compatibility
            let stringDict = jsonDict.mapValues { value in
                if let stringValue = value as? String {
                    return stringValue
                } else {
                    return String(describing: value)
                }
            }
            
            var container = encoder.singleValueContainer()
            try container.encode(stringDict)
        } else {
            var container = encoder.singleValueContainer()
            try container.encode([String: String]())
        }
    }
    
    // Custom decoding
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let stringDict = try container.decode([String: String].self)
        
        // Convert back to [String: Any] format
        self.rawData = stringDict.mapValues { $0 as Any }
    }
    
    // Direct initializer from HealthKit data
    init(rawData: [String: Any]) {
        self.rawData = rawData
    }
}

/// Simplified batch metadata
struct RawUploadMetadata: Codable {
    let totalSamples: Int           // Number of samples in this batch
    let batchType: String           // "realtime", "historical", or "manual"
    let timestamp: String           // Upload timestamp
    
    private enum CodingKeys: String, CodingKey {
        case totalSamples = "total_samples"
        case batchType = "batch_type"
        case timestamp
    }
}

/// Simplified upload batch sent to the API
struct RawUploadBatch: Codable {
    let userId: String                    // User identifier
    let samples: [RawHealthSample]        // Array of raw health samples
    let metadata: RawUploadMetadata       // Batch metadata
    
    private enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case samples
        case metadata
    }
}

/// Configuration for the health data uploader
struct UploadConfig: Codable {
    let apiUrl: String      // Base API URL (e.g., "https://api.example.com")
    let userId: String      // User identifier
    let authHeaders: [String: String] // Authentication headers (empty for now)
    
    // UserDefaults key for persistence -> This is the local storage key where IOS's health data gets stored locally
    static let userDefaultsKey = "HealthDataUploaderConfig"
    
    /// Save configuration to UserDefaults
    func save() throws {
        let data = try JSONEncoder().encode(self)
        UserDefaults.standard.set(data, forKey: Self.userDefaultsKey)
        print("✅ UploadConfig: Saved configuration for user \(userId)")
    }
    
    /// Load configuration from UserDefaults
    static func load() throws -> UploadConfig {
        guard let data = UserDefaults.standard.data(forKey: userDefaultsKey) else {
            throw UploadConfigError.notFound
        }
        
        let config = try JSONDecoder().decode(UploadConfig.self, from: data)
        print("✅ UploadConfig: Loaded configuration for user \(config.userId)")
        return config
    }
    
    /// Check if configuration exists
    static func exists() -> Bool {
        return UserDefaults.standard.data(forKey: userDefaultsKey) != nil
    }
    
    /// Clear stored configuration
    static func clear() {
        UserDefaults.standard.removeObject(forKey: userDefaultsKey)
        print("🧹 UploadConfig: Cleared stored configuration")
    }
}

/// Errors related to upload configuration
enum UploadConfigError: Error, LocalizedError {
    case notFound
    case invalidData
    case missingApiUrl
    case missingUserId
    
    var errorDescription: String? {
        switch self {
        case .notFound:
            return "Upload configuration not found. Please configure uploader first."
        case .invalidData:
            return "Invalid upload configuration data."
        case .missingApiUrl:
            return "API URL is required for upload configuration."
        case .missingUserId:
            return "User ID is required for upload configuration."
        }
    }
}

/// Simplified response from upload API
struct RawUploadResponse: Codable {
    let success: Bool
    let message: String?
    let samplesReceived: Int?
    
    private enum CodingKeys: String, CodingKey {
        case success
        case message
        case samplesReceived = "samples_received"
    }
}

// MARK: - Helper Extensions

extension Array where Element == RawHealthSample {
    /// Get basic sample count for metadata
    var sampleCount: Int {
        return self.count
    }
    
    /// Extract data types from raw samples (best effort)
    var extractedDataTypes: [String] {
        return self.compactMap { sample in
            sample.rawData["type"] as? String
        }.uniqued()
    }
}

// MARK: - Utility Extensions

extension Array where Element: Hashable {
    /// Remove duplicates while preserving order
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

//--------------------------------ECG Voltage Data Upload (To S3)--------------------------------
struct PresignedURLResponse: Codable {
    let status: String
    let message: String
    let s3Key: String
    let uploadURL: String
    let uploadFields: [String: String]
    let expiresInMinutes: Int
    
    private enum CodingKeys: String, CodingKey {
        case status
        case message
        case s3Key = "s3_key"
        case uploadURL = "upload_url"
        case uploadFields = "upload_fields"
        case expiresInMinutes = "expires_in_minutes"
    }
}

struct PresignedURLData {
    let s3Key: String
    let uploadURL: String
    let uploadFields: [String: String]
}

