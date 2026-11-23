import { Camera } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { ensureMicPermission } from './voice';

/**
 * One home for runtime permission checks: every hardware- or data-gated
 * feature checks first and asks when missing, so the app explains instead
 * of crashing. Each helper resolves true when access is granted.
 */

export async function ensureCamera(): Promise<boolean> {
  try {
    const res = await Camera.requestCameraPermissionsAsync();
    return res.granted;
  } catch {
    return false;
  }
}

export async function ensureNotifications(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  } catch {
    return false;
  }
}

export async function ensureMediaLibrary(): Promise<boolean> {
  try {
    const current = await MediaLibrary.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const next = await MediaLibrary.requestPermissionsAsync();
    return next.granted;
  } catch {
    return false;
  }
}

export type CallPermissions = { mic: boolean; camera: boolean };

/**
 * Meeting/call entry: the microphone (always) and camera (video calls)
 * are hard requirements — native builds die when the engine touches
 * hardware without a grant. Notifications ride along so incoming calls
 * can ring, but joining never waits on them.
 */
export async function ensureCallPermissions(
  video: boolean,
): Promise<CallPermissions> {
  const mic = await ensureMicPermission().catch(() => false);
  let camera = true;
  if (video) {
    camera = await ensureCamera().catch(() => false);
  }
  await ensureNotifications().catch(() => false);
  return { mic, camera };
}
