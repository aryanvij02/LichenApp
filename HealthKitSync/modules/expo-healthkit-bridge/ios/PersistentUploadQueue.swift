import Foundation
import SQLite3

/// Persistent queue for health data samples that failed immediate upload
/// Provides SQLite-backed storage with retry logic and status management
class PersistentUploadQueue: @unchecked Sendable {
    static let shared = PersistentUploadQueue()
    
    private let dbURL: URL
    private var db: OpaquePointer?
    private let dbQueue = DispatchQueue(label: "com.lichenapp.uploadqueue", qos: .utility)
    
    // MARK: - Data Models
    
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
        
        /// Check if this item should be retried based on retry configuration
        func shouldRetry(maxRetries: Int = 5, backoffMultiplier: TimeInterval = 2.0, maxBackoffInterval: TimeInterval = 3600) -> Bool {
            guard retryCount < maxRetries else { return false }
            guard status == .failed else { return false }
            
            if let lastAttempt = lastAttempt {
                let backoffDelay = getCurrentBackoffDelay()
                let nextRetryTime = lastAttempt.addingTimeInterval(backoffDelay)
                return Date() >= nextRetryTime
            }
            
            return true // No previous attempt, can retry immediately
        }
        
        /// Get current backoff delay for this item
        func getCurrentBackoffDelay() -> TimeInterval {
            let baseDelay: TimeInterval = 60 // 1 minute base
            let exponentialDelay = baseDelay * pow(2.0, Double(retryCount))
            return min(exponentialDelay, 3600) // Max 1 hour
        }
        
        /// Calculate priority score for queue ordering
        func getRetryPriorityScore() -> Int {
            let priorityBonus = priority.rawValue * 1000
            let ageBonus = min(Int(Date().timeIntervalSince(createdAt) / 60), 500) // Age in minutes, capped
            let retryPenalty = retryCount * 50
            
            return priorityBonus + ageBonus - retryPenalty
        }
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
    
    // MARK: - Initialization
    
    private init() {
        // Create database in Documents directory
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        dbURL = documentsPath.appendingPathComponent("upload_queue.sqlite")
        
        openDatabase()
        createTables()
    }
    
    deinit {
        closeDatabase()
    }
    
    // MARK: - Database Management
    
    private func openDatabase() {
        let result = sqlite3_open(dbURL.path, &db)
        if result != SQLITE_OK {
            print("❌ Failed to open upload queue database: \(String(cString: sqlite3_errmsg(db)))")
            db = nil
        } else {
            print("✅ Upload queue database opened successfully")
        }
    }
    
    private func closeDatabase() {
        if db != nil {
            sqlite3_close(db)
            db = nil
        }
    }
    
    private func createTables() {
        let createTableSQL = """
            CREATE TABLE IF NOT EXISTS upload_queue (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                data_type TEXT NOT NULL,
                sample_data TEXT NOT NULL,
                anchor_data BLOB,
                created_at TIMESTAMP NOT NULL,
                retry_count INTEGER DEFAULT 0,
                last_attempt TIMESTAMP,
                status TEXT DEFAULT 'pending',
                priority INTEGER DEFAULT 0
            );
            
            CREATE INDEX IF NOT EXISTS idx_status_priority ON upload_queue(status, priority, created_at);
            CREATE INDEX IF NOT EXISTS idx_user_type ON upload_queue(user_id, data_type);
            CREATE INDEX IF NOT EXISTS idx_retry_eligible ON upload_queue(status, last_attempt, retry_count);
        """
        
        dbQueue.sync {
            let result = sqlite3_exec(db, createTableSQL, nil, nil, nil)
            if result != SQLITE_OK {
                print("❌ Failed to create upload queue tables: \(String(cString: sqlite3_errmsg(db)))")
            } else {
                print("✅ Upload queue tables created successfully")
            }
        }
    }
    
    // MARK: - Public Queue Operations
    
    /// Add samples to the queue for later upload
    public func enqueue(samples: [[String: Any]], dataType: String, userId: String, anchorData: Data? = nil, priority: Priority = .normal) async {
        await withCheckedContinuation { continuation in
            dbQueue.async {
                do {
                    let sampleData = try JSONSerialization.data(withJSONObject: samples, options: [])
                    
                    let insertSQL = """
                        INSERT INTO upload_queue (id, user_id, data_type, sample_data, anchor_data, created_at, status, priority)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """
                    
                    var statement: OpaquePointer?
                    guard sqlite3_prepare_v2(self.db, insertSQL, -1, &statement, nil) == SQLITE_OK else {
                        print("❌ Failed to prepare enqueue statement")
                        continuation.resume()
                        return
                    }
                    
                    defer { sqlite3_finalize(statement) }
                    
                    let id = UUID().uuidString
                    let timestamp = Date().timeIntervalSince1970
                    
                    sqlite3_bind_text(statement, 1, id, -1, nil)
                    sqlite3_bind_text(statement, 2, userId, -1, nil)
                    sqlite3_bind_text(statement, 3, dataType, -1, nil)
                    sqlite3_bind_blob(statement, 4, sampleData.withUnsafeBytes { $0.bindMemory(to: UInt8.self).baseAddress }, Int32(sampleData.count), nil)
                    
                    if let anchorData = anchorData {
                        sqlite3_bind_blob(statement, 5, anchorData.withUnsafeBytes { $0.bindMemory(to: UInt8.self).baseAddress }, Int32(anchorData.count), nil)
                    } else {
                        sqlite3_bind_null(statement, 5)
                    }
                    
                    sqlite3_bind_double(statement, 6, timestamp)
                    sqlite3_bind_text(statement, 7, QueueStatus.pending.rawValue, -1, nil)
                    sqlite3_bind_int(statement, 8, Int32(priority.rawValue))
                    
                    let result = sqlite3_step(statement)
                    if result == SQLITE_DONE {
                        print("✅ Queued \(samples.count) \(dataType) samples (ID: \(id))")
                    } else {
                        print("❌ Failed to enqueue samples: \(String(cString: sqlite3_errmsg(self.db)))")
                    }
                    
                    continuation.resume()
                } catch {
                    print("❌ Failed to serialize samples for queue: \(error)")
                    continuation.resume()
                }
            }
        }
    }
    
    /// Get pending items ready for upload
    func getPendingItems(limit: Int = 50) -> [QueueItem] {
        return dbQueue.sync {
            var items: [QueueItem] = []
            
            // Get items that are either pending or failed but ready for retry
            let selectSQL = """
                SELECT id, user_id, data_type, sample_data, anchor_data, created_at, retry_count, last_attempt, status, priority
                FROM upload_queue 
                WHERE (status = 'pending' OR (status = 'failed' AND retry_count < 10))
                ORDER BY priority DESC, created_at ASC
                LIMIT ?
            """
            
            var statement: OpaquePointer?
            guard sqlite3_prepare_v2(db, selectSQL, -1, &statement, nil) == SQLITE_OK else {
                print("❌ Failed to prepare select statement")
                return items
            }
            
            defer { sqlite3_finalize(statement) }
            
            sqlite3_bind_int(statement, 1, Int32(limit))
            
            while sqlite3_step(statement) == SQLITE_ROW {
                guard let id = UUID(uuidString: String(cString: sqlite3_column_text(statement, 0))) else {
                    print("❌ Invalid UUID in queue item, skipping")
                    continue
                }
                let userId = String(cString: sqlite3_column_text(statement, 1))
                let dataType = String(cString: sqlite3_column_text(statement, 2))
                
                let sampleDataSize = sqlite3_column_bytes(statement, 3)
                let sampleDataPtr = sqlite3_column_blob(statement, 3)
                let sampleData = Data(bytes: sampleDataPtr!, count: Int(sampleDataSize))
                
                var anchorData: Data? = nil
                if sqlite3_column_type(statement, 4) != SQLITE_NULL {
                    let anchorDataSize = sqlite3_column_bytes(statement, 4)
                    let anchorDataPtr = sqlite3_column_blob(statement, 4)
                    anchorData = Data(bytes: anchorDataPtr!, count: Int(anchorDataSize))
                }
                
                let createdAt = Date(timeIntervalSince1970: sqlite3_column_double(statement, 5))
                let retryCount = Int(sqlite3_column_int(statement, 6))
                
                var lastAttempt: Date? = nil
                if sqlite3_column_type(statement, 7) != SQLITE_NULL {
                    lastAttempt = Date(timeIntervalSince1970: sqlite3_column_double(statement, 7))
                }
                
                let status = QueueStatus(rawValue: String(cString: sqlite3_column_text(statement, 8)))!
                let priority = Priority(rawValue: Int(sqlite3_column_int(statement, 9)))!
            
                let item = QueueItem(
                    id: id,
                    userId: userId,
                    dataType: dataType,
                    sampleData: sampleData,
                    anchorData: anchorData,
                    createdAt: createdAt,
                    retryCount: retryCount,
                    lastAttempt: lastAttempt,
                    status: status,
                    priority: priority
                )
                
                // Only include items that should be retried
                if status == .pending || item.shouldRetry() {
                    items.append(item)
                }
            }
            
            return items
        }
    }
    
    /// Mark item as successfully uploaded
    func markAsUploaded(_ itemId: UUID) async {
        await updateItemStatus(itemId, status: .uploaded)
    }
    
    /// Mark item as failed and increment retry count
    func markAsFailed(_ itemId: UUID) async {
        await withCheckedContinuation { continuation in
            dbQueue.async {
                let updateSQL = """
                    UPDATE upload_queue 
                    SET status = 'failed', retry_count = retry_count + 1, last_attempt = ?
                    WHERE id = ?
                """
                
                var statement: OpaquePointer?
                guard sqlite3_prepare_v2(self.db, updateSQL, -1, &statement, nil) == SQLITE_OK else {
                    print("❌ Failed to prepare update statement")
                    continuation.resume()
                    return
                }
                
                defer { sqlite3_finalize(statement) }
                
                sqlite3_bind_double(statement, 1, Date().timeIntervalSince1970)
                sqlite3_bind_text(statement, 2, itemId.uuidString, -1, nil)
                
                let result = sqlite3_step(statement)
                if result == SQLITE_DONE {
                    print("📝 Marked item \(itemId) as failed")
                } else {
                    print("❌ Failed to mark item as failed: \(String(cString: sqlite3_errmsg(self.db)))")
                }
                
                continuation.resume()
            }
        }
    }
    
    /// Update item status
    private func updateItemStatus(_ itemId: UUID, status: QueueStatus) async {
        await withCheckedContinuation { continuation in
            dbQueue.async {
                let updateSQL = "UPDATE upload_queue SET status = ? WHERE id = ?"
                
                var statement: OpaquePointer?
                guard sqlite3_prepare_v2(self.db, updateSQL, -1, &statement, nil) == SQLITE_OK else {
                    print("❌ Failed to prepare update statement")
                    continuation.resume()
                    return
                }
                
                defer { sqlite3_finalize(statement) }
                
                sqlite3_bind_text(statement, 1, status.rawValue, -1, nil)
                sqlite3_bind_text(statement, 2, itemId.uuidString, -1, nil)
                
                let result = sqlite3_step(statement)
                if result == SQLITE_DONE {
                    print("📝 Updated item \(itemId) status to \(status.rawValue)")
                } else {
                    print("❌ Failed to update item status: \(String(cString: sqlite3_errmsg(self.db)))")
                }
                
                continuation.resume()
            }
        }
    }
    
    /// Get queue statistics for monitoring
    public func getQueueStatistics() -> [String: Int] {
        return dbQueue.sync {
            var stats: [String: Int] = [:]
            
            for status in QueueStatus.allCases {
                let countSQL = "SELECT COUNT(*) FROM upload_queue WHERE status = ?"
                
                var statement: OpaquePointer?
                guard sqlite3_prepare_v2(db, countSQL, -1, &statement, nil) == SQLITE_OK else {
                    continue
                }
                
                defer { sqlite3_finalize(statement) }
                
                sqlite3_bind_text(statement, 1, status.rawValue, -1, nil)
                
                if sqlite3_step(statement) == SQLITE_ROW {
                    stats[status.rawValue] = Int(sqlite3_column_int(statement, 0))
                }
            }
            
            return stats
        }
    }
    
    /// Clean up old uploaded items
    func cleanupOldItems(olderThan date: Date) async {
        await withCheckedContinuation { continuation in
            dbQueue.async {
                let deleteSQL = "DELETE FROM upload_queue WHERE status = 'uploaded' AND created_at < ?"
                
                var statement: OpaquePointer?
                guard sqlite3_prepare_v2(self.db, deleteSQL, -1, &statement, nil) == SQLITE_OK else {
                    print("❌ Failed to prepare cleanup statement")
                    continuation.resume()
                    return
                }
                
                defer { sqlite3_finalize(statement) }
                
                sqlite3_bind_double(statement, 1, date.timeIntervalSince1970)
                
                let result = sqlite3_step(statement)
                if result == SQLITE_DONE {
                    let deletedCount = sqlite3_changes(self.db)
                    print("🧹 Cleaned up \(deletedCount) old uploaded items")
                } else {
                    print("❌ Failed to cleanup old items: \(String(cString: sqlite3_errmsg(self.db)))")
                }
                
                continuation.resume()
            }
        }
    }
}

// MARK: - Retry Configuration

struct RetryConfiguration {
    static let maxRetries = 10 // Maximum retry attempts
    static let immediateRetryLimit = 3 // Retries allowed in foreground
    static let backoffMultiplier: TimeInterval = 2.0 // Exponential multiplier
    static let maxBackoffInterval: TimeInterval = 3600 // Max 1 hour between retries
    static let baseRetryInterval: TimeInterval = 60 // Base 1 minute delay
    
    /// Calculate backoff delay for retry attempt
    static func calculateBackoffDelay(retryCount: Int) -> TimeInterval {
        let exponentialDelay = baseRetryInterval * pow(backoffMultiplier, Double(retryCount))
        return min(exponentialDelay, maxBackoffInterval)
    }
    
    /// Get retry strategy based on context
    enum RetryStrategy {
        case immediate // Foreground, quick retries
        case background // Background, longer delays
        case aggressive // Force retry regardless of delays
    }
    
    static func getRetryStrategy(retryCount: Int, inBackground: Bool) -> RetryStrategy {
        if retryCount < immediateRetryLimit && !inBackground {
            return .immediate
        } else {
            return .background
        }
    }
}
