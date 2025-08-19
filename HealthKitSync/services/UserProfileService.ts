import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  profilePictureUrl?: string;
  timezone: string;
  locale: string;
  country?: string;
  region?: string;
  lastAppVersion: string;
  lastPlatform: string;
}

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  photo?: string;
}

export class UserProfileService {
  private static readonly API_GATEWAY_URL = Constants.expoConfig?.extra?.apiGatewayUrl || 'https://wxa3064yx7.execute-api.us-west-2.amazonaws.com/dev';
  private static readonly USER_KEY = 'current_user';
  private static readonly AUTH_TOKEN_KEY = 'auth_token';

  static async signInWithGoogle(): Promise<GoogleUser | null> {
    try {
      console.log("🔐 Starting Google Sign-In in UserProfileService...");
      
      // Check if Google Play Services are available (iOS always returns true)
      const hasPlayServices = await GoogleSignin.hasPlayServices();
      console.log("📱 Has Play Services:", hasPlayServices);
      
      // Attempt sign in
      console.log("🔄 Calling GoogleSignin.signIn()...");
      const userInfo = await GoogleSignin.signIn();
      console.log("✅ Google Sign-In successful, userInfo:", userInfo);
      
      if (!userInfo || !userInfo.user) {
        console.error("❌ No user info received from Google Sign-In");
        return null;
      }
      
      const googleUser: GoogleUser = {
        id: userInfo.user.id,
        email: userInfo.user.email,
        name: userInfo.user.name || '',
        photo: userInfo.user.photo || undefined
      };
      
      console.log("👤 Created GoogleUser object:", googleUser);

      // Store auth token
      if (userInfo.idToken) {
        console.log("💾 Storing auth token...");
        await AsyncStorage.setItem(this.AUTH_TOKEN_KEY, userInfo.idToken);
      }

      // Store user locally
      console.log("💾 Storing user locally...");
      await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(googleUser));
      console.log("✅ User stored successfully");

      return googleUser;
    } catch (error) {
      console.error('❌ Google sign-in error in UserProfileService:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      return null;
    }
  }

  static async signOut(): Promise<void> {
    try {
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
      await AsyncStorage.multiRemove([this.USER_KEY, this.AUTH_TOKEN_KEY]);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  static async getCurrentUser(): Promise<GoogleUser | null> {
    try {
      const userData = await AsyncStorage.getItem(this.USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  static async isSignedIn(): Promise<boolean> {
    try {
      console.log("🔍 Checking if user is signed in...");
      // In v12+, use hasPreviousSignIn() instead of isSignedIn()
      const hasPreviousSignIn = await GoogleSignin.hasPreviousSignIn();
      console.log("📱 Has previous sign in:", hasPreviousSignIn);
      return hasPreviousSignIn;
    } catch (error) {
      console.error('❌ Error checking sign-in status:', error);
      return false;
    }
  }

  static getDeviceLocalizationData(): Partial<UserProfile> {
    const locales = Localization.getLocales();
    const calendars = Localization.getCalendars();
    const primaryLocale = locales[0];
    
    // Get timezone with fallback logic
    const timezone = calendars[0]?.timeZone || 
                    Intl.DateTimeFormat().resolvedOptions().timeZone || 
                    'UTC';
    
    // Get app version
    const appVersion = Application.nativeApplicationVersion || '1.0.0';
    
    return {
      timezone: timezone,
      locale: primaryLocale?.languageTag || 'en-US',
      country: primaryLocale?.regionCode || undefined,
      region: primaryLocale?.regionCode || undefined,
      lastAppVersion: appVersion,
      lastPlatform: Device.osName?.toLowerCase() || 'unknown'
    };
  }

  static async createOrUpdateUserProfile(googleUser: GoogleUser): Promise<boolean> {
    try {
      console.log("🔄 Creating/updating user profile...");
      const localizationData = this.getDeviceLocalizationData();
      
      const profileData: UserProfile = {
        userId: `google_${googleUser.id}`,
        email: googleUser.email,
        name: googleUser.name,
        profilePictureUrl: googleUser.photo,
        timezone: localizationData.timezone || 'UTC',
        locale: localizationData.locale || 'en-US',
        country: localizationData.country,
        region: localizationData.region,
        lastAppVersion: localizationData.lastAppVersion || '1.0.0',
        lastPlatform: localizationData.lastPlatform || 'unknown'
      };

      // Send to your API
      console.log("📤 Sending profile to API:", this.API_GATEWAY_URL);
      const authToken = await AsyncStorage.getItem(this.AUTH_TOKEN_KEY);
      const response = await fetch(`${this.API_GATEWAY_URL}/user/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(profileData),
      });

      if (response.ok) {
        console.log('✅ User profile updated successfully');
        return true;
      } else {
        console.error('❌ Failed to update user profile:', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ Error updating user profile:', error);
      return false;
    }
  }

  static async refreshUserProfileIfNeeded(): Promise<void> {
    try {
      const currentUser = await this.getCurrentUser();
      if (currentUser) {
        // Check if we need to refresh (e.g., once per day)
        const lastRefresh = await AsyncStorage.getItem('profile_last_refresh');
        const now = new Date().getTime();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);

        if (!lastRefresh || parseInt(lastRefresh) < oneDayAgo) {
          await this.createOrUpdateUserProfile(currentUser);
          await AsyncStorage.setItem('profile_last_refresh', now.toString());
        }
      }
    } catch (error) {
      console.error('Error refreshing user profile:', error);
    }
  }

  /**
   * Sync user profile to database every time the app opens
   * This ensures the most up-to-date user information is always in the database
   */
  static async syncUserProfileOnAppOpen(retryCount = 0): Promise<boolean> {
    const maxRetries = 2;
    
    try {
      console.log(`🔄 Syncing user profile on app open... (attempt ${retryCount + 1}/${maxRetries + 1})`);
      const currentUser = await this.getCurrentUser();
      
      if (!currentUser) {
        console.log('⚠️ No current user found, skipping profile sync');
        return false;
      }

      // Get the most current localization data -> Locally pulls this information from the user's device
      const localizationData = this.getDeviceLocalizationData();
      
      const profileData: UserProfile = {
        userId: `google_${currentUser.id}`,
        email: currentUser.email,
        name: currentUser.name,
        profilePictureUrl: currentUser.photo,
        timezone: localizationData.timezone || 'UTC',
        locale: localizationData.locale || 'en-US',
        country: localizationData.country,
        region: localizationData.region,
        lastAppVersion: localizationData.lastAppVersion || '1.0.0',
        lastPlatform: localizationData.lastPlatform || 'unknown'
      };

      console.log('📤 Sending user profile data:', {
        userId: profileData.userId,
        email: profileData.email,
        timezone: profileData.timezone,
        locale: profileData.locale,
        country: profileData.country,
        lastAppVersion: profileData.lastAppVersion,
        lastPlatform: profileData.lastPlatform
      });

      // Send to your API
      const authToken = await AsyncStorage.getItem(this.AUTH_TOKEN_KEY);
      const response = await fetch(`${this.API_GATEWAY_URL}/user/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(profileData),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ User profile synced successfully on app open:', result);
        
        // Update the last sync timestamp
        await AsyncStorage.setItem('profile_last_sync_app_open', new Date().getTime().toString());
        
        // Store sync success metrics
        await AsyncStorage.setItem('profile_sync_last_success', new Date().toISOString());
        await AsyncStorage.removeItem('profile_sync_last_error'); // Clear any previous error
        
        return true;
      } else {
        const errorText = await response.text();
        const errorMessage = `HTTP ${response.status}: ${errorText}`;
        console.error('❌ Failed to sync user profile on app open:', errorMessage);
        
        // Store error information
        await AsyncStorage.setItem('profile_sync_last_error', JSON.stringify({
          timestamp: new Date().toISOString(),
          error: errorMessage,
          attempt: retryCount + 1
        }));
        
        // Retry on server errors (5xx) but not client errors (4xx)
        if (response.status >= 500 && retryCount < maxRetries) {
          console.log(`🔄 Retrying user profile sync due to server error... (${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
          return this.syncUserProfileOnAppOpen(retryCount + 1);
        }
        
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error syncing user profile on app open:', errorMessage);
      
      // Store error information
      await AsyncStorage.setItem('profile_sync_last_error', JSON.stringify({
        timestamp: new Date().toISOString(),
        error: errorMessage,
        attempt: retryCount + 1
      }));
      
      // Retry on network errors
      if (retryCount < maxRetries && (errorMessage.includes('network') || errorMessage.includes('timeout'))) {
        console.log(`🔄 Retrying user profile sync due to network error... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
        return this.syncUserProfileOnAppOpen(retryCount + 1);
      }
      
      return false;
    }
  }

  /**
   * Get the last sync status and error information
   */
  static async getProfileSyncStatus(): Promise<{
    lastSuccess?: string;
    lastError?: { timestamp: string; error: string; attempt: number };
  }> {
    try {
      const lastSuccess = await AsyncStorage.getItem('profile_sync_last_success');
      const lastErrorStr = await AsyncStorage.getItem('profile_sync_last_error');
      const lastError = lastErrorStr ? JSON.parse(lastErrorStr) : undefined;
      
      return {
        lastSuccess: lastSuccess || undefined,
        lastError
      };
    } catch (error) {
      console.error('Error getting profile sync status:', error);
      return {};
    }
  }

  static async getAuthHeaders(): Promise<Record<string, string>> {
    const authToken = await AsyncStorage.getItem(this.AUTH_TOKEN_KEY);
    return {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    };
  }
}
