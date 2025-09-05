import AsyncStorage from '@react-native-async-storage/async-storage';


//TODO: Each data type can have a different preference on the data source
//This will allow users to know where their data is actually coming from. 
export interface DataSourcePreferences {
  steps: string | null; // Selected source for steps
  heartRate: string | null; // Selected source for heart rate
  // Add more metrics as needed
}

export interface HealthKitSettings {
  permissions: string[];
  hasPermissions: boolean;
  isSyncActive: boolean;
  lastPermissionCheck: string;
  syncEnabled: boolean; // User preference for sync
  dataSourcePreferences: DataSourcePreferences;
}

export class SettingsService {
  private static readonly SETTINGS_KEY = 'healthkit_settings';
  private static readonly PERMISSIONS_KEY = 'healthkit_permissions';
  private static readonly SYNC_STATUS_KEY = 'healthkit_sync_status';

  /**
   * Get current HealthKit settings from storage
   */
  static async getSettings(): Promise<HealthKitSettings> {
    try {
      const settingsJson = await AsyncStorage.getItem(this.SETTINGS_KEY);
      if (settingsJson) {
        const settings = JSON.parse(settingsJson) as any; // Use any to handle old formats
        
        // Migration: Add dataSourcePreferences if missing (for existing users)
        if (!settings.dataSourcePreferences) {
          console.log('🔄 Migrating settings: Adding dataSourcePreferences');
          settings.dataSourcePreferences = {
            steps: null, // No preference selected initially
            heartRate: null, // No preference selected initially
          };
          
          // Save the migrated settings
          await this.saveSettings(settings as HealthKitSettings);
        }
        
        console.log('📱 Loaded settings from storage:', settings);
        return settings as HealthKitSettings;
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }

    // Return default settings if none exist
    const defaultSettings: HealthKitSettings = {
      permissions: [],
      hasPermissions: false,
      isSyncActive: false,
      lastPermissionCheck: '',
      syncEnabled: false,
      dataSourcePreferences: {
        steps: null, // No preference selected initially
        heartRate: null, // No preference selected initially
      },
    };
    
    console.log('📱 Using default settings:', defaultSettings);
    return defaultSettings;
  }

  /**
   * Save HealthKit settings to storage
   */
  static async saveSettings(settings: HealthKitSettings): Promise<void> {
    try {
      const settingsJson = JSON.stringify(settings);
      await AsyncStorage.setItem(this.SETTINGS_KEY, settingsJson);
      console.log('💾 Saved settings to storage:', settings);
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  }

  /**
   * Update permissions and save to storage
   */
  static async updatePermissions(permissions: string[]): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings: HealthKitSettings = {
        ...currentSettings,
        permissions,
        hasPermissions: permissions.length > 0,
        lastPermissionCheck: new Date().toISOString(),
      };
      
      await this.saveSettings(updatedSettings);
      console.log('✅ Updated permissions:', permissions);
    } catch (error) {
      console.error('Error updating permissions:', error);
      throw error;
    }
  }

  /**
   * Update sync status and save to storage
   */
  static async updateSyncStatus(isSyncActive: boolean, syncEnabled?: boolean): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings: HealthKitSettings = {
        ...currentSettings,
        isSyncActive,
        syncEnabled: syncEnabled !== undefined ? syncEnabled : currentSettings.syncEnabled,
      };
      
      await this.saveSettings(updatedSettings);
      console.log('✅ Updated sync status:', { isSyncActive, syncEnabled: updatedSettings.syncEnabled });
    } catch (error) {
      console.error('Error updating sync status:', error);
      throw error;
    }
  }

  /**
   * Enable/disable sync preference (user choice)
   */
  static async setSyncEnabled(enabled: boolean): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings: HealthKitSettings = {
        ...currentSettings,
        syncEnabled: enabled,
        // If user disables sync, also set isSyncActive to false
        isSyncActive: enabled ? currentSettings.isSyncActive : false,
      };
      
      await this.saveSettings(updatedSettings);
      console.log('✅ Updated sync preference:', enabled);
    } catch (error) {
      console.error('Error updating sync preference:', error);
      throw error;
    }
  }

  /**
   * Clear all settings (useful for logout or reset)
   */
  static async clearSettings(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.SETTINGS_KEY);
      console.log('🗑️ Cleared all HealthKit settings');
    } catch (error) {
      console.error('Error clearing settings:', error);
      throw error;
    }
  }

  /**
   * Get just the sync preference without loading all settings
   */
  static async isSyncEnabled(): Promise<boolean> {
    try {
      const settings = await this.getSettings();
      return settings.syncEnabled;
    } catch (error) {
      console.error('Error checking sync preference:', error);
      return false;
    }
  }

  /**
   * Check if permissions need to be re-verified (e.g., after iOS updates)
   */
  static async shouldCheckPermissions(): Promise<boolean> {
    try {
      const settings = await this.getSettings();
      if (!settings.lastPermissionCheck) {
        return true;
      }

      // Check permissions if it's been more than 7 days
      const lastCheck = new Date(settings.lastPermissionCheck);
      const daysSinceCheck = (Date.now() - lastCheck.getTime()) / (1000 * 60 * 60 * 24);
      
      return daysSinceCheck > 7;
    } catch (error) {
      console.error('Error checking permission age:', error);
      return true; // Default to checking permissions on error
    }
  }

  /**
   * Get data source preference for a specific metric
   */
  static async getDataSourcePreference(metric: keyof DataSourcePreferences): Promise<string | null> {
    try {
      const settings = await this.getSettings();
      return settings.dataSourcePreferences[metric];
    } catch (error) {
      console.error(`Error getting data source preference for ${metric}:`, error);
      return null;
    }
  }

  /**
   * Update data source preference for a specific metric
   */
  static async updateDataSourcePreference(
    metric: keyof DataSourcePreferences, 
    source: string | null
  ): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings: HealthKitSettings = {
        ...currentSettings,
        dataSourcePreferences: {
          ...currentSettings.dataSourcePreferences,
          [metric]: source,
        },
      };
      
      await this.saveSettings(updatedSettings);
      console.log(`✅ Updated ${metric} source preference:`, source);
    } catch (error) {
      console.error(`Error updating ${metric} source preference:`, error);
      throw error;
    }
  }

  /**
   * Get all data source preferences
   */
  static async getAllDataSourcePreferences(): Promise<DataSourcePreferences> {
    try {
      const settings = await this.getSettings();
      return settings.dataSourcePreferences;
    } catch (error) {
      console.error('Error getting all data source preferences:', error);
      return {
        steps: null,
        heartRate: null,
      };
    }
  }

  /**
   * Set default preference for a metric if no preference exists
   */
  static async setDefaultPreference(
    metric: keyof DataSourcePreferences,
    defaultSource: string
  ): Promise<void> {
    try {
      const currentPreference = await this.getDataSourcePreference(metric);
      
      // Only set default if no preference exists yet
      if (currentPreference === null) {
        console.log(`📝 Setting default ${metric} preference:`, defaultSource);
        await this.updateDataSourcePreference(metric, defaultSource);
      }
    } catch (error) {
      console.error(`Error setting default ${metric} preference:`, error);
    }
  }
}
