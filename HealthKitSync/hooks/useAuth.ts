import { useState, useEffect } from 'react';
import { UserProfileService, GoogleUser } from '../services/UserProfileService';
import { configureGoogleSignIn } from '../config/auth';

export const useAuth = () => {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    // Configure Google Sign-In first
    configureGoogleSignIn();
    
    // Small delay to ensure configuration is complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Then check auth state
    checkAuthState();
  };

  const checkAuthState = async () => {
    setIsLoading(true);
    try {
      const signedIn = await UserProfileService.isSignedIn();
      setIsSignedIn(signedIn);
      
      if (signedIn) {
        const currentUser = await UserProfileService.getCurrentUser();
        
        if (currentUser) {
          setUser(currentUser);
          // Refresh profile if needed
          await UserProfileService.refreshUserProfileIfNeeded();
        } else {
          // Google says signed in but no local user data - sign out to reset state
          console.log('Google signed in but no local user data, signing out to reset state');
          await UserProfileService.signOut();
          setIsSignedIn(false);
          setUser(null);
        }
      } else {
        // Ensure local state is cleared if not signed in
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
      // On error, assume not signed in to be safe
      setIsSignedIn(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const googleUser = await UserProfileService.signInWithGoogle();
      if (googleUser) {
        setUser(googleUser);
        setIsSignedIn(true);
        
        // Create/update user profile
        const success = await UserProfileService.createOrUpdateUserProfile(googleUser);
        console.log(success ? '✅ User profile synced' : '⚠️ Profile sync failed');
        
        return true;
      } else {
        // Sign in failed, ensure state is clean
        setUser(null);
        setIsSignedIn(false);
        return false;
      }
    } catch (error) {
      console.error('Sign in error:', error);
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
      await UserProfileService.signOut();
      setUser(null);
      setIsSignedIn(false);
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    user,
    isSignedIn,
    isLoading,
    signIn,
    signOut,
    refreshAuth: checkAuthState
  };
};
