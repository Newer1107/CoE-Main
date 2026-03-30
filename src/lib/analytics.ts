import { sendGAEvent } from '@next/third-parties/google';

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>,
) {
  try {
    sendGAEvent('event', eventName, params ?? {});
  } catch {
    // never block UI for analytics
  }
}
