import Foundation

/// Analytics and monitoring system for health data sync operations
/// Tracks events, calculates success rates, and provides health reports
class SyncAnalytics {
    static let shared = SyncAnalytics()
    
    private var events: [SyncEvent] = []
    private let maxEvents = 1000 // Keep a rolling window of events
    private let eventQueue = DispatchQueue(label: "com.lichenapp.syncanalytics", qos: .utility)
    
    // MARK: - Data Models
    
    /// Individual sync event for tracking
    public struct SyncEvent {
        let type: String // e.g., "immediate_success", "background_failed"
        let dataType: String
        let sampleCount: Int
        let success: Bool
        let duration: TimeInterval // in seconds
        let timestamp: Date
        let retryCount: Int?
        let error: String?
        
        public init(type: String, dataType: String, sampleCount: Int, success: Bool, duration: TimeInterval = 0, retryCount: Int? = nil, error: String? = nil) {
            self.type = type
            self.dataType = dataType
            self.sampleCount = sampleCount
            self.success = success
            self.duration = duration
            self.timestamp = Date()
            self.retryCount = retryCount
            self.error = error
        }
    }
    
    /// Overall system health status
    public enum SystemHealth {
        case excellent  // >95% success rate
        case good      // >85% success rate
        case fair      // >70% success rate
        case poor      // <=70% success rate
    }
    
    /// Detailed health status
    public struct HealthStatus {
        let overallHealth: SystemHealth
        let successRate: Double
        let averageResponseTime: TimeInterval
        let systemStatus: SystemStatus
    }
    
    /// System status indicators
    public struct SystemStatus {
        let totalEvents: Int
        let recentSuccesses: Int
        let recentFailures: Int
        let consecutiveFailures: Int
        let lastSuccessTime: Date?
        let lastFailureTime: Date?
    }
    
    // MARK: - Initialization
    
    private init() {}
    
    // MARK: - Event Tracking
    
    /// Track a sync event
    public func trackSyncEvent(_ event: SyncEvent) {
        eventQueue.async {
            self.events.append(event)
            
            // Maintain rolling window
            if self.events.count > self.maxEvents {
                self.events.removeFirst(self.events.count - self.maxEvents)
            }
            
            // Log for debugging
            print("📊 SYNC_EVENT: \(event.type) - \(event.dataType) - \(event.sampleCount) samples - Success: \(event.success)")
            
            if let error = event.error {
                print("📊 SYNC_ERROR: \(error)")
            }
        }
    }
    
    /// Track immediate sync success
    func trackImmediateSuccess(dataType: String, sampleCount: Int, duration: TimeInterval) {
        let event = SyncEvent(
            type: "immediate_success",
            dataType: dataType,
            sampleCount: sampleCount,
            success: true,
            duration: duration
        )
        trackSyncEvent(event)
    }
    
    /// Track immediate sync failure
    func trackImmediateFailure(dataType: String, sampleCount: Int, duration: TimeInterval, error: String) {
        let event = SyncEvent(
            type: "immediate_failed",
            dataType: dataType,
            sampleCount: sampleCount,
            success: false,
            duration: duration,
            error: error
        )
        trackSyncEvent(event)
    }
    
    /// Track background sync success
    func trackBackgroundSuccess(dataType: String, sampleCount: Int, duration: TimeInterval, retryCount: Int) {
        let event = SyncEvent(
            type: "background_success",
            dataType: dataType,
            sampleCount: sampleCount,
            success: true,
            duration: duration,
            retryCount: retryCount
        )
        trackSyncEvent(event)
    }
    
    /// Track background sync failure
    func trackBackgroundFailure(dataType: String, sampleCount: Int, duration: TimeInterval, retryCount: Int, error: String) {
        let event = SyncEvent(
            type: "background_failed",
            dataType: dataType,
            sampleCount: sampleCount,
            success: false,
            duration: duration,
            retryCount: retryCount,
            error: error
        )
        trackSyncEvent(event)
    }
    
    /// Track foreground sync success
    func trackForegroundSuccess(dataType: String, sampleCount: Int, duration: TimeInterval) {
        let event = SyncEvent(
            type: "foreground_success",
            dataType: dataType,
            sampleCount: sampleCount,
            success: true,
            duration: duration
        )
        trackSyncEvent(event)
    }
    
    /// Track foreground sync failure
    func trackForegroundFailure(dataType: String, sampleCount: Int, duration: TimeInterval, error: String) {
        let event = SyncEvent(
            type: "foreground_failed",
            dataType: dataType,
            sampleCount: sampleCount,
            success: false,
            duration: duration,
            error: error
        )
        trackSyncEvent(event)
    }
    
    // MARK: - Analytics and Reporting
    
    /// Get overall sync health status
    public func getSyncHealthStatus() -> HealthStatus {
        return eventQueue.sync {
            guard !events.isEmpty else {
                return HealthStatus(
                    overallHealth: .excellent,
                    successRate: 1.0,
                    averageResponseTime: 0,
                    systemStatus: SystemStatus(
                        totalEvents: 0,
                        recentSuccesses: 0,
                        recentFailures: 0,
                        consecutiveFailures: 0,
                        lastSuccessTime: nil,
                        lastFailureTime: nil
                    )
                )
            }
            
            // Calculate success rate
            let successfulEvents = events.filter { $0.success }.count
            let successRate = Double(successfulEvents) / Double(events.count)
            
            // Calculate average response time
            let totalDuration = events.reduce(0) { $0 + $1.duration }
            let averageResponseTime = totalDuration / Double(events.count)
            
            // Get recent events (last hour)
            let oneHourAgo = Date().addingTimeInterval(-3600)
            let recentEvents = events.filter { $0.timestamp >= oneHourAgo }
            let recentSuccesses = recentEvents.filter { $0.success }.count
            let recentFailures = recentEvents.count - recentSuccesses
            
            // Calculate consecutive failures
            var consecutiveFailures = 0
            for event in events.reversed() {
                if event.success {
                    break
                } else {
                    consecutiveFailures += 1
                }
            }
            
            // Find last success and failure times
            let lastSuccessTime = events.last { $0.success }?.timestamp
            let lastFailureTime = events.last { !$0.success }?.timestamp
            
            // Determine overall health
            let overallHealth: SystemHealth
            if successRate >= 0.95 {
                overallHealth = .excellent
            } else if successRate >= 0.85 {
                overallHealth = .good
            } else if successRate >= 0.70 {
                overallHealth = .fair
            } else {
                overallHealth = .poor
            }
            
            let systemStatus = SystemStatus(
                totalEvents: events.count,
                recentSuccesses: recentSuccesses,
                recentFailures: recentFailures,
                consecutiveFailures: consecutiveFailures,
                lastSuccessTime: lastSuccessTime,
                lastFailureTime: lastFailureTime
            )
            
            return HealthStatus(
                overallHealth: overallHealth,
                successRate: successRate,
                averageResponseTime: averageResponseTime,
                systemStatus: systemStatus
            )
        }
    }
    
    /// Generate comprehensive health report
    public func generateHealthReport() -> String {
        return eventQueue.sync {
            let healthStatus = getSyncHealthStatus()
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .short
            
            var report = """
            ═══════════════════════════════════════
                    HEALTH DATA SYNC REPORT
            ═══════════════════════════════════════
            
            Overall Health: \(healthStatus.overallHealth)
            Success Rate: \(String(format: "%.1f", healthStatus.successRate * 100))%
            Average Response Time: \(String(format: "%.2f", healthStatus.averageResponseTime))s
            
            System Status:
            • Total Events: \(healthStatus.systemStatus.totalEvents)
            • Recent Successes (1h): \(healthStatus.systemStatus.recentSuccesses)
            • Recent Failures (1h): \(healthStatus.systemStatus.recentFailures)
            • Consecutive Failures: \(healthStatus.systemStatus.consecutiveFailures)
            
            """
            
            if let lastSuccess = healthStatus.systemStatus.lastSuccessTime {
                report += "• Last Success: \(formatter.string(from: lastSuccess))\n"
            } else {
                report += "• Last Success: Never\n"
            }
            
            if let lastFailure = healthStatus.systemStatus.lastFailureTime {
                report += "• Last Failure: \(formatter.string(from: lastFailure))\n"
            } else {
                report += "• Last Failure: Never\n"
            }
            
            report += "\n"
            
            // Data type breakdown
            let dataTypeBreakdown = getDataTypeBreakdown()
            if !dataTypeBreakdown.isEmpty {
                report += "Data Type Performance:\n"
                for (dataType, stats) in dataTypeBreakdown.sorted(by: { $0.key < $1.key }) {
                    let successRate = stats.total > 0 ? Double(stats.successful) / Double(stats.total) : 0.0
                    report += "• \(dataType): \(String(format: "%.1f", successRate * 100))% (\(stats.successful)/\(stats.total))\n"
                }
                report += "\n"
            }
            
            // Recent errors
            let recentErrors = getRecentErrors()
            if !recentErrors.isEmpty {
                report += "Recent Errors:\n"
                for error in recentErrors.prefix(5) {
                    report += "• \(formatter.string(from: error.timestamp)): \(error.error ?? "Unknown error")\n"
                }
                report += "\n"
            }
            
            // Recommendations
            report += "Recommendations:\n"
            let recommendations = generateRecommendations(healthStatus: healthStatus)
            for recommendation in recommendations {
                report += "• \(recommendation)\n"
            }
            
            report += "\n═══════════════════════════════════════"
            
            return report
        }
    }
    
    // MARK: - Private Analytics Helpers
    
    private func getDataTypeBreakdown() -> [String: (successful: Int, total: Int)] {
        var breakdown: [String: (successful: Int, total: Int)] = [:]
        
        for event in events {
            let current = breakdown[event.dataType] ?? (successful: 0, total: 0)
            breakdown[event.dataType] = (
                successful: current.successful + (event.success ? 1 : 0),
                total: current.total + 1
            )
        }
        
        return breakdown
    }
    
    private func getRecentErrors() -> [SyncEvent] {
        let oneHourAgo = Date().addingTimeInterval(-3600)
        return events.filter { !$0.success && $0.timestamp >= oneHourAgo }.suffix(10)
    }
    
    private func generateRecommendations(healthStatus: HealthStatus) -> [String] {
        var recommendations: [String] = []
        
        if healthStatus.successRate < 0.85 {
            recommendations.append("Consider checking network connectivity and API availability")
        }
        
        if healthStatus.systemStatus.consecutiveFailures > 5 {
            recommendations.append("High number of consecutive failures - investigate server issues")
        }
        
        if healthStatus.averageResponseTime > 10.0 {
            recommendations.append("Slow response times detected - optimize upload payload size")
        }
        
        if healthStatus.systemStatus.recentFailures > healthStatus.systemStatus.recentSuccesses && healthStatus.systemStatus.recentFailures > 0 {
            recommendations.append("More failures than successes recently - check for temporary issues")
        }
        
        let queueStats = PersistentUploadQueue.shared.getQueueStatistics()
        let pendingCount = queueStats["pending"] ?? 0
        let failedCount = queueStats["failed"] ?? 0
        
        if pendingCount > 100 {
            recommendations.append("High queue size (\(pendingCount) pending) - ensure background sync is working")
        }
        
        if failedCount > 50 {
            recommendations.append("Many failed items (\(failedCount)) - check retry logic and error handling")
        }
        
        if recommendations.isEmpty {
            recommendations.append("System is operating normally")
        }
        
        return recommendations
    }
    
    // MARK: - Public Query Interface
    
    /// Get event summary for debugging
    func getEventSummary() -> [String: Any] {
        return eventQueue.sync {
            let healthStatus = getSyncHealthStatus()
            let queueStats = PersistentUploadQueue.shared.getQueueStatistics()
            
            return [
                "totalEvents": events.count,
                "successRate": healthStatus.successRate,
                "averageResponseTime": healthStatus.averageResponseTime,
                "overallHealth": healthStatus.overallHealth.rawValue,
                "consecutiveFailures": healthStatus.systemStatus.consecutiveFailures,
                "queueStatistics": queueStats,
                "lastUpdate": ISO8601DateFormatter().string(from: Date())
            ]
        }
    }
    
    /// Clear all events (for testing)
    func clearEvents() {
        eventQueue.async {
            self.events.removeAll()
            print("🧹 Cleared all sync analytics events")
        }
    }
}

// MARK: - SystemHealth Extensions

extension SyncAnalytics.SystemHealth {
    var rawValue: String {
        switch self {
        case .excellent: return "excellent"
        case .good: return "good"
        case .fair: return "fair"
        case .poor: return "poor"
        }
    }
}