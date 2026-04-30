export const DEFAULT_CALLBACK_URL = 'https://tcetcercd.in';

export const isValidCallbackUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'tcetcercd.in' || hostname.endsWith('.tcetcercd.in');
  } catch {
    return false;
  }
};
