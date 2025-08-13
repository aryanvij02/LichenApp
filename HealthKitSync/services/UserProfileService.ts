import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import * as Device from 'expo-device';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

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
  private static readonly API_BASE = 'https://wxa3064yx7.execute-api.us-west-2.amazonaws.com/dev';
  private static readonly USER_KEY = 'current_user';
  private static readonly AUTH_TOKEN_KEY = 'auth_token';

  static async signInWithGoogle(): Promise<GoogleUser | null> {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      
      const googleUser: GoogleUser = {
        id: userInfo.user.id,
        email: userInfo.user.email,
        name: userInfo.user.name || '',
        photo: userInfo.user.photo || undefined
      };

      // Store auth token
      if (userInfo.idToken) {
        await AsyncStorage.setItem(this.AUTH_TOKEN_KEY, userInfo.idToken);
      }

      // Store user locally
      await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(googleUser));

      return googleUser;
    } catch (error) {
      console.error('Google sign-in error:', error);
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
      // In v12+, use hasPreviousSignIn() instead of isSignedIn()
      return GoogleSignin.hasPreviousSignIn();
    } catch (error) {
      console.error('Error checking sign-in status:', error);
      return false;
    }
  }

  static getDeviceLocalizationData(): Partial<UserProfile> {
    const primaryLocale = Localization.getLocales()[0];
    return {
      timezone: Localization.getCalendars()[0]?.timeZone || 'UTC',
      locale: primaryLocale?.languageTag || 'en-US',
      country: primaryLocale?.regionCode || undefined,
      region: primaryLocale?.regionCode || undefined,
      lastAppVersion: '1.0.0', // Get from app config
      lastPlatform: Device.osName?.toLowerCase() || 'unknown'
    };
  }

  static async createOrUpdateUserProfile(googleUser: GoogleUser): Promise<boolean> {
    try {
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
      const authToken = await AsyncStorage.getItem(this.AUTH_TOKEN_KEY);
      const response = await fetch(`${this.API_BASE}/user/profile`, {
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

  static async getAuthHeaders(): Promise<Record<string, string>> {
    const authToken = await AsyncStorage.getItem(this.AUTH_TOKEN_KEY);
    return {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    };
  }
}
