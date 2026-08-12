import { formatAbsolute, formatRelative } from '@/lib/format';
import type { RunStatus } from '@/lib/types';

/**
 * Relative time with the exact timestamp on hover. Rendered on the server and
 * again on hydration, so the wording can straddle a minute boundary — harmless,
 * and suppressed rather than warned about.
 */
export function TimeAgo({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <>—</>;
  return (
    <time dateTime={iso} title={formatAbsolute(iso)} suppressHydrationWarning>
      {formatRelative(iso)}
    </time>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={active ? 'badge badge-active' : 'badge badge-paused'}>
      {active ? 'Active' : 'Paused'}
    </span>
  );
}

const RUN_BADGE: Record<RunStatus, { className: string; label: string }> = {
  running: { className: 'badge badge-running', label: 'Running' },
  ok: { className: 'badge badge-ok', label: 'Completed' },
  error: { className: 'badge badge-error', label: 'Failed' },
};

export function RunBadge({ status }: { status: string | null | undefined }) {
  const known = status && status in RUN_BADGE ? RUN_BADGE[status as RunStatus] : null;
  if (!known) return <span className="badge">{status ?? 'Unknown'}</span>;
  return <span className={known.className}>{known.label}</span>;
}
