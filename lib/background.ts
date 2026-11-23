import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

/**
 * Background delivery runs on push (no always-on process to drain the
 * battery), but some Android phones (Xiaomi, Oppo, Vivo, OnePlus…)
 * restrict background work per app, which delays or drops calls and
 * messages. This opens the system battery screen where Ophixe can be
 * set to Unrestricted — a public settings page, no special permission.
 */
export async function openBackgroundSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    );
    return true;
  } catch {
    return false;
  }
}
