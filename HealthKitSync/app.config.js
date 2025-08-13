export default {
    expo: {
      name: "HealthKit Sync",
      slug: "healthkit-sync",
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "light",
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff"
      },
      assetBundlePatterns: ["**/*"],
      ios: {
        supportsTablet: true,
        bundleIdentifier: "Ginkgo.HealthDataExporter",
        infoPlist: {
          NSHealthShareUsageDescription: "HealthDataExporter reads your health data to create exportable reports.",
          NSHealthUpdateUsageDescription: "HealthDataExporter does not write any data to HealthKit.",
          UIBackgroundModes: ["background-fetch"]
        },
        entitlements: {
          "com.apple.developer.healthkit": true,
          "com.apple.developer.healthkit.background-delivery": true
        }
      },
      web: {
        favicon: "./assets/favicon.png"
      },
      plugins: [
        "expo-dev-client",
        "expo-localization"
      ]
    }
  };