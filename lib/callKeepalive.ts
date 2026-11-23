import { Platform } from 'react-native';
import { getCallKeepalive } from '../modules/call-keepalive/src/index';

/**
 * Android background-call keepalive: a microphone-type foreground
 * service holds audio (and the call socket) while the call screen is
 * minimized. No-ops everywhere else — iOS covers this with the audio
 * background mode in app.json instead.
 */
export function startCallKeepalive(): void {
  if (Platform.OS !== 'android') return;
  try {
    getCallKeepalive()?.start();
  } catch {
    // Expo Go and old builds: calls still work in the foreground.
  }
}

export function stopCallKeepalive(): void {
  if (Platform.OS !== 'android') return;
  try {
    getCallKeepalive()?.stop();
  } catch {
    // Already stopped.
  }
}
