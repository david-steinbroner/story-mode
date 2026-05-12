import posthog from 'posthog-js';

export function initPostHog() {
  // Only initialize if API key is provided
  if (!import.meta.env.VITE_POSTHOG_KEY) {
    console.log("PostHog API key not configured, skipping initialization");
    return;
  }

  try {
    posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',

      // Disable capturing in development
      opt_out_capturing_by_default: import.meta.env.MODE === 'development',

      // Capture pageviews automatically
      capture_pageview: true,

      // Capture performance metrics
      capture_pageleave: true,

      // Session recording
      session_recording: {
        maskAllInputs: false,
        maskInputOptions: {
          password: true,
        },
      },
    });
  } catch (error) {
    console.error("Failed to initialize PostHog:", error);
  }
}

// Track custom events
export function trackEvent(eventName: string, properties?: Record<string, any>) {
  posthog.capture(eventName, properties);
}

// Identify users
export function identifyUser(userId: string, properties?: Record<string, any>) {
  posthog.identify(userId, properties);
}

// Track page views manually (if needed)
export function trackPageView(pageName: string) {
  posthog.capture('$pageview', { page: pageName });
}

// Analytics helpers. Each method is the canonical place a given event is
// fired so we don't end up with three names for the same thing.
export const analytics = {
  trackEvent: (eventName: string, properties?: Record<string, any>) => {
    trackEvent(eventName, properties);
  },

  screenViewed: (screenName: string, properties?: Record<string, any>) => {
    trackEvent('screen_viewed', { screen_name: screenName, ...properties });
    posthog.capture('$pageview', { $current_url: screenName });
  },

  messageSent: (messageType: 'chat' | 'action') => {
    trackEvent('message_sent', { type: messageType });
  },

  buttonClicked: (buttonName: string, location: string, properties?: Record<string, any>) => {
    trackEvent('button_clicked', {
      button_name: buttonName,
      location,
      ...properties,
    });
  },

  sessionStarted: () => {
    trackEvent('session_started');
  },

  sessionEnded: (duration: number) => {
    trackEvent('session_ended', { duration_seconds: duration });
  },

  errorOccurred: (errorType: string, errorMessage: string, context?: Record<string, any>) => {
    console.error('[Analytics] Error occurred:', { errorType, errorMessage, context });
    trackEvent('error_occurred', {
      error_type: errorType,
      error_message: errorMessage,
      ...context,
    });
  },

  aiResponseReceived: (responseTime: number, success: boolean, error?: string) => {
    trackEvent('ai_response_received', {
      response_time_ms: responseTime,
      success,
      error_message: error,
    });
  },

  aiResponseFailed: (error: string, duration: number) => {
    console.error('[Analytics] AI response failed:', { error, duration });
    trackEvent('ai_response_failed', {
      error_message: error,
      duration_ms: duration,
    });
  },
};

export default posthog;
