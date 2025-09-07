import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import HealthKitBridge from "expo-healthkit-bridge";
import { commonStyles } from "../styles/common";
import { colors, spacing, typography } from "../styles";

interface DiagnosticResult {
  [key: string]: any;
}

export const DiagnosticsScreen: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [diagnosticResults, setDiagnosticResults] =
    useState<DiagnosticResult | null>(null);
  const [backgroundSyncResults, setBackgroundSyncResults] =
    useState<DiagnosticResult | null>(null);

  const runDiagnostics = async () => {
    setIsLoading(true);
    try {
      console.log("🔍 Running diagnostics...");

      // Gather diagnostic information using available methods
      const syncStatus = await HealthKitBridge.getSyncStatus();
      const availableTypes = HealthKitBridge.getAvailableTypes();
      const recentData = await HealthKitBridge.queryLast24Hours();

      const results = {
        syncStatus,
        availableTypes: availableTypes.length,
        recentDataTypes: Object.keys(recentData),
        recentDataSampleCounts: Object.fromEntries(
          Object.entries(recentData).map(([type, samples]) => [
            type,
            samples.length,
          ])
        ),
        timestamp: new Date().toISOString(),
      };

      console.log("Diagnostic Results:", results);
      setDiagnosticResults(results);

      Alert.alert(
        "Diagnostics Complete",
        `Found ${results.availableTypes} available types, ${results.recentDataTypes.length} types with recent data`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("❌ Diagnostics failed:", error);
      Alert.alert(
        "Diagnostics Failed",
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        [{ text: "OK" }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const testBackgroundSync = async () => {
    setIsLoading(true);
    try {
      console.log("🔄 Testing background sync...");

      // Test background sync functionality by checking sync status
      const syncStatus = await HealthKitBridge.getSyncStatus();
      const essentialTypes = HealthKitBridge.getEssentialTypes();

      // Try to perform a sync test with essential types
      const syncResult = await HealthKitBridge.syncNow(essentialTypes);

      const results = {
        syncStatus,
        essentialTypes,
        syncResult,
        timestamp: new Date().toISOString(),
      };

      console.log("Background Sync Test:", results);
      setBackgroundSyncResults(results);

      Alert.alert(
        "Background Sync Test Complete",
        `Sync completed: ${syncResult.added} added, ${syncResult.deleted} deleted`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("❌ Background sync test failed:", error);
      Alert.alert(
        "Background Sync Test Failed",
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        [{ text: "OK" }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const forceSyncNow = async () => {
    setIsLoading(true);
    try {
      console.log("⚡ Forcing sync now...");

      // Force immediate sync using all available types
      const allTypes = HealthKitBridge.getAvailableTypes();
      const results = await HealthKitBridge.syncNow(allTypes);
      console.log("Force Sync Results:", results);

      Alert.alert(
        "Force Sync Complete",
        `Sync completed successfully! Added: ${results.added}, Deleted: ${results.deleted}`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("❌ Force sync failed:", error);
      Alert.alert(
        "Force Sync Failed",
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        [{ text: "OK" }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const clearResults = () => {
    setDiagnosticResults(null);
    setBackgroundSyncResults(null);
  };

  const renderResultsCard = (
    title: string,
    results: DiagnosticResult | null
  ) => {
    if (!results) return null;

    return (
      <View style={styles.resultCard}>
        <Text style={styles.resultTitle}>{title}</Text>
        <ScrollView style={styles.resultContent} nestedScrollEnabled>
          <Text style={styles.resultText}>
            {JSON.stringify(results, null, 2)}
          </Text>
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Diagnostics</Text>
          <Text style={styles.subtitle}>
            Test and troubleshoot HealthKit integration
          </Text>
        </View>

        {/* Diagnostic Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diagnostic Actions</Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={runDiagnostics}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>Run Diagnostics</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={testBackgroundSync}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.primary[600]} />
              ) : (
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                  Test Background Sync
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.warningButton]}
              onPress={forceSyncNow}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>Force Sync Now</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Results Section */}
        {(diagnosticResults || backgroundSyncResults) && (
          <View style={styles.section}>
            <View style={styles.resultsHeader}>
              <Text style={styles.sectionTitle}>Results</Text>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearResults}
              >
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
            </View>

            {renderResultsCard("Diagnostic Results", diagnosticResults)}
            {renderResultsCard(
              "Background Sync Test Results",
              backgroundSyncResults
            )}
          </View>
        )}

        {/* Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              This diagnostic tool helps troubleshoot HealthKit integration
              issues.
            </Text>
            <Text style={styles.infoText}>
              • <Text style={styles.infoBold}>Run Diagnostics:</Text> Check
              system status and permissions
            </Text>
            <Text style={styles.infoText}>
              • <Text style={styles.infoBold}>Test Background Sync:</Text>{" "}
              Verify background sync functionality
            </Text>
            <Text style={styles.infoText}>
              • <Text style={styles.infoBold}>Force Sync Now:</Text> Trigger
              immediate data synchronization
            </Text>
          </View>
        </View>
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
  buttonContainer: {
    gap: spacing.md,
  },
  button: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing["2xl"],
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: colors.primary[600],
  },
  secondaryButton: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.primary[600],
  },
  warningButton: {
    backgroundColor: colors.warning,
  },
  buttonText: {
    ...typography.styles.button,
    color: colors.background.secondary,
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: colors.primary[600],
  },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  clearButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.gray[100],
    borderRadius: 8,
  },
  clearButtonText: {
    ...typography.styles.bodySmall,
    color: colors.gray[600],
    fontWeight: "600",
  },
  resultCard: {
    ...commonStyles.card,
    marginBottom: spacing.lg,
  },
  resultTitle: {
    ...typography.styles.bodyLarge,
    color: colors.gray[900],
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  resultContent: {
    maxHeight: 200,
    backgroundColor: colors.gray[50],
    borderRadius: 8,
    padding: spacing.md,
  },
  resultText: {
    ...typography.styles.bodySmall,
    color: colors.gray[700],
    fontFamily: "monospace",
  },
  infoCard: {
    ...commonStyles.card,
    backgroundColor: colors.primary[50],
    borderLeftWidth: 4,
    borderLeftColor: colors.primary[600],
  },
  infoText: {
    ...typography.styles.body,
    color: colors.gray[700],
    marginBottom: spacing.sm,
  },
  infoBold: {
    fontWeight: "600",
    color: colors.gray[900],
  },
});
