import type { CallMedia } from './calls';

export type MinimizedRoom = {
  roomId: string;
  media: CallMedia;
  joined: boolean;
};

let current: MinimizedRoom | null = null;
const listeners = new Set<() => void>();

// The live Agora engine, held across the minimize so the mini bar can
// end the call without the call screen mounted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let liveEngine: any = null;

function emit() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A dead listener must never break the bar.
    }
  }
}

export function subscribeMinimizedRoom(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getMinimizedRoom(): MinimizedRoom | null {
  return current;
}

export function setMinimizedRoom(next: MinimizedRoom): void {
  current = next;
  emit();
}

export function clearMinimizedRoom(roomId?: string): void {
  if (roomId && current?.roomId !== roomId) return;
  if (!current) return;
  current = null;
  emit();
}

export function isMinimizedRoom(roomId?: string | null): boolean {
  if (!current || !roomId) return false;
  return current.roomId === roomId;
}

export function setLiveEngine(engine: unknown): void {
  liveEngine = engine;
}

export function getLiveEngine(): unknown {
  return liveEngine;
}

/** Tear down a minimized call from outside the call screen. */
export function teardownLiveEngine(): void {
  try {
    liveEngine?.leaveChannel?.();
  } catch {
    // Already left.
  }
  try {
    liveEngine?.unregisterEventHandler?.();
  } catch {
    // No handler registry.
  }
  try {
    liveEngine?.release?.();
  } catch {
    // Already released.
  }
  liveEngine = null;
}
