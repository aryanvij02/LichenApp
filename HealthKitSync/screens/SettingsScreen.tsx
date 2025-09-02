import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import HealthKitBridge from "expo-healthkit-bridge";
import { commonStyles } from "../styles/common";
import { colors, spacing, typography } from "../styles";

import { useAuth } from "../context/AuthContext";
import {
  SettingsService,
  DataSourcePreferences,
} from "../services/SettingsService";
import { HealthKitService } from "../services/HealthKitService";

export const SettingsScreen: React.FC = () => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncActive, setIsSyncActive] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);

  // Data source preferences state
  const [dataSourcePreferences, setDataSourcePreferences] =
    useState<DataSourcePreferences>({
      steps: null,
      heartRate: null,
    });
  const [availableStepsSources, setAvailableStepsSources] = useState<string[]>(
    []
  );

  // Date range state for manual upload
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7); // Default to 7 days ago
    return date.toISOString().split("T")[0]; // YYYY-MM-DD format
  });
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    return date.toISOString().split("T")[0]; // YYYY-MM-DD format
  });
  const [uploadProgress, setUploadProgress] = useState<{
    phase: string;
    message: string;
    progress?: { completed: number; total: number };
  } | null>(null);

  // Get default health types to request
  const healthTypes = HealthKitBridge.getAvailableTypes();

  useEffect(() => {
    loadInitialData();
    loadDataSourcePreferences();

    // Listen for upload progress events
    const subscription = HealthKitBridge.onSyncEvent((event: any) => {
      console.log("📡 Sync event:", event);
      if (
        event.phase === "historical" ||
        event.phase === "uploading" ||
        event.phase === "completed" ||
        event.phase === "failed"
      ) {
        setUploadProgress({
          phase: event.phase,
          message: event.message,
          progress: event.progress,
        });

        // Clear progress after completion or failure
        if (event.phase === "completed" || event.phase === "failed") {
          setTimeout(() => setUploadProgress(null), 3000);
        }
      }
    });

    // Initialize HealthKit service to start collecting data
    try {
      HealthKitService.initialize();
      console.log("✅ HealthKitService initialized from Settings");
    } catch (error) {
      console.error("❌ Error initializing HealthKitService:", error);
    }

    // Configure native Swift uploader once when component mounts
    const configureNativeUploader = async () => {
      if (!user?.id) {
        console.log("⏳ SettingsScreen: Waiting for user authentication...");
        return;
      }

      try {
        const apiUrl = Constants.expoConfig?.extra?.apiGatewayUrl;

        if (!apiUrl) {
          console.error("❌ SettingsScreen: No API Gateway URL configured!");
          return;
        }

        await HealthKitBridge.configureUploader({
          apiUrl: apiUrl,
          userId: user.id,
          authHeaders: {}, // Empty for now - no authentication required
        });

        console.log("✅ SettingsScreen: Native Swift uploader configured");
        console.log(`🔗 API URL: ${apiUrl}`);
        console.log(`👤 User ID: ${user.id}`);
      } catch (error) {
        console.error(
          "❌ SettingsScreen: Failed to configure native uploader:",
          error
        );
      }
    };

    configureNativeUploader();

    return () => {
      subscription?.remove?.();
    };

    // =============================================================================
    // NATIVE SWIFT UPLOAD CONFIGURATION
    // =============================================================================
    // All uploads are now handled natively in Swift for better performance
    // and true background processing. No JavaScript upload logic needed.
    //
    // UPLOAD STRATEGY:
    // 1. Configure uploader once when app starts
    // 2. All data flows: HealthKit → Swift → Cloud (no JavaScript involvement)
    // 3. Works even when app is backgrounded or closed
    // 4. Retry logic and error handling in native code
    //
    // BENEFITS:
    // - True background uploads (works when app is closed)
    // - Better performance (no JS bridge overhead)
    // - More reliable (native networking)
    // - Simpler architecture (no duplicate configuration)
    // =============================================================================
  }, [user, isSyncActive]); // Re-run when sync status changes

  //Data preferences selection (for the components that run on the UI)
  const loadDataSourcePreferences = async () => {
    try {
      const preferences = await SettingsService.getAllDataSourcePreferences();

      // Set the loaded preferences
      setDataSourcePreferences(preferences);

      // Get available sources from HealthKit service
      const stepsSources =
        HealthKitService.getAvailableSourcesForMetric("steps");
      setAvailableStepsSources(stepsSources);

      // Set default preference if none exists and sources are available
      if (stepsSources.length > 0 && !preferences.steps) {
        await SettingsService.setDefaultPreference("steps", stepsSources[0]);

        // Reload preferences after setting default
        const updatedPreferences =
          await SettingsService.getAllDataSourcePreferences();
        setDataSourcePreferences(updatedPreferences);
      }

      console.log("📱 Loaded data source preferences:", preferences);
      console.log("📱 Available steps sources:", stepsSources);

      // Debug: Show even if no sources to help with troubleshooting
      if (stepsSources.length === 0) {
        console.log("⚠️ No available steps sources found. This could mean:");
        console.log("   - No steps data has been synced yet");
        console.log("   - HealthKit permissions not granted");
        console.log("   - No steps data in HealthKit");
      }
    } catch (error) {
      console.error("Error loading data source preferences:", error);

      // Set safe defaults on error
      setDataSourcePreferences({
        steps: null,
        heartRate: null,
      });
      setAvailableStepsSources([]);
    }
  };

  //User's settings that are saved locally in the device's storage
  //Only three states for now, will expand in the future
  //Permissions, hasPermissions, isSyncActive

  //NOTE: Permissions is what stores which data types we store permissions in
  const loadInitialData = async () => {
    try {
      console.log("🔄 Loading initial settings data...");

      // Load saved settings from storage
      const savedSettings = await SettingsService.getSettings();

      // Restore state from saved settings
      setPermissions(savedSettings.permissions);
      setHasPermissions(savedSettings.hasPermissions);
      setIsSyncActive(savedSettings.isSyncActive);

      console.log("✅ Restored settings:", {
        permissions: savedSettings.permissions.length,
        hasPermissions: savedSettings.hasPermissions,
        isSyncActive: savedSettings.isSyncActive,
      });

      // If user has permissions but it's been a while, verify they're still valid
      if (
        savedSettings.hasPermissions &&
        (await SettingsService.shouldCheckPermissions())
      ) {
        console.log(
          "🔍 Permissions are old, will verify on next permission request"
        );
      }

      // If sync was previously active and user has permissions, attempt to restore sync state
      if (
        savedSettings.isSyncActive &&
        savedSettings.hasPermissions &&
        savedSettings.permissions.length > 0
      ) {
        try {
          console.log("🔄 Attempting to restore background sync...");

          // Enhanced sync types: include ECG even if not explicitly granted
          const syncTypes = [...savedSettings.permissions];
          const allAvailableTypes = HealthKitBridge.getAvailableTypes();

          //Making sure that HKElectrocardiogramType is in the sync types
          if (syncTypes.includes("HKElectrocardiogramType")) {
            console.log("🫀 ECG is in the sync types");
          }
          // if (
          //   allAvailableTypes.includes("HKElectrocardiogramType") &&
          //   !syncTypes.includes("HKElectrocardiogramType")
          // ) {
          //   syncTypes.push("HKElectrocardiogramType");
          //   console.log(
          //     "🫀 Added ECG to background sync restore (device compatible)"
          //   );
          // }

          // Simply attempt to start sync - the bridge will handle if it's already running
          await HealthKitBridge.startBackgroundSync(syncTypes);
          console.log("✅ Background sync restored/confirmed");
        } catch (error) {
          console.error("❌ Failed to restore background sync:", error);
          // Update storage to reflect actual state
          await SettingsService.updateSyncStatus(false, false);
          setIsSyncActive(false);
        }
      }
    } catch (error) {
      console.error("Error loading initial data:", error);
      // Fall back to default state on error
      setPermissions([]);
      setHasPermissions(false);
      setIsSyncActive(false);
    }
  };

  //Request Healthkit permissions
  const handleRequestPermissions = async () => {
    setIsLoading(true);
    try {
      const result = await HealthKitBridge.requestPermissions(healthTypes);

      // Update local state
      setPermissions(result.granted);
      setHasPermissions(result.granted.length > 0);

      // Save permissions to persistent storage
      await SettingsService.updatePermissions(result.granted);

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

  const handleSyncToggle = async (value: boolean) => {
    if (!hasPermissions) {
      Alert.alert("No Permissions", "Please request permissions first");
      return;
    }

    setIsLoading(true);
    try {
      if (value) {
        // Enhanced sync types: include ECG even if not explicitly granted
        // ECG might be granted but not showing up in permissions array
        const syncTypes = [...permissions];

        // Always attempt ECG if device supports it (iOS 12.2+)
        const allAvailableTypes = HealthKitBridge.getAvailableTypes();
        if (
          allAvailableTypes.includes("HKElectrocardiogramType") &&
          !syncTypes.includes("HKElectrocardiogramType")
        ) {
          syncTypes.push("HKElectrocardiogramType");
          console.log("🫀 Added ECG to background sync (device compatible)");
        }

        console.log(
          "🔄 Starting background sync with types:",
          syncTypes.length
        );

        // Start background sync (uploader already configured in useEffect)
        await HealthKitBridge.startBackgroundSync(syncTypes);
        setIsSyncActive(true);

        // Save sync status to persistent storage
        await SettingsService.updateSyncStatus(true, true);

        Alert.alert("Success", "Background sync started with native upload");
      } else {
        await HealthKitBridge.stopBackgroundSync();
        setIsSyncActive(false);

        // Save sync status to persistent storage
        await SettingsService.updateSyncStatus(false, false);

        Alert.alert("Success", "Background sync stopped");
      }
    } catch (error) {
      console.error("Sync toggle failed:", error);
      Alert.alert(
        "Error",
        `Failed to ${value ? "start" : "stop"} background sync: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Revert the toggle state on error and update storage
      setIsSyncActive(!value);
      try {
        await SettingsService.updateSyncStatus(!value, !value);
      } catch (storageError) {
        console.error("Failed to revert sync status in storage:", storageError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDateRangeUpload = async () => {
    // Show choice dialog: All data or ECG only
    Alert.alert("Upload Type", "What type of data would you like to upload?", [
      {
        text: "All Data",
        onPress: () => performDateRangeUpload(permissions),
      },
      {
        text: "ECG Only",
        onPress: () => performDateRangeUpload(["HKElectrocardiogramType"]),
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  };

  const performDateRangeUpload = async (typesToUpload: string[]) => {
    if (!hasPermissions) {
      Alert.alert("No Permissions", "Please request permissions first");
      return;
    }

    if (!user?.id) {
      Alert.alert("Error", "User not authenticated");
      return;
    }

    // Validate dates
    const startDateTime = new Date(`${startDate}T00:00:00.000Z`);
    const endDateTime = new Date(`${endDate}T23:59:59.999Z`);

    if (startDateTime >= endDateTime) {
      Alert.alert("Invalid Dates", "Start date must be before end date");
      return;
    }

    const daysDiff = Math.ceil(
      (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff > 30) {
      Alert.alert(
        "Date Range Too Large",
        "Please select a date range of 30 days or less"
      );
      return;
    }

    setIsLoading(true);
    setUploadProgress({ phase: "starting", message: "Preparing to upload..." });

    try {
      console.log(
        `📅 Starting date range upload from ${startDateTime.toISOString()} to ${endDateTime.toISOString()}`
      );

      // Use the native uploadDateRange method (uploader already configured in useEffect)
      console.log(
        `📤 Uploading ${typesToUpload.length} data types:`,
        typesToUpload
      );

      const result = await HealthKitBridge.uploadDateRange(
        typesToUpload,
        startDateTime.toISOString(),
        endDateTime.toISOString()
      );

      console.log("📊 Upload result:", JSON.stringify(result, null, 2));

      Alert.alert(
        result.success ? "Success" : "Error",
        result.success
          ? `Successfully uploaded ${result.samplesUploaded} samples from ${daysDiff} days!\n\nData types: ${result.dataTypes.length}`
          : `Failed to upload: ${result.message}`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Date range upload failed:", error);
      Alert.alert(
        "Error",
        `Failed to upload date range: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      setUploadProgress({ phase: "failed", message: "Upload failed" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStepsSourcePreference = async (selectedSource: string) => {
    try {
      setIsLoading(true);

      // Update the selected source as the preference
      // Update in HealthKitService (this will reprocess all cached data)
      await HealthKitService.updateSourcePreference("steps", selectedSource);

      // Update local state
      setDataSourcePreferences((prev) => ({
        ...prev,
        steps: selectedSource,
      }));

      console.log("✅ Updated steps source preference to:", selectedSource);
      Alert.alert(
        "Source Updated",
        `Steps data will now prioritize ${selectedSource}. The Biology screen will update automatically.`
      );
    } catch (error) {
      console.error("Error updating steps source preference:", error);
      Alert.alert(
        "Error",
        "Failed to update data source preference. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>
            Manage your health data sync preferences
          </Text>
        </View>

        {/* Permissions Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Permissions</Text>
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.statusText}>
                HealthKit Permissions:{" "}
                {hasPermissions ? "✅ Granted" : "❌ Not Granted"}
              </Text>
            </View>
            <Text style={styles.statusSubtext}>
              {hasPermissions
                ? `${permissions.length} health data types accessible`
                : "Tap the button below to request health data access"}
            </Text>

            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleRequestPermissions}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>
                  {hasPermissions
                    ? "Update Permissions"
                    : "Request Permissions"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Sync Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sync Settings</Text>

          {/* Background Sync Toggle */}
          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Background Sync</Text>
                <Text style={styles.settingDescription}>
                  Automatically sync health data in the background
                </Text>
              </View>
              <Switch
                value={isSyncActive}
                onValueChange={handleSyncToggle}
                disabled={!hasPermissions || isLoading}
                trackColor={{
                  false: colors.gray[300],
                  true: colors.primary[600],
                }}
                thumbColor={
                  isSyncActive ? colors.background.secondary : colors.gray[400]
                }
              />
            </View>
          </View>

          {/* Date Range Upload */}
          <View style={styles.settingCard}>
            <View style={styles.settingColumn}>
              <Text style={styles.settingTitle}>Upload Date Range</Text>
              <Text style={styles.settingDescription}>
                Upload health data for a specific date range
              </Text>

              {/* Date Inputs */}
              <View style={styles.dateInputContainer}>
                <View style={styles.dateInputWrapper}>
                  <Text style={styles.dateLabel}>Start Date</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.gray[400]}
                  />
                </View>
                <View style={styles.dateInputWrapper}>
                  <Text style={styles.dateLabel}>End Date</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.gray[400]}
                  />
                </View>
              </View>

              {/* Upload Progress */}
              {uploadProgress && (
                <View style={styles.progressContainer}>
                  <Text style={styles.progressText}>
                    {uploadProgress.message}
                  </Text>
                  {uploadProgress.progress && (
                    <Text style={styles.progressDetails}>
                      {uploadProgress.progress.completed}/
                      {uploadProgress.progress.total}
                    </Text>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.secondaryButton,
                  (!hasPermissions || isLoading) && styles.disabledButton,
                ]}
                onPress={handleDateRangeUpload}
                disabled={!hasPermissions || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.primary[600]} />
                ) : (
                  <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                    Upload Date Range
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Data Sources */}
        {hasPermissions && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Sources</Text>
            <Text style={styles.sectionSubtitle}>
              Choose which source to prioritize for each metric
            </Text>

            <View style={styles.settingCard}>
              <View style={styles.settingColumn}>
                <Text style={styles.settingTitle}>Steps Data Source</Text>
                <Text style={styles.settingDescription}>
                  {dataSourcePreferences?.steps
                    ? `Currently prioritizing: ${dataSourcePreferences.steps}`
                    : "No preference set - using source with most steps"}
                </Text>

                {availableStepsSources.length >= 1 && (
                  <View style={styles.sourcesList}>
                    {availableStepsSources.map((source, index) => {
                      const isSelected =
                        dataSourcePreferences?.steps === source;
                      return (
                        <TouchableOpacity
                          key={source}
                          style={[
                            styles.sourceOption,
                            isSelected && styles.sourceOptionSelected,
                          ]}
                          onPress={() =>
                            handleUpdateStepsSourcePreference(source)
                          }
                          disabled={isLoading}
                        >
                          <View style={styles.sourceOptionContent}>
                            <Text
                              style={[
                                styles.sourceOptionText,
                                isSelected && styles.sourceOptionTextSelected,
                              ]}
                            >
                              {source}
                            </Text>
                            {isSelected && (
                              <Text style={styles.selectedIndicator}>✓</Text>
                            )}
                          </View>
                          <Text style={styles.sourceOptionPriority}>
                            Priority:{" "}
                            {(dataSourcePreferences?.steps?.indexOf(source) ??
                              -1) + 1}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {availableStepsSources.length === 0 && (
                  <View style={styles.noSourcesContainer}>
                    <Text style={styles.noSourcesText}>
                      No data sources found yet. This happens when:
                    </Text>
                    <Text style={styles.noSourcesSubtext}>
                      • No steps data has been synced from HealthKit yet
                    </Text>
                    <Text style={styles.noSourcesSubtext}>
                      • You need to walk some steps first
                    </Text>
                    <Text style={styles.noSourcesSubtext}>
                      • Your devices haven't synced to HealthKit yet
                    </Text>
                    <TouchableOpacity
                      style={[styles.button, styles.secondaryButton]}
                      onPress={loadDataSourcePreferences}
                      disabled={isLoading}
                    >
                      <Text
                        style={[styles.buttonText, styles.secondaryButtonText]}
                      >
                        Refresh Sources
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {availableStepsSources.length === 1 && (
                  <View style={styles.singleSourceContainer}>
                    <Text style={styles.singleSourceText}>
                      Only one data source found: {availableStepsSources[0]}
                    </Text>
                    <Text style={styles.singleSourceSubtext}>
                      Add more apps or devices to your Health app to see more
                      sources here.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Status Information */}
        {hasPermissions && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.statusCard}>
              <Text style={styles.statusText}>
                Background Sync: {isSyncActive ? "🟢 Active" : "🔴 Inactive"}
              </Text>
              <Text style={styles.statusText}>
                Permissions: {permissions.length} health data types
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing["2xl"],
    marginTop: spacing.lg,
  },
  title: {
    ...typography.styles.h1,
    color: colors.gray[900],
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.styles.body,
    color: colors.gray[500],
    textAlign: "center",
  },
  section: {
    marginBottom: spacing["2xl"],
  },
  sectionTitle: {
    ...typography.styles.h3,
    color: colors.gray[900],
    marginBottom: spacing.lg,
  },
  sectionSubtitle: {
    ...typography.styles.body,
    color: colors.gray[500],
    marginBottom: spacing.lg,
    marginTop: -spacing.sm,
  },
  statusCard: {
    ...commonStyles.card,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  statusText: {
    ...typography.styles.bodyLarge,
    color: colors.gray[900],
    marginBottom: spacing.xs,
  },
  statusSubtext: {
    ...typography.styles.body,
    color: colors.gray[500],
    marginBottom: spacing.lg,
  },
  settingCard: {
    ...commonStyles.card,
    marginBottom: spacing.lg,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingColumn: {
    flex: 1,
  },
  settingInfo: {
    flex: 1,
    marginRight: spacing.lg,
  },
  settingTitle: {
    ...typography.styles.bodyLarge,
    color: colors.gray[900],
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  settingDescription: {
    ...typography.styles.body,
    color: colors.gray[500],
  },
  button: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing["2xl"],
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.primary[600],
  },
  secondaryButton: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.primary[600],
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.styles.button,
    color: colors.background.secondary,
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: colors.primary[600],
  },
  // Data Sources styles
  sourcesList: {
    marginTop: spacing.lg,
  },
  sourceOption: {
    backgroundColor: colors.background.secondary,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  sourceOptionSelected: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[600],
    borderWidth: 2,
  },
  sourceOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  sourceOptionText: {
    ...typography.styles.bodyLarge,
    color: colors.gray[900],
    fontWeight: "500",
  },
  sourceOptionTextSelected: {
    color: colors.primary[700],
    fontWeight: "600",
  },
  selectedIndicator: {
    ...typography.styles.bodyLarge,
    color: colors.primary[600],
    fontWeight: "bold",
  },
  sourceOptionPriority: {
    ...typography.styles.caption,
    color: colors.gray[500],
  },
  noSourcesContainer: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.gray[50],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  noSourcesText: {
    ...typography.styles.bodyLarge,
    color: colors.gray[700],
    fontWeight: "500",
    marginBottom: spacing.sm,
  },
  noSourcesSubtext: {
    ...typography.styles.body,
    color: colors.gray[500],
    marginBottom: spacing.xs,
    marginLeft: spacing.sm,
  },
  singleSourceContainer: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.primary[50],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  singleSourceText: {
    ...typography.styles.bodyLarge,
    color: colors.primary[700],
    fontWeight: "500",
    marginBottom: spacing.xs,
  },
  singleSourceSubtext: {
    ...typography.styles.body,
    color: colors.primary[600],
  },
  dateInputContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  dateInputWrapper: {
    flex: 0.48,
  },
  dateLabel: {
    ...typography.styles.body,
    color: colors.gray[700],
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  dateInput: {
    ...typography.styles.body,
    color: colors.gray[900],
    backgroundColor: colors.background.secondary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray[300],
  },
  progressContainer: {
    backgroundColor: colors.background.secondary,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary[600],
  },
  progressText: {
    ...typography.styles.body,
    color: colors.gray[700],
    marginBottom: spacing.xs,
  },
  progressDetails: {
    ...typography.styles.bodySmall,
    color: colors.gray[500],
    fontWeight: "600",
  },
});
