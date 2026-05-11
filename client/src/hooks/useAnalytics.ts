import { useEffect } from 'react';
import { analytics, identifyUser } from '@/lib/posthog';

/**
 * Hook to easily track analytics events in components
 */
export function useAnalytics() {
  return analytics;
}

/**
 * Hook to track page views when component mounts
 */
export function usePageView(pageName: string) {
  useEffect(() => {
    analytics.trackEvent('page_view', { page: pageName });
  }, [pageName]);
}

/**
 * Hook to track session duration
 */
export function useSessionTracking() {
  useEffect(() => {
    const sessionStart = Date.now();

    // Identify the PostHog actor with our anonymous session id so every event
    // for this browser correlates to a single user in funnels and cohorts.
    const sessionId = localStorage.getItem('sessionId');
    if (sessionId) {
      identifyUser(sessionId);
    }

    analytics.sessionStarted();

    return () => {
      const duration = Math.floor((Date.now() - sessionStart) / 1000);
      analytics.sessionEnded(duration);
    };
  }, []);
}

export default useAnalytics;
