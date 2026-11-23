import { Platform } from 'react-native';

// Public invite page, served from website/ on Vercel; switching hosts
// later means changing this one line.
export const INVITE_PAGE_URL = 'https://ophixe.vercel.app/join.html';

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.ophixe.app';

export const APP_SCHEME = 'ophixe';

export function inviteLink(code: string): string {
  return `${INVITE_PAGE_URL}?code=${encodeURIComponent(code.trim())}`;
}

export function appInviteUrl(code: string): string {
  return `${APP_SCHEME}://join?code=${encodeURIComponent(code.trim())}`;
}

/** Extracts the invite code from an app deep link, if it is one. */
export function parseInviteUrl(url: string): string | null {
  const schemePrefix = `${APP_SCHEME}://join`;
  if (!url.startsWith(schemePrefix)) return null;
  const query = url.slice(schemePrefix.length);
  const match = query.match(/[?&]code=([^&]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function isSupportedInvitePlatform(): boolean {
  return Platform.OS !== 'web';
}

/**
 * Extracts the invite code from a scanned QR payload: the full invite
 * link, the app deep link, or a bare code.
 */
export function parseScannedInvite(payload: string): string | null {
  const text = payload.trim();
  if (!text) return null;
  const deep = parseInviteUrl(text);
  if (deep) return deep;
  const httpMatch = text.match(/[?&]code=([^&]+)/);
  if (httpMatch) {
    try {
      return decodeURIComponent(httpMatch[1]);
    } catch {
      return null;
    }
  }
  if (/^[A-Za-z0-9]{4,64}$/.test(text)) return text;
  return null;
}
