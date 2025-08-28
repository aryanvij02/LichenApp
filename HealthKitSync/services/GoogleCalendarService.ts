import { GoogleSignin } from '@react-native-google-signin/google-signin';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
}

export interface CalendarListItem {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: string;
  backgroundColor?: string;
  foregroundColor?: string;
}

class GoogleCalendarService {
  private baseUrl = 'https://www.googleapis.com/calendar/v3';

  /**
   * Get the user's access token for making API calls
   */
  private async getAccessToken(): Promise<string> {
    try {
      const tokens = await GoogleSignin.getTokens();
      return tokens.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw new Error('Failed to get access token. User may not be signed in.');
    }
  }

  /**
   * Make authenticated API call to Google Calendar
   */
  private async makeApiCall(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: any): Promise<any> {
    try {
      const accessToken = await this.getAccessToken();
      const url = `${this.baseUrl}${endpoint}`;
      
      const headers: HeadersInit = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };

      const config: RequestInit = {
        method,
        headers,
      };

      if (body && method !== 'GET') {
        config.body = JSON.stringify(body);
      }

      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Calendar API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Calendar API call failed:', error);
      throw error;
    }
  }

  /**
   * Get list of user's calendars
   */
  async getCalendarList(): Promise<CalendarListItem[]> {
    try {
      const response = await this.makeApiCall('/users/me/calendarList');
      return response.items || [];
    } catch (error) {
      console.error('Error fetching calendar list:', error);
      throw error;
    }
  }

  /**
   * Get events from a specific calendar within a date range
   */
  async getEvents(
    calendarId: string = 'primary',
    timeMin?: string,
    timeMax?: string,
    maxResults: number = 250
  ): Promise<CalendarEvent[]> {
    try {
      const params = new URLSearchParams({
        maxResults: maxResults.toString(),
        singleEvents: 'true',
        orderBy: 'startTime',
      });

      if (timeMin) {
        params.append('timeMin', timeMin);
      }
      if (timeMax) {
        params.append('timeMax', timeMax);
      }

      const endpoint = `/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
      const response = await this.makeApiCall(endpoint);
      
      return response.items || [];
    } catch (error) {
      console.error('Error fetching events:', error);
      throw error;
    }
  }

  /**
   * Get events for a specific date
   */
  async getEventsForDate(date: string, calendarId: string = 'primary'): Promise<CalendarEvent[]> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const timeMin = startOfDay.toISOString();
      const timeMax = endOfDay.toISOString();

      return await this.getEvents(calendarId, timeMin, timeMax);
    } catch (error) {
      console.error('Error fetching events for date:', error);
      throw error;
    }
  }

  /**
   * Get events for a date range (useful for month view)
   */
  async getEventsForDateRange(startDate: string, endDate: string, calendarId: string = 'primary'): Promise<CalendarEvent[]> {
    try {
      const timeMin = new Date(startDate).toISOString();
      const timeMax = new Date(endDate).toISOString();

      return await this.getEvents(calendarId, timeMin, timeMax);
    } catch (error) {
      console.error('Error fetching events for date range:', error);
      throw error;
    }
  }

  /**
   * Create a new event
   */
  async createEvent(event: Partial<CalendarEvent>, calendarId: string = 'primary'): Promise<CalendarEvent> {
    try {
      const endpoint = `/calendars/${encodeURIComponent(calendarId)}/events`;
      return await this.makeApiCall(endpoint, 'POST', event);
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  /**
   * Update an existing event
   */
  async updateEvent(eventId: string, event: Partial<CalendarEvent>, calendarId: string = 'primary'): Promise<CalendarEvent> {
    try {
      const endpoint = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
      return await this.makeApiCall(endpoint, 'PUT', event);
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventId: string, calendarId: string = 'primary'): Promise<void> {
    try {
      const endpoint = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
      await this.makeApiCall(endpoint, 'DELETE');
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }

  /**
   * Check if user has granted calendar permissions
   */
  async hasCalendarPermissions(): Promise<boolean> {
    try {
      await this.getAccessToken();
      // Try to make a simple API call to test permissions
      await this.makeApiCall('/users/me/calendarList');
      return true;
    } catch (error) {
      console.error('Calendar permissions check failed:', error);
      return false;
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();
