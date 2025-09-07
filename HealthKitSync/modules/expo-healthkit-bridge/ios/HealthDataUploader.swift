import Foundation
//Native Swift module that manages data uploads to our Lambda function -> Allows background uploads and processing
//Models (e.g. UploadConfig) are defined in UploadModels.swift
class HealthDataUploader {
    private var config: UploadConfig?
    
    // Configuration constants
    private let maxRetries = 3           // Maximum retry attempts for failed uploads
    private let timeoutInterval: TimeInterval = 30.0  // HTTP request timeout
    
//--------------------------------Initialization--------------------------------
    init() {
        loadConfiguration()
    }
    
//--------------------------------Configuration Management--------------------------------
    /// Load configuration from UserDefaults
    private func loadConfiguration() {
        do {
            self.config = try UploadConfig.load()
            uploaderLog("✅ HealthDataUploader: Configuration loaded for user \(config?.userId ?? "unknown")")
        } catch {
            uploaderLog("⚠️ HealthDataUploader: No configuration found - \(error.localizedDescription)")
            self.config = nil
        }
    }
    
    /// Update configuration (called from JavaScript)
    //Configuration for uploads get set, this is where the API Url also gets set
    /////SettingsScreen calls configureUploader (in ExpoHealthkitBridgeModule.swift) which calls this
    func configure(apiUrl: String, userId: String, authHeaders: [String: String] = [:]) throws {
        guard !apiUrl.isEmpty else {
            throw UploadConfigError.missingApiUrl
        }
        guard !userId.isEmpty else {
            throw UploadConfigError.missingUserId
        }
        
        let newConfig = UploadConfig(
            apiUrl: apiUrl,
            userId: userId,
            authHeaders: authHeaders
        )
        
        try newConfig.save()
        self.config = newConfig
        
        uploaderLog("✅ HealthDataUploader: Configured for user \(userId) with API \(apiUrl)")
    }
    
//--------------------------------Public Upload Methods--------------------------------
    /// Upload raw health data immediately (for real-time streaming)
    func uploadRawSamples(_ rawSamples: [[String: Any]], batchType: String = "realtime") async -> Bool {
        guard !rawSamples.isEmpty else {
            uploaderLog("📭 HealthDataUploader: No samples to upload")
            return false
        }
        
        guard let config = self.config else {
            uploaderLog("❌ HealthDataUploader: No configuration available - cannot upload")
            return false
        }
        
        uploaderLog("📤 HealthDataUploader: Uploading \(rawSamples.count) raw samples (type: \(batchType))")
        
        // Convert to RawHealthSample objects
        let samples = rawSamples.map { RawHealthSample(rawData: $0) }
        
        let success = await uploadBatch(samples: samples, batchType: batchType, config: config)
        
        if success {
            uploaderLog("✅ HealthDataUploader: Successfully uploaded \(rawSamples.count) raw samples")
        } else {
            uploaderLog("❌ HealthDataUploader: Failed to upload \(rawSamples.count) raw samples")
        }
        
        return success
    }
    
    /// Upload historical data for a specific date range (manual upload)
    /// This method processes data that has already been fetched by the bridge module
    func uploadHistoricalData(_ historicalData: [String: [[String: Any]]], startDate: String, endDate: String) async -> (success: Bool, message: String) {
        guard let config = self.config else {
            uploaderLog("❌ HealthDataUploader: No configuration available - cannot upload historical data")
            return (false, "No configuration available")
        }
        
        uploaderLog("📅 HealthDataUploader: Processing historical data from \(startDate) to \(endDate)")
        
        // Flatten all samples from different data types into one array
        var allSamples: [[String: Any]] = []
        var totalSamplesByType: [String: Int] = [:]
        
        for (dataType, samples) in historicalData {
            allSamples.append(contentsOf: samples)
            totalSamplesByType[dataType] = samples.count
            uploaderLog("📊 HealthDataUploader: \(dataType): \(samples.count) samples")
        }
        
        guard !allSamples.isEmpty else {
            let message = "No historical data found for the specified date range"
            uploaderLog("📭 HealthDataUploader: \(message)")
            return (false, message)
        }
        
        uploaderLog("📤 HealthDataUploader: Uploading \(allSamples.count) historical samples across \(historicalData.count) data types")
        
        // Convert to RawHealthSample objects
        let samples = allSamples.map { RawHealthSample(rawData: $0) }
        
        // Upload as historical batch
        let success = await uploadBatch(samples: samples, batchType: "historical", config: config)
        
        if success {
            let message = "Successfully uploaded \(allSamples.count) historical samples"
            uploaderLog("✅ HealthDataUploader: \(message)")
            return (true, message)
        } else {
            let message = "Failed to upload historical samples"
            uploaderLog("❌ HealthDataUploader: \(message)")
            return (false, message)
        }
    }
    
    // MARK: - Private Upload Implementation
    
    /// Triggers the actual upload
    private func uploadBatch(samples: [RawHealthSample], batchType: String, config: UploadConfig) async -> Bool {
        //Creates what we will be uploading
        let batch = createRawUploadBatch(
            samples: samples,
            batchType: batchType,
            config: config
        )
        
        return await uploadWithRetry(batch: batch, config: config)
    }
    
    /// Create simplified upload batch with minimal metadata
    private func createRawUploadBatch(samples: [RawHealthSample], batchType: String, config: UploadConfig) -> RawUploadBatch {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        let metadata = RawUploadMetadata(
            totalSamples: samples.count,
            batchType: batchType,
            timestamp: formatter.string(from: Date())
        )
        
        return RawUploadBatch(
            userId: config.userId,
            samples: samples,
            metadata: metadata
        )
    }
    
    /// HTTP upload with retry logic - updated for raw batch
    private func uploadWithRetry(batch: RawUploadBatch, config: UploadConfig) async -> Bool {
        //API Gateway Endpoint is here
        let uploadUrl = "\(config.apiUrl)/upload-health-data"
        
        for attempt in 1...maxRetries {
            do {
                uploaderLog("🔗 HealthDataUploader: Attempt \(attempt)/\(maxRetries) - uploading to \(uploadUrl)")
                
                let success = try await performUpload(batch: batch, uploadUrl: uploadUrl, config: config)
                
                if success {
                    uploaderLog("✅ HealthDataUploader: Upload successful on attempt \(attempt)")
                    return true
                }
                
            } catch {
                uploaderLog("❌ HealthDataUploader: Upload attempt \(attempt) failed - \(error.localizedDescription)")
                
                // Add detailed error information
                if let urlError = error as? URLError {
                    logNetworkError(urlError, uploadUrl: uploadUrl)
                }
                
                // Wait before retry (exponential backoff)
                if attempt < maxRetries {
                    let delay = pow(2.0, Double(attempt)) // 2, 4, 8 seconds
                    uploaderLog("⏱️ HealthDataUploader: Retrying in \(delay) seconds...")
                    try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            }
        }
        
        uploaderLog("❌ HealthDataUploader: All \(maxRetries) upload attempts failed")
        return false
    }
    
    /// Perform the actual HTTP upload - updated for raw batch
    private func performUpload(batch: RawUploadBatch, uploadUrl: String, config: UploadConfig) async throws -> Bool {
        guard let url = URL(string: uploadUrl) else {
            throw URLError(.badURL)
        }
        
        // Create HTTP request
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = timeoutInterval
        
        //TODO: Might need to add authentication headers here eventually
        // Add authentication headers
        for (key, value) in config.authHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        
        // Serialize batch to JSON
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(batch)
        
        // Log detailed request information
        logDetailedRequest(request: request, batch: batch)
        
        // Perform network request
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        
        // Log detailed server response information
        logDetailedServerResponse(httpResponse: httpResponse, data: data)
        
        // Handle response
        if httpResponse.statusCode == 200 {
            // Try to parse simplified response
            if let uploadResponse = try? JSONDecoder().decode(RawUploadResponse.self, from: data) {
                logRawUploadResponse(uploadResponse, sampleCount: batch.samples.count)
            } else {
                uploaderLog("✅ HealthDataUploader: Upload successful (raw response format)")
            }
            return true
        } else {
            // All non-200 responses are errors
            throw URLError(.badServerResponse)
        }
    }
    
//--------------------------------Logging Helpers--------------------------------
    private func logDetailedRequest(request: URLRequest, batch: RawUploadBatch) {
        uploaderLog("📤 HealthDataUploader: Request Details:")
        uploaderLog("  🎯 URL: \(request.url?.absoluteString ?? "Unknown")")
        uploaderLog("  🔧 Method: \(request.httpMethod ?? "Unknown")")
        let bodySize = request.httpBody?.count ?? 0
        uploaderLog("  📦 Body Size: \(bodySize) bytes (\(String(format: "%.2f", Double(bodySize) / 1024 / 1024)) MB)")
        
        // Add size warnings
        if bodySize > 6 * 1024 * 1024 {  // 6MB - Lambda sync limit
            uploaderLog("  ⚠️ WARNING: Payload > 6MB may hit Lambda synchronous limits")
        }
        if bodySize > 9 * 1024 * 1024 {  // 9MB - getting close to API Gateway limit
            uploaderLog("  🚨 CRITICAL: Payload > 9MB approaching API Gateway 10MB limit!")
        }
        
        uploaderLog("  ⏱️ Timeout: \(request.timeoutInterval) seconds")
        
        // Log request headers
        uploaderLog("  📋 Request Headers:")
        if let headers = request.allHTTPHeaderFields {
            for (key, value) in headers {
                // Don't log sensitive auth data in full
                if key.lowercased().contains("auth") || key.lowercased().contains("token") {
                    uploaderLog("     \(key): ***REDACTED***")
                } else {
                    uploaderLog("     \(key): \(value)")
                }
            }
        }
        
        // Log batch summary
        uploaderLog("  📊 Batch Summary:")
        uploaderLog("     User ID: \(batch.userId)")
        uploaderLog("     Sample Count: \(batch.samples.count)")
        uploaderLog("     Batch Type: \(batch.metadata.batchType)")
        uploaderLog("     Timestamp: \(batch.metadata.timestamp)")
        
        // Log data type breakdown
        let dataTypeCount = Dictionary(grouping: batch.samples, by: { sample in
            sample.rawData["type"] as? String ?? "unknown"
        }).mapValues { $0.count }
        
        uploaderLog("  📈 Data Type Breakdown:")
        for (dataType, count) in dataTypeCount.sorted(by: { $0.key < $1.key }) {
            uploaderLog("     \(dataType): \(count) samples")
        }
        
        // Special logging for ECG data
        let ecgSamples = batch.samples.filter { sample in
            sample.rawData["type"] as? String == "HKDataTypeIdentifierElectrocardiogram"
        }
        if !ecgSamples.isEmpty {
            uploaderLog("  🫀 ECG Data Details:")
            for (index, ecg) in ecgSamples.enumerated() {
                let voltageCount = (ecg.rawData["voltagePoints"] as? [[String: Any]])?.count ?? 0
                let classification = ecg.rawData["ecgClassification"] as? String ?? "unknown"
                uploaderLog("     ECG \(index + 1): \(classification), \(voltageCount) voltage points")
            }
        }
    }
    
    private func logDetailedServerResponse(httpResponse: HTTPURLResponse, data: Data) {
        uploaderLog("📥 HealthDataUploader: Server Response Details:")
        uploaderLog("  🔢 Status Code: \(httpResponse.statusCode)")
        uploaderLog("  📊 Response Size: \(data.count) bytes")
        
        // Log response headers (useful for debugging)
        uploaderLog("  📋 Response Headers:")
        for (key, value) in httpResponse.allHeaderFields {
            uploaderLog("     \(key): \(value)")
        }
        
        // Parse and log response body
        if let responseText = String(data: data, encoding: .utf8) {
            uploaderLog("  📄 Response Body:")
            
            // Try to pretty-print JSON if possible
            if let jsonObject = try? JSONSerialization.jsonObject(with: data),
               let prettyData = try? JSONSerialization.data(withJSONObject: jsonObject, options: .prettyPrinted),
               let prettyJson = String(data: prettyData, encoding: .utf8) {
                uploaderLog("     \(prettyJson)")
            } else {
                // Fallback to raw text (truncate if too long)
                let truncatedText = responseText.count > 1000 ? 
                    String(responseText.prefix(1000)) + "... (truncated)" : responseText
                uploaderLog("     \(truncatedText)")
            }
        } else {
            uploaderLog("  📄 Response Body: Unable to decode as UTF-8 text")
        }
        
        // Status-specific analysis
        switch httpResponse.statusCode {
        case 200:
            uploaderLog("  ✅ Success: Request processed successfully")
        case 400:
            uploaderLog("  ❌ Bad Request: Invalid request format or parameters")
        case 401:
            uploaderLog("  🔒 Unauthorized: Authentication required or invalid")
        case 403:
            uploaderLog("  🚫 Forbidden: Access denied")
        case 413:
            uploaderLog("  📦 Payload Too Large: Request body exceeds server limits")
        case 429:
            uploaderLog("  ⏱️ Rate Limited: Too many requests")
        case 500:
            uploaderLog("  💥 Internal Server Error: Server-side error occurred")
        case 502:
            uploaderLog("  🌐 Bad Gateway: Upstream server error")
        case 503:
            uploaderLog("  🚧 Service Unavailable: Server temporarily unavailable")
        case 504:
            uploaderLog("  ⏰ Gateway Timeout: Server took too long to respond")
        default:
            uploaderLog("  ❓ Unexpected Status: \(httpResponse.statusCode)")
        }
    }
    
    private func logNetworkError(_ error: URLError, uploadUrl: String) {
        uploaderLog("🔍 HealthDataUploader: Network error details:")
        uploaderLog("  - Error code: \(error.code.rawValue)")
        uploaderLog("  - Description: \(error.localizedDescription)")
        uploaderLog("  - URL: \(uploadUrl)")
        
        switch error.code {
        case .notConnectedToInternet:
            uploaderLog("  - Cause: No internet connection")
        case .timedOut:
            uploaderLog("  - Cause: Request timed out after \(timeoutInterval) seconds")
        case .cannotFindHost:
            uploaderLog("  - Cause: Cannot resolve hostname")
        case .networkConnectionLost:
            uploaderLog("  - Cause: Network connection lost during request")
        case .badServerResponse:
            uploaderLog("  - Cause: Invalid server response")
        default:
            uploaderLog("  - Cause: Other network issue")
        }
    }
    
    private func logRawUploadResponse(_ response: RawUploadResponse, sampleCount: Int) {
        if let received = response.samplesReceived {
            uploaderLog("✅ HealthDataUploader: Server received \(received) raw samples")
        } else {
            uploaderLog("✅ HealthDataUploader: Successfully uploaded \(sampleCount) raw samples")
        }
        
        if let message = response.message {
            uploaderLog("📝 HealthDataUploader: Server message: \(message)")
        }
    }


//--------------------------------ECG Voltage Data Upload (To S3)--------------------------------
    /// Upload ECG voltage data to S3 using presigned URLs
    /// Returns the S3 key if successful, nil if failed
    func uploadVoltageDataToS3(_ voltagePoints: [[String: Any]], sampleUUID: String) async -> String? {
        guard let config = self.config else {
            uploaderLog("❌ No configuration available for S3 upload")
            return nil
        }
        
        guard !voltagePoints.isEmpty else {
            uploaderLog("⚠️ No voltage points to upload")
            return nil
        }
        
        uploaderLog("🫀 Starting S3 upload for ECG voltage data: \(sampleUUID)")
        uploaderLog("📊 Voltage points count: \(voltagePoints.count)")
        
        do {
            // Step 1: Get presigned URL from Lambda
            let presignedData = try await getPresignedURL(userId: config.userId, sampleUUID: sampleUUID, voltagePoints: voltagePoints)
            
            // Step 2: Upload voltage data directly to S3
            let uploadSuccess = try await uploadToS3(voltagePoints: voltagePoints, presignedData: presignedData)
            
            if uploadSuccess {
                uploaderLog("✅ Successfully uploaded voltage data to S3: \(presignedData.s3Key)")
                return presignedData.s3Key //Returns the S3 Object key which we send to /upload-health-data
            } else {
                uploaderLog("❌ Failed to upload voltage data to S3")
                return nil
            }
            
        } catch {
            uploaderLog("❌ Error in S3 voltage upload: \(error.localizedDescription)")
            return nil
        }
    }
    
    // MARK: - Private S3 Upload Helpers
    
    private func getPresignedURL(userId: String, sampleUUID: String, voltagePoints: [[String: Any]]) async throws -> PresignedURLData {
        guard let config = self.config else {
            throw UploadConfigError.notFound
        }
        
        let presignedURL = "\(config.apiUrl)/get-presigned-url"
        
        // Estimate size of voltage data JSON
        let voltageJSON = try JSONSerialization.data(withJSONObject: voltagePoints, options: [])
        let estimatedSize = voltageJSON.count
        
        let requestBody: [String: Any] = [
            "user_id": userId,
            "sample_uuid": sampleUUID,
            "estimated_size": estimatedSize
        ]
        
        uploaderLog("📤 Requesting presigned URL for \(estimatedSize) bytes of voltage data")
        
        // Create HTTP request
        guard let url = URL(string: presignedURL) else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15.0
        
        // Add auth headers if available
        for (key, value) in config.authHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
        
        // Make request
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        
        if httpResponse.statusCode == 200 {
            let presignedResponse = try JSONDecoder().decode(PresignedURLResponse.self, from: data)
            uploaderLog("✅ Received presigned URL for S3 key: \(presignedResponse.s3Key)")
            
            return PresignedURLData(
                s3Key: presignedResponse.s3Key,
                uploadURL: presignedResponse.uploadURL,
                uploadFields: presignedResponse.uploadFields
            )
        } else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw NSError(domain: "PresignedURL", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorBody])
        }
    }
    
    private func uploadToS3(voltagePoints: [[String: Any]], presignedData: PresignedURLData) async throws -> Bool {
        // Convert voltage points to JSON
        let voltageJSON = try JSONSerialization.data(withJSONObject: voltagePoints, options: .prettyPrinted)
        
        uploaderLog("📤 Uploading \(voltageJSON.count) bytes to S3")
        
        // Create multipart form request
        guard let url = URL(string: presignedData.uploadURL) else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 60.0 // Longer timeout for S3 upload
        
        // Create multipart body
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // Add presigned fields
        for (key, value) in presignedData.uploadFields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        
        // Add file data
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"voltage_data.json\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/json\r\n\r\n".data(using: .utf8)!)
        body.append(voltageJSON)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = body
        
        // Upload to S3
        let (_, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        
        // S3 returns 204 for successful uploads
        let success = httpResponse.statusCode == 204 || httpResponse.statusCode == 200
        
        if success {
            uploaderLog("✅ S3 upload completed successfully")
        } else {
            uploaderLog("❌ S3 upload failed with status: \(httpResponse.statusCode)")
        }
        
        return success
    }

}

// MARK: - Utility Functions

/// Custom logging function for easy filtering
//TODO: Use this methodology for clearer and better logs
private func uploaderLog(_ message: String) {
    print("🔍 UPLOADER_DEBUG: \(message)")
}

