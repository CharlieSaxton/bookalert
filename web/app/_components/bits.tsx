import { formatAbsolute, formatRelative } from '@/lib/format';
import type { RunStatus } from '@/lib/types';

/**
 * A run only stays 'running' with no finish time if the worker was killed
 * mid-run, so past this age the row is wreckage rather than work in progress.
 * The checker runs every 20 minutes, so 30 covers a slow-but-live run.
 */
const STALE_RUN_MS = 30 * 60 * 1000;

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

const RUN_BADGE: Record<RunStatus, { className: string; label: string; title: string }> = {
  running: {
    className: 'badge badge-running',
    label: 'Running',
    title: 'This run is still in progress.',
  },
  ok: {
    className: 'badge badge-ok',
    label: 'Completed',
    title: 'This run finished and recorded its results.',
  },
  error: {
    className: 'badge badge-error',
    label: 'Failed',
    title: 'This run stopped on an error. Other searches were unaffected.',
  },
};

type RunBadgeProps = {
  status: string | null | undefined;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export function RunBadge({ status, startedAt, finishedAt }: RunBadgeProps) {
  if (status === 'running' && isStale(startedAt, finishedAt)) {
    return (
      <span
        className="badge badge-stale"
        title="This run never reported back — the worker was interrupted before it could finish. The next scheduled run picks up where it left off."
        suppressHydrationWarning
      >
        Interrupted
      </span>
    );
  }

  const known = status && status in RUN_BADGE ? RUN_BADGE[status as RunStatus] : null;
  if (!known) return <span className="badge">{status ?? 'Unknown'}</span>;
  return (
    <span className={known.className} title={known.title}>
      {known.label}
    </span>
  );
}

function isStale(startedAt: string | null | undefined, finishedAt: string | null | undefined) {
  if (finishedAt || !startedAt) return false;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return false;
  return Date.now() - started > STALE_RUN_MS;
}
