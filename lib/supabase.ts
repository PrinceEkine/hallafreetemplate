import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { secureAuthStorage } from './secureStorage';

WebBrowser.maybeCompleteAuthSession();

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key';

export const isSupabaseConfigured = () =>
  !supabaseUrl.includes('placeholder') &&
  !supabaseAnonKey.includes('placeholder');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Native keeps the session in the OS keychain; web has no secure
    // enclave, so it keeps AsyncStorage.
    storage: Platform.OS === 'web' ? AsyncStorage : secureAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/** Normalize a Nigerian mobile number to E.164 (+234...). Throws on invalid input. */
export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '');
  let digits: string;
  if (cleaned.startsWith('+')) {
    if (!cleaned.startsWith('+234')) {
      throw new Error('Only Nigerian numbers (+234) are supported for now.');
    }
    digits = cleaned.slice(1);
  } else if (cleaned.startsWith('234')) {
    digits = cleaned;
  } else if (cleaned.startsWith('0')) {
    digits = '234' + cleaned.slice(1);
  } else {
    throw new Error('Enter a valid phone number.');
  }
  if (digits.length !== 13) {
    throw new Error('Enter a valid phone number.');
  }
  return '+' + digits;
}

export async function sendOtp(phone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyOtp(phone: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'ophixe' });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectUri, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('Google sign-in was cancelled.');
  }
  if (result.type !== 'success') {
    throw new Error('Google sign-in failed.');
  }
  const url = new URL(result.url);
  const params = new URLSearchParams(
    url.hash ? url.hash.substring(1) : url.search,
  );
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken) throw new Error('Google sign-in did not return a session.');
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken ?? '',
  });
  if (sessionError) throw sessionError;
}

export function emailRedirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: 'ophixe', path: 'confirm-email' });
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: name.trim() },
      emailRedirectTo: emailRedirectUri(),
    },
  });
  if (error) throw error;
  return !!data.session;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
}

export async function resendSignupEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: emailRedirectUri() },
  });
  if (error) throw error;
}

export async function verifyEmailOtp(
  email: string,
  token: string,
  type: 'signup' | 'recovery',
): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type,
  });
  if (error) throw error;
}

export async function getMyPhone(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profile_contacts')
    .select('phone')
    .eq('user_id', user.id)
    .single();
  if (error) {
    // No row yet means no phone; anything else is a real failure the
    // caller must not mistake for "no phone".
    if ((error as { code?: string }).code === 'PGRST116') return null;
    throw error;
  }
  return (data?.phone as string | null) ?? null;
}

export async function saveMyPhone(phone: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase
    .from('profile_contacts')
    .upsert({ user_id: user.id, phone }, { onConflict: 'user_id' });
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('That number is already in use.');
    }
    throw error;
  }
}

/**
 * Keep our shareable contact row fresh: member profiles show the stored
 * email to fellow community members, so every sign-in re-syncs it from
 * the session. Best-effort and stale-safe (backends predating the email
 * column simply keep whatever they have).
 */
export async function syncMyContactEmail(): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email?.trim();
    if (!user || !email) return;
    await supabase
      .from('profile_contacts')
      .upsert({ user_id: user.id, email }, { onConflict: 'user_id' });
  } catch {
    // The migration backfill and signup trigger cover the rest.
  }
}

export async function isAppleAuthAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Native Sign in with Apple → Supabase session (iOS only). */
export async function signInWithApple(): Promise<void> {
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
      throw new Error('Apple sign-in was cancelled.');
    }
    throw err;
  }
  if (!credential.identityToken) {
    throw new Error('Apple sign-in did not return a session.');
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) {
    if (/provider|not enabled|unsupported/i.test(error.message)) {
      throw new Error(
        'Apple sign-in is not set up yet. Ask your admin to enable it.',
      );
    }
    throw error;
  }
  // Apple shares the name only on the first sign-in: keep it.
  const given = credential.fullName?.givenName ?? '';
  const family = credential.fullName?.familyName ?? '';
  const fullName = `${given} ${family}`.trim();
  if (fullName) await saveProfileName(fullName).catch(() => {});
}

export async function saveProfileName(fullName: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: { full_name: fullName },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Readable message from anything a Supabase call can throw. Postgrest
 * errors are plain objects (not Error instances), so `err.message` alone
 * swallows the real cause and the user sees only a generic fallback.
 */
export function dbMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  const message = (err as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message) return message;
  const details = (err as { details?: unknown } | null)?.details;
  if (typeof details === 'string' && details) return details;
  const hint = (err as { hint?: unknown } | null)?.hint;
  if (typeof hint === 'string' && hint) return `${fallback} ${hint}`;
  return fallback;
}

/** True when the database refused the write under row-level security. */
export function isRlsError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code === '42501') return true;
  return /row-level security|violates row-level|not allowed|permission denied/i.test(
    dbMessage(err, ''),
  );
}
