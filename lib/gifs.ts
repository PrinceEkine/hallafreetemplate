/**
 * GIF search via Giphy. Needs EXPO_PUBLIC_GIPHY_KEY (free at
 * developers.giphy.com); without it the GIF tab explains setup instead of
 * calling the API. Sends go out as normal encrypted video messages using
 * the mp4 rendition, so they play on every device.
 */

export type GifResult = {
  id: string;
  title: string;
  /** Small animated preview for the picker grid. */
  previewUrl: string;
  /** Full clip, sealed and uploaded on send. */
  mp4Url: string;
};

const API = 'https://api.giphy.com/v1/gifs';

export function giphyKey(): string | null {
  const key = process.env.EXPO_PUBLIC_GIPHY_KEY ?? '';
  return key ? key : null;
}

type GiphyImage = {
  url?: string;
  mp4?: string;
};

type GiphyItem = {
  id: string;
  title?: string;
  images?: {
    fixed_width_small?: GiphyImage;
    fixed_width?: GiphyImage;
    original?: GiphyImage & { mp4?: string };
  };
};

function mapItem(item: GiphyItem): GifResult | null {
  const preview =
    item.images?.fixed_width_small?.url ?? item.images?.fixed_width?.url;
  const mp4 =
    item.images?.fixed_width?.mp4 ?? item.images?.original?.mp4;
  if (!item.id || !preview || !mp4) return null;
  return {
    id: String(item.id),
    title: String(item.title ?? '').trim() || 'GIF',
    previewUrl: preview,
    mp4Url: mp4,
  };
}

async function query(path: string): Promise<GifResult[]> {
  const key = giphyKey();
  if (!key) return [];
  const res = await fetch(`${API}${path}&api_key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error('Could not load GIFs. Check your connection.');
  const json = (await res.json()) as { data?: GiphyItem[] };
  return (json.data ?? [])
    .map(mapItem)
    .filter((g): g is GifResult => g !== null);
}

export function trendingGifs(limit = 24): Promise<GifResult[]> {
  return query(`/trending?limit=${limit}&rating=pg-13`);
}

export function searchGifs(term: string, limit = 24): Promise<GifResult[]> {
  return query(
    `/search?limit=${limit}&rating=pg-13&q=${encodeURIComponent(term)}`,
  );
}
