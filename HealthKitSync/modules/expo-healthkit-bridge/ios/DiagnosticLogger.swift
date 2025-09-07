import Foundation
import UIKit

class DiagnosticLogger {
    static let shared = DiagnosticLogger()
    private var apiUrl: String?
    private var userId: String?
    
    func configure(apiUrl: String, userId: String) {
        self.apiUrl = apiUrl
        self.userId = userId
    }
    
    func log(_ event: String, details: [String: Any] = [:], severity: String = "info") {
        guard let apiUrl = apiUrl, let userId = userId else { 
            print("🔍 DIAGNOSTIC (not configured): \(event)")
            return 
        }
        
        // Get app state
        let appState: String = {
            switch UIApplication.shared.applicationState {
            case .active: return "active"
            case .inactive: return "inactive"
            case .background: return "background"
            @unknown default: return "unknown"
            }
        }()
        
        let logData: [String: Any] = [
            "user_id": userId,
            "event": event,
            "severity": severity,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "app_state": appState,
            "details": details,
            "device": UIDevice.current.model,
            "ios_version": UIDevice.current.systemVersion
        ]
        
        // Log locally first
        print("🔍 DIAGNOSTIC: \(event) | State: \(appState) | \(details)")
        
        // Send to your Lambda
        Task {
            await sendToServer(logData)
        }
    }
    
    private func sendToServer(_ logData: [String: Any]) async {
        guard let apiUrl = apiUrl,
              let url = URL(string: "\(apiUrl)/diagnostic-log") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: logData)
            let (_, response) = try await URLSession.shared.data(for: request)
            
            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode != 200 {
                    print("⚠️ Diagnostic log failed: \(httpResponse.statusCode)")
                }
            }
        } catch {
            print("⚠️ Failed to send diagnostic: \(error)")
        }
    }
}