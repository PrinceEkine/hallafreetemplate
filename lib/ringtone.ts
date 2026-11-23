import { useEffect, useRef } from 'react';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Incoming-call ringtone, synthesized on-device (no audio asset to ship):
 * a classic dual-tone burst looping until the call is answered, declined,
 * or ends. Everything here is best-effort — a phone that cannot play it
 * still rings visually through the popup/banner.
 */

const SAMPLE_RATE = 8000;
const TONE_SECONDS = 1.4;
const SILENCE_SECONDS = 1.6;

let cachedUri: string | null = null;
let building: Promise<string> | null = null;

function buildRingtoneWav(): Uint8Array {
  const toneSamples = Math.floor(SAMPLE_RATE * TONE_SECONDS);
  const silenceSamples = Math.floor(SAMPLE_RATE * SILENCE_SECONDS);
  const total = toneSamples + silenceSamples;
  const data = new Uint8Array(44 + total * 2);
  const view = new DataView(data.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + total * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, total * 2, true);
  // Dual-tone burst with soft edges (no clicks when the loop restarts);
  // the trailing silence is zeroes (classic ring … ring cadence).
  for (let i = 0; i < toneSamples; i++) {
    const t = i / SAMPLE_RATE;
    const edge = Math.min(1, i / 400, (toneSamples - i) / 400);
    const sample =
      (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) / 2;
    view.setInt16(44 + i * 2, Math.round(sample * edge * 12000), true);
  }
  return data;
}

/** Generate (once) and return the ringtone file URI. */
export async function ensureRingtoneUri(): Promise<string> {
  if (cachedUri) return cachedUri;
  if (!building) {
    building = (async () => {
      const dir = new Directory(Paths.cache, 'ringtones');
      try {
        dir.create();
      } catch {
        // Already exists.
      }
      const file = new File(dir, 'incoming-call.wav');
      file.write(buildRingtoneWav());
      cachedUri = file.uri;
      return file.uri;
    })().catch((err: unknown) => {
      building = null;
      throw err;
    });
  }
  return building;
}

/**
 * Loop the ringtone while `active` is true; silence (and rewind) when it
 * flips false or the owner unmounts.
 */
export function useRingtone(active: boolean): void {
  const player = useAudioPlayer();
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        const uri = await ensureRingtoneUri();
        if (!alive) return;
        player.replace({ uri });
        player.loop = true;
        if (activeRef.current) player.play();
      } catch {
        // Ring visually only.
      }
    })();
    return () => {
      alive = false;
      try {
        player.pause();
        player.remove();
      } catch {
        // Already gone.
      }
    };
  }, [player]);
  useEffect(() => {
    try {
      if (active) {
        player.play();
      } else {
        player.pause();
        player.seekTo(0);
      }
    } catch {
      // Still ringing visually.
    }
  }, [active, player]);
}
