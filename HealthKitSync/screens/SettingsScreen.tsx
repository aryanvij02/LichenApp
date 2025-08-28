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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import HealthKitBridge from "expo-healthkit-bridge";
import { commonStyles } from "../styles/common";
import { colors, spacing, typography } from "../styles";
import { HealthDataUploader } from "../services/HealthDataUploader";
import { useAuth } from "../context/AuthContext";

export const SettingsScreen: React.FC = () => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncActive, setIsSyncActive] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [uploader, setUploader] = useState<HealthDataUploader | null>(null);

  // Get default health types to request
  const healthTypes = HealthKitBridge.getAvailableTypes();

  useEffect(() => {
    loadInitialData();

    // Initialize uploader for historical data upload
    const apiUrl = Constants.expoConfig?.extra?.apiGatewayUrl;
    console.log("🔗 SettingsScreen: Using API URL for uploads:", apiUrl);

    if (!apiUrl) {
      console.error(
        "❌ SettingsScreen: No API Gateway URL configured! Check your .env file and app.config.js"
      );
      return;
    }

    const uploaderInstance = new HealthDataUploader({
      apiUrl: apiUrl,
      userId: user?.id || "anonymous_user", // Use actual user ID
      getAuthHeaders: async () => {
        console.log(
          "⚠️ SettingsScreen: No authentication configured for API uploads"
        );
        return {};
      },
    });
    setUploader(uploaderInstance);
  }, [user]);

  const loadInitialData = async () => {
    try {
      // For initial load, we'll start with no permissions assumed
      // The user can check their permissions by tapping "Request Permissions"
      setPermissions([]);
      setHasPermissions(false);
      setIsSyncActive(false);
    } catch (error) {
      console.error("Error loading initial data:", error);
    }
  };

  const handleRequestPermissions = async () => {
    setIsLoading(true);
    try {
      const result = await HealthKitBridge.requestPermissions(healthTypes);
      setPermissions(result.granted);
      setHasPermissions(result.granted.length > 0);

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
        await HealthKitBridge.startBackgroundSync(permissions);
        setIsSyncActive(true);
        Alert.alert("Success", "Background sync started");
      } else {
        await HealthKitBridge.stopBackgroundSync();
        setIsSyncActive(false);
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
      // Revert the toggle state on error
      setIsSyncActive(!value);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncHistorical = async () => {
    if (!hasPermissions) {
      Alert.alert("No Permissions", "Please request permissions first");
      return;
    }

    if (!uploader) {
      Alert.alert("Error", "Upload service not initialized");
      return;
    }

    setIsLoading(true);
    try {
      // Query last 5 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 5);

      console.log(
        `📅 Syncing historical data from ${startDate.toISOString()} to ${endDate.toISOString()}`
      );

      const result = await HealthKitBridge.queryDataInRange(
        permissions,
        startDate.toISOString(),
        endDate.toISOString()
      );

      let totalSamples = 0;
      Object.entries(result).forEach(([type, samples]) => {
        totalSamples += samples.length;
        console.log(`📊 ${type}: ${samples.length} samples`);
      });

      console.log(`🚀 Uploading ${totalSamples} samples to backend...`);

      // Upload the data to backend
      const success = await uploader.uploadHistoricalData(result, 5);

      Alert.alert(
        success ? "Success" : "Error",
        success
          ? `Successfully synced ${totalSamples} samples from last 5 days to backend!`
          : `Found ${totalSamples} samples but failed to upload to backend`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Historical sync failed:", error);
      Alert.alert(
        "Error",
        `Failed to sync historical data: ${
          error instanceof Error ? error.message : String(error)
        }`
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

          {/* Historical Sync Button */}
          <View style={styles.settingCard}>
            <View style={styles.settingColumn}>
              <Text style={styles.settingTitle}>Sync Historical Data</Text>
              <Text style={styles.settingDescription}>
                Sync the past 5 days of health data
              </Text>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.secondaryButton,
                  (!hasPermissions || isLoading) && styles.disabledButton,
                ]}
                onPress={handleSyncHistorical}
                disabled={!hasPermissions || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.primary[600]} />
                ) : (
                  <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                    Sync Historical
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

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
});
