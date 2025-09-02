import React, { useState, useEffect } from "react";
import Constants from "expo-constants";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import HealthKitBridge from "expo-healthkit-bridge";
import { HealthDataUploader } from "./services/HealthDataUploader";
import { UserInfo } from "./components/UserInfo";
import {
  convertUTCToLocal,
  formatHealthKitTimestamp,
} from "./utils/TimezoneUtils";
import { useAuth } from "./context/AuthContext";

interface SyncEvent {
  phase:
    | "permissions"
    | "observer"
    | "anchored"
    | "upload"
    | "historical"
    | "uploading"
    | "completed"
    | "failed";
  message: string;
  counts?: {
    added?: number;
    deleted?: number;
  };
}

interface SyncStatus {
  lastSyncISO: string | null;
  queuedBatches: number;
  lastError?: string;
}

export const DeveloperScreen: React.FC = () => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [lastSyncEvent, setLastSyncEvent] = useState<SyncEvent | null>(null);
  const [isSyncActive, setIsSyncActive] = useState(false);

  // Upload-related state
  const [uploader, setUploader] = useState<HealthDataUploader | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // Get default health types to request
  const healthTypes = HealthKitBridge.getAvailableTypes();
  // Google Sign-In is now initialized in useAuth hook

  // Add to useEffect for streaming data
  useEffect(() => {
    // Initialize uploader (without auth for developer tools)
    const apiUrl = Constants.expoConfig?.extra?.apiGatewayUrl;
    console.log("🔗 Using API URL for uploads:", apiUrl);

    if (!apiUrl) {
      console.error(
        "❌ No API Gateway URL configured! Check your .env file and app.config.js"
      );
      return;
    }

    //TODO: How are we managing authentication for upload? Are we requiring auth headers?
    const uploaderInstance = new HealthDataUploader({
      apiUrl: apiUrl,
      userId: user?.id || "anonymous_user", // Use actual user ID
      getAuthHeaders: () => Promise.resolve({}), // No auth headers for developer tools
    });
    setUploader(uploaderInstance);

    // Subscribe to sync events
    const syncSubscription = HealthKitBridge.onSyncEvent((event: SyncEvent) => {
      console.log("🔄 Sync Event:", event);
      setLastSyncEvent(event);
    });

    // Subscribe to streaming data
    // ⚠️ DEPRECATED: JavaScript streaming has been replaced with native Swift uploads
    // This code is kept for debugging purposes only - real uploads now happen in Swift
    // See SettingsScreen for native uploader configuration
    const streamSubscription = HealthKitBridge.onDataStream((event) => {
      console.log("🌊 DEPRECATED STREAMING DATA:", event);
      console.log(
        `📱 Received ${event.samples.length} new samples for ${event.type}`
      );
      event.samples.forEach((sample, index) => {
        const localTime = formatHealthKitTimestamp(sample.startDate);
        console.log(
          `   ${index + 1}. ${sample.value} ${
            sample.unit
          } at ${localTime} (UTC: ${sample.startDate})`
        );
      });

      // Queue new samples for upload (DISABLED - now handled in Swift)
      // if (uploaderInstance && event.samples.length > 0) {
      //   uploaderInstance.queueStreamingSamples(event);
      // }
    });

    // Auto-flush queue every 5 minutes (DISABLED - now handled in Swift)
    // const flushInterval = setInterval(() => {
    //   if (uploaderInstance) {
    //     uploaderInstance.flushQueue();
    //   }
    // }, 5 * 60 * 1000); // 5 minutes

    // Load initial sync status
    loadSyncStatus();

    return () => {
      syncSubscription?.remove();
      streamSubscription?.remove();
    };
  }, [user]);

  const loadSyncStatus = async () => {
    try {
      const status = await HealthKitBridge.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error("Error loading sync status:", error);
    }
  };

  const handleRequestPermissions = async () => {
    setIsLoading(true);
    try {
      const result = await HealthKitBridge.requestPermissions(healthTypes);
      setPermissions(result.granted);

      Alert.alert(
        "Permissions Result",
        `Granted: ${result.granted.length}\nDenied: ${result.denied.length}`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Permission request failed:", error);
      Alert.alert("Error", "Failed to request permissions");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuerySingleType = async () => {
    setIsLoading(true);
    try {
      // Test with just steps - the most reliable type
      const stepTypes = ["HKQuantityTypeIdentifierStepCount"];

      const endDate = new Date();
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - 24); // Last 24 hours

      console.log(`🚶 Querying steps for last 24 hours`);

      const result = await HealthKitBridge.queryDataInRange(
        stepTypes,
        startDate.toISOString(),
        endDate.toISOString()
      );

      console.log("👟 Steps data:", result);

      const stepSamples = result["HKQuantityTypeIdentifierStepCount"] || [];
      console.log(`Found ${stepSamples.length} step samples`);

      stepSamples.forEach((sample, index) => {
        const localTime = formatHealthKitTimestamp(sample.startDate);
        console.log(
          `${index + 1}. ${sample.value} steps at ${localTime} (UTC: ${
            sample.startDate
          })`
        );
      });

      Alert.alert(
        "Steps Data (24h)",
        `Found ${stepSamples.length} step samples\nCheck console for details`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Steps query failed:", error);
      Alert.alert(
        "Error",
        `Failed to query steps: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartSync = async () => {
    if (permissions.length === 0) {
      Alert.alert("No Permissions", "Please request permissions first");
      return;
    }

    setIsLoading(true);
    try {
      // Enhanced sync types: include ECG even if not explicitly granted
      const syncTypes = [...permissions];
      const allAvailableTypes = HealthKitBridge.getAvailableTypes();
      if (
        allAvailableTypes.includes("HKElectrocardiogramType") &&
        !syncTypes.includes("HKElectrocardiogramType")
      ) {
        syncTypes.push("HKElectrocardiogramType");
        console.log(
          "🫀 Added ECG to developer background sync (device compatible)"
        );
      }

      await HealthKitBridge.startBackgroundSync(syncTypes);
      setIsSyncActive(true);
      Alert.alert("Success", "Background sync started");
    } catch (error) {
      console.error("Start sync failed:", error);
      Alert.alert(
        "Error",
        `Failed to start background sync: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopSync = async () => {
    setIsLoading(true);
    try {
      await HealthKitBridge.stopBackgroundSync();
      setIsSyncActive(false);
      Alert.alert("Success", "Background sync stopped");
    } catch (error) {
      console.error("Stop sync failed:", error);
      Alert.alert(
        "Error",
        `Failed to stop background sync: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncNow = async () => {
    setIsLoading(true);
    try {
      // Enhanced sync types: include ECG even if not explicitly granted
      const syncTypes = [...permissions];
      const allAvailableTypes = HealthKitBridge.getAvailableTypes();
      if (
        allAvailableTypes.includes("HKElectrocardiogramType") &&
        !syncTypes.includes("HKElectrocardiogramType")
      ) {
        syncTypes.push("HKElectrocardiogramType");
        console.log("🫀 Added ECG to manual sync (device compatible)");
      }

      const result = await HealthKitBridge.syncNow(syncTypes);
      await loadSyncStatus(); // Refresh status

      Alert.alert(
        "Manual Sync Complete",
        `Added: ${result.added} samples\nDeleted: ${result.deleted} samples`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Manual sync failed:", error);
      Alert.alert("Error", "Failed to perform manual sync");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimpleECGDebug = async () => {
    setIsLoading(true);
    try {
      console.log("🔍 Simple ECG Debug - checking raw permission status...");
      const result = await HealthKitBridge.simpleECGDebug();

      console.log("🔍 Raw ECG Debug Result:", JSON.stringify(result, null, 2));

      let message = "ECG Permission Test (Source of Truth):\n\n";

      if (!result.ios_version_ok) {
        message += "❌ iOS version not compatible";
      } else {
        message += `ECG Authorization Status: ${result.ecg_authorization_status} (unreliable)\n`;
        message += `ECG Can Query Data: ${result.ecg_can_query_data} (source of truth)\n`;
        message += `Heart Rate Authorization Status: ${result.heart_rate_authorization_status} (unreliable)\n`;
        message += `Heart Rate Can Query Data: ${result.heart_rate_can_query_data} (source of truth)\n\n`;

        if (result.permission_logic_working) {
          message += "✅ ECG PERMISSION WORKING!\n";
          message += "Can actually query ECG data despite status=1\n\n";
          message += "🎯 Issue is likely in sync logic, not permissions";
        } else {
          message += "❌ ECG PERMISSION TRULY DENIED\n";
          message += "Cannot query ECG data\n\n";
          message += "🔧 Need to fix actual permission grant";
        }

        if (result.both_can_query) {
          message += "\n✅ Both ECG and Heart Rate can be queried";
        } else {
          message += "\n⚠️ Some data types cannot be queried";
        }
      }

      Alert.alert("Raw ECG Status", message, [{ text: "OK" }]);
    } catch (error) {
      console.error("❌ Simple ECG debug failed:", error);
      Alert.alert(
        "Error",
        `Debug failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestECGQuery = async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      console.log("🫀 Testing ECG data query...");
      const ecgData = await HealthKitBridge.queryECGData(
        twoHoursAgo.toISOString(),
        now.toISOString(),
        5
      );

      console.log(`✅ Found ${ecgData.length} ECG samples`);

      let message = `ECG Query Results:\n\n`;
      message += `Found: ${ecgData.length} ECG samples\n\n`;

      if (ecgData.length > 0) {
        const latest = ecgData[0];
        message += `Latest ECG:\n`;
        message += `• Classification: ${latest.ecgClassification}\n`;
        message += `• Symptoms: ${latest.symptomsStatus}\n`;
        message += `• Heart Rate: ${latest.averageHeartRate} bpm\n`;
        message += `• Voltage Points: ${latest.voltagePoints?.length || 0}\n`;
        message += `• Date: ${latest.startDate}`;

        console.log("📊 Latest ECG details:", latest);
      } else {
        message += "No ECG data found. Try:\n";
        message += "1. Take manual ECG on Apple Watch\n";
        message += "2. Wait 2-3 minutes\n";
        message += "3. Try again";
      }

      Alert.alert("ECG Query Results", message, [{ text: "OK" }]);
    } catch (error) {
      console.error("❌ ECG query failed:", error);
      Alert.alert(
        "Error",
        `ECG query failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleECGOnlyUpload = async () => {
    setIsLoading(true);
    try {
      console.log("🫀 Starting ECG-ONLY debug pipeline...");

      // Step 1: Quick ECG status check
      console.log("📋 Step 1: Checking ECG status...");
      const debugInfo = await HealthKitBridge.simpleECGDebug();
      console.log("🔍 Simple ECG Debug:", debugInfo);

      if (!debugInfo.ios_version_ok) {
        Alert.alert("Error", "Device not compatible with ECG (need iOS 12.2+)");
        return;
      }

      if (!debugInfo.permission_logic_working) {
        Alert.alert(
          "Error",
          `ECG permission issue: Cannot query ECG data\nPlease grant ECG permission first`
        );
        return;
      }

      // Step 2: Query ECG data
      console.log("📋 Step 2: Querying ECG data...");
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const ecgData = await HealthKitBridge.queryECGData(
        yesterday.toISOString(),
        now.toISOString(),
        10 // Max 10 ECG samples
      );

      console.log(`📊 Found ${ecgData.length} ECG samples`);

      if (ecgData.length === 0) {
        Alert.alert(
          "No ECG Data",
          "No ECG data found in last 24 hours.\n\n1. Take manual ECG on Apple Watch\n2. Wait 2-3 minutes\n3. Try again"
        );
        return;
      }

      // Step 3: Upload ECG data only
      console.log("📋 Step 3: Uploading ECG data to API...");
      console.log(
        "📤 ECG samples to upload:",
        ecgData.map((ecg) => ({
          uuid: ecg.uuid,
          classification: ecg.ecgClassification,
          startDate: ecg.startDate,
          voltagePoints: ecg.voltagePoints?.length || 0,
        }))
      );

      const uploadResult = await HealthKitBridge.uploadDateRange(
        ["HKElectrocardiogramType"], // ECG ONLY
        yesterday.toISOString(),
        now.toISOString()
      );

      console.log("📋 Step 4: Upload result:", uploadResult);

      // Step 4: Show results
      let message = `ECG-Only Upload Results:\n\n`;
      message += `✅ Success: ${uploadResult.success}\n`;
      message += `📊 Samples Found: ${uploadResult.samplesFound}\n`;
      message += `📤 Samples Uploaded: ${uploadResult.samplesUploaded}\n`;
      message += `📋 Message: ${uploadResult.message}\n\n`;

      if (uploadResult.success) {
        message += `🎉 ECG data successfully sent to API!\n`;
        message += `Check your API logs for ECG data.`;
      } else {
        message += `❌ Upload failed. Check console for details.`;
      }

      Alert.alert("ECG Upload Complete", message, [{ text: "OK" }]);
    } catch (error) {
      console.error("❌ ECG-only upload failed:", error);
      Alert.alert(
        "Error",
        `ECG upload failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleQueryHistorical = async () => {
    setIsLoading(true);
    try {
      // Start with just essential types to avoid overwhelming the system
      const essentialTypes = [
        "HKQuantityTypeIdentifierStepCount",
        "HKQuantityTypeIdentifierHeartRate",
        "HKQuantityTypeIdentifierDistanceWalkingRunning",
      ];

      // Query last 2 days (keep your current timeframe)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 2);

      console.log(
        `📅 Querying from ${startDate.toISOString()} to ${endDate.toISOString()}`
      );

      const result = await HealthKitBridge.queryDataInRange(
        essentialTypes, // Use essential types instead of all permissions
        startDate.toISOString(),
        endDate.toISOString()
      );

      console.log("📊 Historical data:", result);

      let totalSamples = 0;
      Object.entries(result).forEach(([type, samples]) => {
        console.log(`📈 ${type}: ${samples.length} samples`);
        samples.slice(0, 3).forEach((sample, index) => {
          const localTime = formatHealthKitTimestamp(sample.startDate);
          console.log(
            `   ${index + 1}. ${sample.value} ${
              sample.unit
            } at ${localTime} (UTC: ${sample.startDate})`
          );
        });
        totalSamples += samples.length;
      });

      Alert.alert(
        "Historical Data",
        `Found ${totalSamples} samples in last 2 days\nCheck console for details`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Historical query failed:", error);
      Alert.alert(
        "Error",
        `Failed to query historical data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFreshSync = async () => {
    setIsLoading(true);
    try {
      // Enhanced sync types: include ECG even if not explicitly granted
      const syncTypes = [...permissions];
      const allAvailableTypes = HealthKitBridge.getAvailableTypes();
      if (
        allAvailableTypes.includes("HKElectrocardiogramType") &&
        !syncTypes.includes("HKElectrocardiogramType")
      ) {
        syncTypes.push("HKElectrocardiogramType");
        console.log("🫀 Added ECG to fresh sync (device compatible)");
      }

      const result = await HealthKitBridge.resetAnchorsAndSync(syncTypes);
      Alert.alert(
        "Fresh Sync Complete",
        `Found ${result.added} total samples\nCheck console for sample details`
      );
    } catch (error) {
      console.error("Fresh sync failed:", error);
      Alert.alert("Error", "Failed to perform fresh sync");
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewLocalData = async () => {
    try {
      const localData = await HealthKitBridge.getLocalData(permissions, 50);
      console.log("💾 Local stored data:", localData);
      Alert.alert(
        "Local Data",
        `Found ${localData.length} samples stored locally\nCheck console for details`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Failed to get local data:", error);
    }
  };

  // Upload handler functions
  const handleUploadHistorical = async () => {
    if (!uploader) {
      Alert.alert("Error", "Uploader not initialized");
      return;
    }

    setIsUploading(true);
    try {
      console.log("🚀 Starting historical upload...");

      // Use ALL permitted types for complete data upload
      console.log(
        `📊 Will upload data for ${permissions.length} permitted types:`,
        permissions
      );

      // Query last 2 days (same as your existing button)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 2);

      const result = await HealthKitBridge.queryDataInRange(
        permissions, // Use all permissions instead of hardcoded types
        startDate.toISOString(),
        endDate.toISOString()
      );

      const success = await uploader.uploadHistoricalData(result, 2);

      Alert.alert(
        success ? "Success" : "Error",
        success
          ? "Historical data uploaded to S3!"
          : "Failed to upload historical data"
      );
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadExtensiveHistorical = async () => {
    if (!uploader) {
      Alert.alert("Error", "Uploader not initialized");
      return;
    }

    // Show confirmation dialog
    Alert.alert(
      "Upload Extensive Historical Data",
      "This will upload the last 6 months of health data in weekly chunks. This may take 10-15 minutes and use significant data. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Upload",
          onPress: async () => {
            setIsUploading(true);
            try {
              console.log(
                "🚀 Starting EXTENSIVE historical upload (6 months in weekly chunks)..."
              );

              // Use ALL permitted types instead of just 3 hardcoded ones
              console.log(
                `📊 Will upload data for ${permissions.length} permitted types:`,
                permissions
              );

              const success = await uploadHistoricalDataInChunks(
                permissions, // Use all permissions instead of hardcoded types
                6,
                uploader
              );

              Alert.alert(
                success ? "Success" : "Error",
                success
                  ? "6 months of historical data uploaded to S3!"
                  : "Failed to upload extensive historical data"
              );
            } catch (error) {
              console.error("Extensive upload error:", error);
              Alert.alert("Error", "Extensive upload failed");
            } finally {
              setIsUploading(false);
            }
          },
        },
      ]
    );
  };

  // New chunked upload function with progress tracking
  const uploadHistoricalDataInChunks = async (
    types: string[],
    monthsBack: number,
    uploader: HealthDataUploader
  ): Promise<boolean> => {
    const endDate = new Date();
    const weeksToUpload = monthsBack * 4; // Approximate weeks
    let totalSamples = 0;
    let weekNum = 0;

    console.log(`📦 Will upload ${weeksToUpload} weeks of data in chunks`);

    // Initialize progress
    setUploadProgress({ current: 0, total: weeksToUpload });

    for (let week = 0; week < weeksToUpload; week++) {
      weekNum++;

      // Update progress
      setUploadProgress({ current: weekNum, total: weeksToUpload });

      // Calculate week boundaries
      const weekEndDate = new Date(endDate);
      weekEndDate.setDate(weekEndDate.getDate() - week * 7);

      const weekStartDate = new Date(weekEndDate);
      weekStartDate.setDate(weekStartDate.getDate() - 7);

      console.log(
        `📅 Week ${weekNum}/${weeksToUpload}: ${
          weekStartDate.toISOString().split("T")[0]
        } to ${weekEndDate.toISOString().split("T")[0]}`
      );

      try {
        // Query this week's data
        const weekResult = await HealthKitBridge.queryDataInRange(
          types,
          weekStartDate.toISOString(),
          weekEndDate.toISOString()
        );

        // Count samples in this week
        let weekSamples = 0;
        Object.values(weekResult).forEach((samples: any) => {
          weekSamples += samples.length;
        });

        console.log(`📊 Week ${weekNum}: Found ${weekSamples} samples`);

        if (weekSamples > 0) {
          // Upload this week's data
          const success = await uploader.uploadHistoricalData(weekResult, 7);
          if (!success) {
            console.error(`❌ Failed to upload week ${weekNum}`);
            setUploadProgress(null);
            return false;
          }
          totalSamples += weekSamples;
        }

        // Small delay between weeks to avoid overwhelming the API
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Error processing week ${weekNum}:`, error);
        // Continue with next week instead of failing completely
        continue;
      }
    }

    console.log(`✅ Chunked upload completed! Total samples: ${totalSamples}`);
    setUploadProgress(null); // Clear progress
    return true;
  };

  const handleFlushQueue = async () => {
    if (!uploader) {
      Alert.alert("Error", "Uploader not initialized");
      return;
    }

    setIsUploading(true);
    try {
      const queueStatus = uploader.getQueueStatus();
      console.log("📊 Queue status:", queueStatus);

      const success = await uploader.flushQueue();
      Alert.alert(
        success ? "Success" : "Error",
        success
          ? `Uploaded ${queueStatus.queueSize} queued samples to S3!`
          : "Failed to upload queued data"
      );
    } catch (error) {
      console.error("Queue flush error:", error);
      Alert.alert("Error", "Failed to flush queue");
    } finally {
      setIsUploading(false);
    }
  };

  const formatDate = (isoString: string | null) => {
    if (!isoString) return "Never";
    return new Date(isoString).toLocaleString();
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>HealthKit Developer Tools</Text>
          <Text style={styles.subtitle}>
            Data Upload, Sync, and Testing Tools
          </Text>
        </View>

        {/* User Info Section */}
        <UserInfo />

        {/* Status Section */}
        <View style={styles.statusSection}>
          <Text style={styles.sectionTitle}>Status</Text>

          <View style={styles.statusCard}>
            <Text style={styles.statusText}>
              Permissions: {permissions.length} granted
            </Text>
            <Text style={styles.statusText}>
              Background Sync: {isSyncActive ? "🟢 Active" : "🔴 Inactive"}
            </Text>
            <Text style={styles.statusText}>
              Last Sync: {formatDate(syncStatus?.lastSyncISO || null)}
            </Text>
            {syncStatus?.lastError && (
              <Text style={styles.errorText}>
                Error: {syncStatus?.lastError}
              </Text>
            )}

            {/* Upload Progress */}
            {uploadProgress && (
              <Text style={styles.progressText}>
                📤 Uploading Week {uploadProgress.current}/
                {uploadProgress.total}
              </Text>
            )}
          </View>

          {lastSyncEvent && (
            <View style={styles.eventCard}>
              <Text style={styles.eventTitle}>Latest Event</Text>
              <Text style={styles.eventText}>Phase: {lastSyncEvent.phase}</Text>
              <Text style={styles.eventText}>
                Message: {lastSyncEvent.message}
              </Text>
              {lastSyncEvent.counts && (
                <Text style={styles.eventText}>
                  Added: {lastSyncEvent.counts.added}, Deleted:{" "}
                  {lastSyncEvent.counts.deleted}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleRequestPermissions}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Request Permissions</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              isSyncActive ? styles.dangerButton : styles.successButton,
            ]}
            onPress={isSyncActive ? handleStopSync : handleStartSync}
            disabled={isLoading || permissions.length === 0}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>
                {isSyncActive ? "Stop Sync" : "Start Sync"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleSyncNow}
            disabled={isLoading || permissions.length === 0}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Sync Now</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.successButton]}
            onPress={handleQuerySingleType}
            disabled={isLoading || permissions.length === 0}
          >
            <Text style={styles.buttonText}>Test Steps Query</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.infoButton]}
            onPress={loadSyncStatus}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Refresh Status</Text>
            )}
          </TouchableOpacity>

          {/* Simple ECG Debug */}
          <TouchableOpacity
            style={[styles.button, styles.warningButton]}
            onPress={handleSimpleECGDebug}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>🔍 Simple ECG Debug</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleTestECGQuery}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>🫀 Test ECG Query</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.uploadButton]}
            onPress={handleECGOnlyUpload}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>🫀 ECG ONLY Upload</Text>
          </TouchableOpacity>
          {/* Add these after your existing buttons */}
          <TouchableOpacity
            style={[styles.button, styles.infoButton]}
            onPress={handleQueryHistorical}
            disabled={isLoading || permissions.length === 0}
          >
            <Text style={styles.buttonText}>Query Last 2 Days (Safe)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.warningButton]}
            onPress={handleFreshSync}
            disabled={isLoading || permissions.length === 0}
          >
            <Text style={styles.buttonText}>Fresh Sync (All Data)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleViewLocalData}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>View Local Data</Text>
          </TouchableOpacity>

          {/* Upload Buttons */}
          <TouchableOpacity
            style={[styles.button, styles.uploadButton]}
            onPress={handleUploadHistorical}
            disabled={isLoading || isUploading || permissions.length === 0}
          >
            {isUploading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>
                📤 Upload Historical (2 days)
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.extensiveUploadButton]}
            onPress={handleUploadExtensiveHistorical}
            disabled={isLoading || isUploading || permissions.length === 0}
          >
            {isUploading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>
                🗂️ Upload 6 Months Historical
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.uploadButton]}
            onPress={handleFlushQueue}
            disabled={isLoading || isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>🚀 Upload Queued Data</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Health Types List */}
        <View style={styles.typesSection}>
          <Text style={styles.sectionTitle}>Health Data Types</Text>
          <ScrollView style={styles.typesList}>
            {healthTypes.map((type, index) => (
              <View key={index} style={styles.typeItem}>
                <Text style={styles.typeText}>
                  {HealthKitBridge.getTypeDisplayName(type)}
                </Text>
                <Text style={styles.typeStatus}>
                  {permissions.includes(type) ? "✅" : "❌"}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  warningButton: {
    backgroundColor: "#e67e22",
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
    marginTop: 50,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginTop: 5,
  },
  statusSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  statusCard: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  statusText: {
    fontSize: 16,
    color: "#333",
    marginBottom: 5,
  },
  errorText: {
    fontSize: 14,
    color: "#e74c3c",
    marginTop: 5,
  },
  progressText: {
    fontSize: 14,
    color: "#e67e22",
    fontWeight: "bold",
    marginTop: 5,
  },
  eventCard: {
    backgroundColor: "#e8f4f8",
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#3498db",
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 5,
  },
  eventText: {
    fontSize: 14,
    color: "#34495e",
    marginBottom: 3,
  },
  buttonSection: {
    marginBottom: 30,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  primaryButton: {
    backgroundColor: "#3498db",
  },
  successButton: {
    backgroundColor: "#27ae60",
  },
  dangerButton: {
    backgroundColor: "#e74c3c",
  },
  secondaryButton: {
    backgroundColor: "#f39c12",
  },
  infoButton: {
    backgroundColor: "#9b59b6",
  },
  uploadButton: {
    backgroundColor: "#e67e22", // Orange color for upload actions
  },
  extensiveUploadButton: {
    backgroundColor: "#c0392b", // Darker red for extensive/intensive operations
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  typesSection: {
    marginBottom: 20,
  },
  typesList: {
    maxHeight: 200,
    backgroundColor: "white",
    borderRadius: 10,
    padding: 10,
  },
  typeItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  typeText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  typeStatus: {
    fontSize: 16,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
});
