import { requireNativeModule } from 'expo-modules-core';

export type CallKeepaliveModuleType = {
  start: () => void;
  stop: () => void;
};

/** Null on Expo Go and builds predating the module: every caller guards. */
export function getCallKeepalive(): CallKeepaliveModuleType | null {
  try {
    return requireNativeModule<CallKeepaliveModuleType>('CallKeepalive');
  } catch {
    return null;
  }
}
