import type { ImageSourcePropType } from 'react-native';

/**
 * Bundled sticker pack: the art ships inside the app, so a sticker message
 * is just an id inside the chat's normal E2EE envelope — no upload, no
 * download, works offline. Both sides render from their own copy of the
 * pack, so ids are append-only: never rename or remove one.
 */

export type Sticker = { id: string; label: string };

export const STICKERS: Sticker[] = [
  { id: 'thumbs-up', label: 'Thumbs up' },
  { id: 'laugh', label: 'Laughing' },
  { id: 'heart', label: 'Heart' },
  { id: 'clap', label: 'Clapping' },
  { id: 'thinking', label: 'Thinking' },
  { id: 'party', label: 'Party' },
  { id: 'sad', label: 'Sad' },
  { id: 'fire', label: 'Fire' },
  { id: 'smile', label: 'Smiling' },
  { id: 'wink', label: 'Winking' },
  { id: 'cool', label: 'Cool' },
  { id: 'silly', label: 'Silly' },
  { id: 'surprised', label: 'Surprised' },
  { id: 'sleep', label: 'Sleepy' },
  { id: 'star', label: 'Star' },
  { id: 'love', label: 'In love' },
];

const ART: Record<string, ImageSourcePropType> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  'thumbs-up': require('../assets/stickers/thumbs-up.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  laugh: require('../assets/stickers/laugh.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  heart: require('../assets/stickers/heart.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  clap: require('../assets/stickers/clap.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  thinking: require('../assets/stickers/thinking.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  party: require('../assets/stickers/party.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sad: require('../assets/stickers/sad.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  fire: require('../assets/stickers/fire.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  smile: require('../assets/stickers/smile.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  wink: require('../assets/stickers/wink.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  cool: require('../assets/stickers/cool.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  silly: require('../assets/stickers/silly.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  surprised: require('../assets/stickers/surprised.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sleep: require('../assets/stickers/sleep.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  star: require('../assets/stickers/star.png'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  love: require('../assets/stickers/love.png'),
};

export function stickerSource(id: string): ImageSourcePropType | null {
  return ART[id] ?? null;
}

export function isStickerId(id: string): boolean {
  return id in ART;
}

export type StickerDescriptor = { kind: 'sticker'; id: string };

export function stickerDescriptor(id: string): string {
  const descriptor: StickerDescriptor = { kind: 'sticker', id };
  return JSON.stringify(descriptor);
}

export function parseStickerDescriptor(
  text: string,
): StickerDescriptor | null {
  if (!text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text) as Partial<StickerDescriptor> | null;
    if (parsed?.kind === 'sticker' && typeof parsed.id === 'string') {
      return { kind: 'sticker', id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

/** Human label for quotes and previews; plain text passes through. */
export function stickerLabel(text: string): string {
  const descriptor = parseStickerDescriptor(text);
  if (!descriptor) return text;
  if (!isStickerId(descriptor.id)) return 'Sticker';
  return `Sticker • ${STICKERS.find((s) => s.id === descriptor.id)?.label ?? ''}`.trim();
}
