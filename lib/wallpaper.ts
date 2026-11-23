import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

declare const require: (id: string) => number;

/**
 * Chat wallpaper: the app default doodle, a solid color, or the user's own
 * photo. Stored on-device so it works offline and never leaves the phone.
 */

export const DEFAULT_WALLPAPER: number = require('../assets/chat/default-wallpaper.png');

/** The default chat background: clean white, near-black in dark mode. */
export function defaultWallpaperColor(isDark: boolean): string {
  return isDark ? '#0E0E10' : '#FFFFFF';
}

export const WALLPAPER_COLORS = [
  '#FFFFFF',
  '#EFEAE2',
  '#DDE8D0',
  '#D7E6F5',
  '#F5D7D7',
  '#E4D7F5',
  '#0E0E10',
] as const;

export type BuiltinWallpaper = { id: string; label: string };

export const BUILTIN_WALLPAPERS: BuiltinWallpaper[] = [
  { id: 'dark', label: 'Midnight doodle' },
  { id: 'sage', label: 'Sage doodle' },
  { id: 'sky', label: 'Sky doodle' },
];

const BUILTIN_ART: Record<string, number> = {
  dark: require('../assets/chat/pattern-dark.png'),
  sage: require('../assets/chat/pattern-sage.png'),
  sky: require('../assets/chat/pattern-sky.png'),
};

export function builtinSource(id: string): number | null {
  return BUILTIN_ART[id] ?? null;
}

export type Wallpaper =
  | { type: 'default' }
  | { type: 'builtin'; id: string }
  | { type: 'color'; value: string }
  | { type: 'image'; uri: string };

const STORAGE_KEY = '@ophixe:chat-wallpaper';

export async function getWallpaper(): Promise<Wallpaper> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { type: 'default' };
    const parsed = JSON.parse(raw) as Wallpaper | null;
    if (
      parsed?.type === 'builtin' &&
      typeof parsed.id === 'string' &&
      builtinSource(parsed.id)
    ) {
      return parsed;
    }
    if (parsed?.type === 'color' && typeof parsed.value === 'string') {
      return parsed;
    }
    if (parsed?.type === 'image' && typeof parsed.uri === 'string') {
      // The file may have been cleaned out from under us.
      if (new File(parsed.uri).exists) return parsed;
      return { type: 'default' };
    }
    return { type: 'default' };
  } catch {
    return { type: 'default' };
  }
}

export async function setWallpaper(next: Wallpaper): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Copy a picked photo into app storage so the wallpaper survives. */
export async function persistWallpaperPhoto(uri: string): Promise<Wallpaper> {
  const dir = new Directory(Paths.document, 'wallpaper');
  try {
    dir.create();
  } catch {
    // Already exists.
  }
  const out = new File(dir, 'chat-wallpaper.jpg');
  const source = new File(uri);
  if (!source.exists) throw new Error('Could not read that photo.');
  source.copy(out);
  return { type: 'image', uri: out.uri };
}
