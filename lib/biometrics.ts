import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CREDS_KEY = 'ophixe_biometric_login_v1';

export type BiometricStatus = {
  available: boolean;
  enrolled: boolean;
  stored: boolean;
  label: 'fingerprint' | 'face' | 'biometric';
};

/** Hardware + enrollment + stored credentials, all best-effort. */
export async function biometricStatus(): Promise<BiometricStatus> {
  const none: BiometricStatus = {
    available: false,
    enrolled: false,
    stored: false,
    label: 'biometric',
  };
  try {
    const [hardware, enrolled, types, stored] = await Promise.all([
      LocalAuthentication.hasHardwareAsync().catch(() => false),
      LocalAuthentication.isEnrolledAsync().catch(() => false),
      LocalAuthentication.supportedAuthenticationTypesAsync().catch(
        (): LocalAuthentication.AuthenticationType[] => [],
      ),
      SecureStore.getItemAsync(CREDS_KEY).catch(() => null),
    ]);
    const label =
      types.includes(
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      )
        ? 'fingerprint'
        : types.includes(
              LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
            )
          ? 'face'
          : 'biometric';
    return {
      available: !!hardware,
      enrolled: !!enrolled,
      stored: !!stored,
      label,
    };
  } catch {
    return none;
  }
}

export async function canOfferBiometricLogin(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const status = await biometricStatus();
  return status.available && status.enrolled;
}

export async function canUseBiometricLogin(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const status = await biometricStatus();
  return status.available && status.enrolled && status.stored;
}

/** Stores email credentials after a manual login, with the user's consent. */
export async function enableBiometricLogin(
  email: string,
  password: string,
): Promise<void> {
  await SecureStore.setItemAsync(
    CREDS_KEY,
    JSON.stringify({ email: email.trim(), password }),
  );
}

export async function disableBiometricLogin(): Promise<void> {
  await SecureStore.deleteItemAsync(CREDS_KEY).catch(() => {});
}

/**
 * Prompts for the device biometric and returns stored credentials, or
 * null when the user cancels, fails, or nothing is stored.
 */
export async function unlockWithBiometric(
  label: string,
): Promise<{ email: string; password: string } | null> {
  const stored = await SecureStore.getItemAsync(CREDS_KEY).catch(() => null);
  if (!stored) return null;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: `Log in with ${label}`,
    cancelLabel: 'Use password instead',
    disableDeviceFallback: false,
  });
  if (!result.success) return null;
  try {
    const parsed = JSON.parse(stored) as {
      email?: unknown;
      password?: unknown;
    };
    if (typeof parsed.email !== 'string' || typeof parsed.password !== 'string') {
      return null;
    }
    return { email: parsed.email, password: parsed.password };
  } catch {
    return null;
  }
}
