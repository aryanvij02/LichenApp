import { GoogleSignin } from '@react-native-google-signin/google-signin';

//Auth configuration for Google Sign In is defined here. 
export const configureGoogleSignIn = () => {
  GoogleSignin.configure({
    //TODO: Move these to .env
    webClientId: '337554859297-2l2dqiuo8m09lo5f79j9orndb55d0n5o.apps.googleusercontent.com',
    iosClientId: '337554859297-vrbujkq27dk62t1vtu7aqnkt7cv7k0cv.apps.googleusercontent.com', // Optional - can use Info.plist value
    offlineAccess: true, // Enable to get refresh tokens
    hostedDomain: '', // Optional - restrict to specific domain
    forceCodeForRefreshToken: true, // Force refresh token for offline access
    //These are where we define the scopes we want to access.
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly', // Read calendar events
      'https://www.googleapis.com/auth/calendar.events', // Read/write calendar events
      'https://www.googleapis.com/auth/calendar', // Full calendar access (optional - use if needed)
    ],
  });
};
