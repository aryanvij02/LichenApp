# Testing Your Native Upload System

Your native Swift upload system is already built and should be working! Here's how to test it:

## Quick Test Steps

### 1. Check Configuration Status

Add this to your SettingsScreen.tsx after the `configureNativeUploader()` call:

```javascript
// Test configuration status
const testConfig = async () => {
  try {
    const status = await HealthKitBridge.getSyncStatus();
    console.log("🔍 Native uploader status:", status);
  } catch (error) {
    console.error("❌ Config test failed:", error);
  }
};
testConfig();
```

### 2. Test Background Sync

Your background sync should already be starting automatically when the app launches. Check the logs for:

```
🔍 HEALTHKIT_DEBUG: ✅ Background update: X new samples uploaded
🔍 UPLOADER_DEBUG: ✅ Successfully uploaded X samples
```

### 3. Force a Manual Test

Add this test function to trigger an immediate sync:

```javascript
const testManualSync = async () => {
  try {
    const result = await HealthKitBridge.syncNow([
      "HKQuantityTypeIdentifierStepCount",
      "HKQuantityTypeIdentifierHeartRate",
    ]);
    console.log("🔍 Manual sync result:", result);
  } catch (error) {
    console.error("❌ Manual sync failed:", error);
  }
};

// Add a button to trigger this test
```

### 4. Check Your Lambda Logs

Your Lambda should be receiving data with this exact format:

```json
{
  "user_id": "google_12345...",
  "batch_type": "realtime",
  "samples": [
    {
      "startDate": "2024-01-15T08:00:00.000Z",
      "endDate": "2024-01-15T08:01:00.000Z",
      "type": "HKQuantityTypeIdentifierStepCount",
      "sourceName": "Apple Watch",
      "uuid": "...",
      "value": 42,
      "unit": "count"
    }
  ],
  "upload_metadata": {
    "total_samples": 1,
    "data_types": ["HKQuantityTypeIdentifierStepCount"],
    "data_source": "Apple Watch"
  }
}
```

## What Should Happen

1. **App Launch**: Native uploader gets configured
2. **Background**: HealthKit observers start monitoring
3. **New Data**: When you take steps/HR changes, upload happens automatically
4. **Lambda**: Receives and processes data exactly like before

## Potential Issues to Watch For

1. **No Configuration**: Check logs for "No configuration available - cannot upload"
2. **Network Errors**: Check logs for retry attempts and final success/failure
3. **Missing Permissions**: Verify HealthKit permissions are granted
4. **API URL Issues**: Verify your .env and app.config.js have the right URL

## Next Steps

If everything works, we can:

1. Remove the deprecated JavaScript uploader completely
2. Enhance offline queueing for better reliability
3. Add background task management for iOS
