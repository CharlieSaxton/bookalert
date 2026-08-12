const ABSOLUTE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const SHORT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** "12 Aug 2026, 19:22" — stable across server and client (fixed locale + UTC). */
export function formatAbsolute(iso: string | null | undefined): string {
  const date = toDate(iso);
  return date ? ABSOLUTE.format(date) : '—';
}

export function formatShort(iso: string | null | undefined): string {
  const date = toDate(iso);
  return date ? SHORT.format(date) : '—';
}

/** "4 hours ago". Rendered client-side only, to avoid hydration drift. */
export function formatRelative(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return '—';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400],
    ['month', 2_592_000],
    ['year', 31_536_000],
  ];

  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let divisor = 60;
  for (const [candidate, size] of units) {
    if (seconds >= size) {
      unit = candidate;
      divisor = size;
    }
  }

  const formatter = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
  return formatter.format(-Math.round(seconds / divisor), unit);
}

export function formatRating(rating: number | null | undefined): string {
  return typeof rating === 'number' ? rating.toFixed(1) : '—';
}

export function formatCount(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toLocaleString('en-GB') : '—';
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
