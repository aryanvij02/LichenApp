# Google Calendar API Integration - Setup & Troubleshooting

## Overview

This guide will help you set up Google Calendar API integration for your React Native app and troubleshoot common issues.

## Prerequisites

- Google Cloud Console project
- Google Calendar API enabled
- OAuth 2.0 credentials configured

## Step-by-Step Setup

### 1. Google Cloud Console Configuration

#### Enable the Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services > Library**
4. Search for "Google Calendar API"
5. Click on it and press **Enable**

#### Configure OAuth 2.0 Credentials

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth 2.0 Client IDs**
3. Configure the OAuth consent screen if prompted:
   - Application type: External (for testing)
   - App name: Your app name
   - User support email: Your email
   - Authorized domains: Add your domain if applicable
   - Scopes: Add the calendar scopes manually if not auto-detected

#### Create OAuth 2.0 Client IDs

You need to create separate client IDs for different platforms:

**For Web Application (required for React Native):**

1. Application type: Web application
2. Name: "YourApp Web Client"
3. Authorized redirect URIs: Leave empty for now
4. Copy the **Client ID** - this is your `webClientId`

**For iOS (if targeting iOS):**

1. Application type: iOS
2. Name: "YourApp iOS Client"
3. Bundle ID: Your iOS app bundle identifier (e.g., com.yourcompany.yourapp)
4. Copy the **Client ID** - this is your `iosClientId`

**For Android (if targeting Android):**

1. Application type: Android
2. Name: "YourApp Android Client"
3. Package name: Your Android package name
4. SHA-1 certificate fingerprint: Get this from your keystore

### 2. Required Scopes

Make sure these scopes are added to your OAuth consent screen:

```
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar
```

### 3. App Configuration

Update your `config/auth.ts` with the correct client IDs:

```typescript
export const configureGoogleSignIn = () => {
  GoogleSignin.configure({
    webClientId: "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com",
    iosClientId: "YOUR_IOS_CLIENT_ID.apps.googleusercontent.com",
    offlineAccess: true,
    forceCodeForRefreshToken: true,
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar",
    ],
  });
};
```

## Common Issues & Solutions

### Issue 1: "Error 400: invalid_client"

**Cause:** Incorrect client ID or client ID not properly configured
**Solutions:**

- Double-check your `webClientId` in the auth configuration
- Ensure the client ID is from a "Web application" type credential
- Verify the client ID doesn't have extra spaces or characters

### Issue 2: "Error 403: access_denied"

**Cause:** User hasn't granted calendar permissions or scopes not configured
**Solutions:**

- Ensure calendar scopes are added to your OAuth consent screen
- Check that the user has approved calendar access during sign-in
- Try signing out and signing in again to refresh permissions

### Issue 3: "Network request failed" or API calls failing

**Cause:** API not enabled or authentication issues
**Solutions:**

- Verify Google Calendar API is enabled in Google Cloud Console
- Check that the access token is valid and not expired
- Ensure the user is properly signed in with Google

### Issue 4: "Error 401: unauthorized"

**Cause:** Token expired or invalid authentication
**Solutions:**

- The app will automatically handle token refresh if `offlineAccess: true`
- Try signing out and back in to get fresh tokens
- Check that `forceCodeForRefreshToken: true` is set

### Issue 5: Calendar events not showing

**Cause:** Various potential issues
**Solutions:**

- Check the calendar has events in the selected date range
- Verify the user has access to the calendar being queried
- Check the console for API error messages
- Ensure the date format is correct (YYYY-MM-DD)

### Issue 6: "Access blocked: App not completed verification process"

**Cause:** OAuth consent screen not verified by Google and user not added as test user
**Solutions:**

#### For Development (Recommended):

1. Go to **Google Cloud Console > APIs & Services > OAuth consent screen**
2. Scroll to **Test users** section
3. Click **ADD USERS**
4. Add your email address as a test user
5. Save changes
6. Try signing in again

#### Alternative Development Options:

- Change User Type to **Internal** (requires Google Workspace)
- Click "Advanced" → "Go to [App Name] (unsafe)" on the warning screen
- For production: Submit app for verification through Google's review process

## Testing the Integration

1. **Check Authentication:**

   ```typescript
   const hasAccess = await googleCalendarService.hasCalendarPermissions();
   console.log("Has calendar access:", hasAccess);
   ```

2. **Test API Calls:**

   ```typescript
   const events = await googleCalendarService.getEventsForDate("2024-01-15");
   console.log("Events:", events);
   ```

3. **Debug Token Issues:**

   ```typescript
   import { GoogleSignin } from "@react-native-google-signin/google-signin";

   const tokens = await GoogleSignin.getTokens();
   console.log("Access Token:", tokens.accessToken);
   ```

## API Quotas & Limits

- **Requests per day:** 1,000,000 (default)
- **Requests per 100 seconds:** 10,000
- **Requests per 100 seconds per user:** 250

If you hit these limits, implement caching and pagination.

## Security Best Practices

1. **Store credentials securely** - never commit client secrets to code
2. **Use minimum required scopes** - only request calendar.readonly if you don't need write access
3. **Implement proper error handling** - don't expose API errors to users
4. **Cache responses** - reduce API calls when possible
5. **Validate user permissions** - check access before making API calls

## Need Help?

- Check the [Google Calendar API documentation](https://developers.google.com/calendar/api)
- Review the [Google Sign-In for React Native docs](https://github.com/react-native-google-signin/google-signin)
- Enable debug logging in your Google Cloud Console to see detailed API logs
