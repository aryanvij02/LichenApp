//This is important as it holds Authentication Context across the entire application
//Anything that needs to hold Context across different components should be here

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { UserProfileService, GoogleUser } from "../services/UserProfileService";
import { configureGoogleSignIn } from "../config/auth";
import { SettingsService } from "../services/SettingsService";

interface AuthContextType {
  user: GoogleUser | null;
  isSignedIn: boolean;
  isLoading: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

//Creates the React Context Hook
const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

//Main Component that wraps the entire application
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      console.log("🚀 AuthProvider: Initializing auth...");
      // Configure Google Sign-In first
      configureGoogleSignIn();

      // Small delay to ensure configuration is complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Then check auth state
      checkAuthState();
    } catch (error) {
      console.error("Error in initializeAuth:", error);
      setIsLoading(false);
    }
  };

  const checkAuthState = async () => {
    setIsLoading(true);
    try {
      console.log("🔍 AuthProvider: Checking auth state...");
      const signedIn = await UserProfileService.isSignedIn();
      setIsSignedIn(signedIn);

      if (signedIn) {
        const currentUser = await UserProfileService.getCurrentUser();

        if (currentUser) {
          console.log("✅ AuthProvider: User found:", currentUser.name);
          setUser(currentUser);
          //IMPT
          // Sync profile on app open to ensure latest data
          const syncSuccess =
            await UserProfileService.syncUserProfileOnAppOpen();
          console.log(
            syncSuccess
              ? "✅ AuthProvider: Profile synced on app open"
              : "⚠️ AuthProvider: Profile sync on app open failed"
          );
        } else {
          // Google says signed in but no local user data - sign out to reset state
          console.log(
            "AuthProvider: Google signed in but no local user data, signing out to reset state"
          );
          await UserProfileService.signOut();
          setIsSignedIn(false);
          setUser(null);
        }
      } else {
        console.log("❌ AuthProvider: User not signed in");
        // Ensure local state is cleared if not signed in
        setUser(null);
      }
    } catch (error) {
      console.error("AuthProvider: Error checking auth state:", error);
      // On error, assume not signed in to be safe
      setIsSignedIn(false);
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log("🎯 AuthProvider: Final state:", {
        isSignedIn,
        user: user?.name,
        isLoading: false,
      });
    }
  };

  const signIn = async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      console.log("🔐 AuthProvider: Starting Google Sign-In...");

      const googleUser = await UserProfileService.signInWithGoogle();
      if (googleUser) {
        console.log("🔄 AuthProvider: Setting user state...");
        setUser(googleUser);
        setIsSignedIn(true);
        console.log("✅ AuthProvider: User state set");

        // Create/update user profile
        const success = await UserProfileService.createOrUpdateUserProfile(
          googleUser
        );
        console.log(
          success
            ? "✅ AuthProvider: User profile synced"
            : "⚠️ AuthProvider: Profile sync failed"
        );

        console.log("🎯 AuthProvider: Sign-in final state:", {
          user: googleUser.name,
          isSignedIn: true,
          authLoading: false,
        });
        return true;
      } else {
        // Sign in failed, ensure state is clean
        setUser(null);
        setIsSignedIn(false);
        return false;
      }
    } catch (error) {
      console.error("AuthProvider: Sign in error:", error);
      // On error, ensure state is clean
      setUser(null);
      setIsSignedIn(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    try {
      console.log("🚪 AuthProvider: Signing out...");
      await UserProfileService.signOut();

      // Clear HealthKit settings when user signs out
      await SettingsService.clearSettings();
      console.log("🗑️ AuthProvider: Cleared HealthKit settings");

      setUser(null);
      setIsSignedIn(false);
      console.log("✅ AuthProvider: Signed out successfully");
    } catch (error) {
      console.error("AuthProvider: Sign out error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    isSignedIn,
    isLoading,
    signIn,
    signOut,
    refreshAuth: checkAuthState,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
