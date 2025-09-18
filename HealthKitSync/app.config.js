//This is the configuration file for the application which Expo uses. 
//Defined how your app is built, configured, and deployed. 

// Debug environment variables during build
console.log('🔍 Build-time environment variables:');
console.log('EXPO_API_GATEWAY_URL:', process.env.EXPO_API_GATEWAY_URL);
console.log('EXPO_API_BACKEND_URL:', process.env.EXPO_API_BACKEND_URL);

export default {
    expo: {
      name: "HealthKit Sync",
      slug: "healthkit-sync",
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "light",
      extra: {
        eas: {
          projectId: "4bc06b8d-739c-4fd7-83f7-662e0caf7c28"
        },
        apiGatewayUrl: process.env.EXPO_API_GATEWAY_URL,
        apiBackendUrl: process.env.EXPO_API_BACKEND_URL,
        supabaseUrl: process.env.EXPO_SUPABASE_URL,
        supabaseKey: process.env.EXPO_SUPABASE_KEY
      },
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
          UIBackgroundModes: ["background-fetch", "background-processing"],
          BGTaskSchedulerPermittedIdentifiers: [
            "com.lichenapp.healthsync.refresh", //BGAppRefreshTask
            "com.lichenapp.healthsync.process" //BGProcessingTask
          ],
          NSAppTransportSecurity: {
            NSAllowsArbitraryLoads: true
          },
          CFBundleURLTypes: [
            {
              CFBundleURLName: "GoogleSignIn",
              CFBundleURLSchemes: [
                "com.googleusercontent.apps.337554859297-vrbujkq27dk62t1vtu7aqnkt7cv7k0cv"
              ]
            }
          ]
        },
        entitlements: {
          "com.apple.developer.healthkit": true,
          "com.apple.developer.healthkit.background-delivery": true
        }
      },
      android: {
        package: "Ginkgo.HealthDataExporter"
      },
      web: {
        favicon: "./assets/favicon.png"
      },
      plugins: [
        "expo-dev-client",
        "expo-localization",
        [
          "@react-native-google-signin/google-signin",
          {
            iosUrlScheme: "com.googleusercontent.apps.337554859297-vrbujkq27dk62t1vtu7aqnkt7cv7k0cv"
          }
        ]
      ]
    }
  };