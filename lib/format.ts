export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Newest-first client sort for feed-style lists. The server queries already
 * order this way, but a stale or foreign cache must never flip a list
 * oldest-first: items without a timestamp keep their relative order.
 */
export function newestFirst<T extends { createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  );
}
