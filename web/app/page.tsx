import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { formatCount, formatRating } from '@/lib/format';
import type { Run, Search } from '@/lib/types';
import { AddSearchForm } from '@/app/_components/add-search-form';
import { SearchActions } from '@/app/_components/search-actions';
import { ActiveBadge, RecipientList, RunBadge, SharedBadge, TimeAgo } from '@/app/_components/bits';
import { Topbar } from '@/app/_components/topbar';

type Summary = {
  search: Search;
  lastRun: Run | null;
  findingsCount: number;
  /** False for a search someone else shared with this account. */
  isOwner: boolean;
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const email = user.email ?? '';
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('searches')
    .select('*')
    .order('created_at', { ascending: false });

  const searches = (data ?? []) as Search[];

  // Row level security returns this account's own searches and any shared with
  // it, so the split below is what separates them. Counting with head:true keeps
  // totals exact without pulling every finding down the wire.
  const summaries: Summary[] = await Promise.all(
    searches.map(async (search) => {
      const [run, findings] = await Promise.all([
        supabase
          .from('runs')
          .select('*')
          .eq('search_id', search.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('findings')
          .select('id', { count: 'exact', head: true })
          .eq('search_id', search.id),
      ]);

      return {
        search,
        lastRun: (run.data as Run | null) ?? null,
        findingsCount: findings.count ?? 0,
        isOwner: search.user_id === user.id,
      };
    }),
  );

  const owned = summaries.filter((summary) => summary.isOwner);
  const shared = summaries.filter((summary) => !summary.isOwner);
  const activeCount = owned.filter((summary) => summary.search.active).length;

  return (
    <div className="shell">
      <Topbar email={email} />

      <main className="main">
        <div className="stack">
          <h1 className="page-title">Your searches</h1>
          <p className="page-lede">
            Each search is a Booking.com result page we re-check on a schedule. When a property
            shows up that we have never seen on that search before, you get an email.
          </p>
        </div>

        {error ? (
          <p className="notice notice-error" role="alert">
            <span>
              <strong>Could not load your searches.</strong> The database did not respond as
              expected. Reload the page, and if it persists check that the bookalert tables and
              policies are in place.
            </span>
          </p>
        ) : null}

        <section className="section">
          <div className="section-head">
            <h2 className="section-label">Add a search</h2>
          </div>
          <div className="panel panel-pad">
            <AddSearchForm defaultEmail={email} />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-label">Watching</h2>
            {owned.length > 0 ? (
              <p className="count-hint">
                {formatCount(owned.length)} {owned.length === 1 ? 'search' : 'searches'} ·{' '}
                {formatCount(activeCount)} active
              </p>
            ) : null}
          </div>

          {owned.length === 0 ? (
            // With something shared in, the full onboarding empty state would
            // read as "you have nothing", which is not true — so it shrinks to
            // a note and the shared section below carries the page.
            shared.length > 0 ? (
              <NoSearchesOfYourOwn />
            ) : (
              <EmptyState />
            )
          ) : (
            <div className="card-grid">
              {owned.map((summary) => (
                <SearchCard key={summary.search.id} summary={summary} />
              ))}
            </div>
          )}
        </section>

        {shared.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2 className="section-label">Shared with you</h2>
              <p className="count-hint">
                {formatCount(shared.length)} {shared.length === 1 ? 'search' : 'searches'}
              </p>
            </div>
            <p className="page-lede" style={{ fontSize: '0.8125rem' }}>
              Searches other people run and shared with {email}. You see everything they find; only
              their owners can change them.
            </p>
            <div className="card-grid">
              {shared.map((summary) => (
                <SearchCard key={summary.search.id} summary={summary} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function SearchCard({ summary }: { summary: Summary }) {
  const { search, lastRun, findingsCount, isOwner } = summary;

  return (
    <article className="card">
      <div className="card-head">
        <h3 className="card-title">
          <Link href={`/searches/${search.id}`}>{search.label}</Link>
        </h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s2)',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          <ActiveBadge active={search.active} />
          {isOwner ? null : <SharedBadge />}
        </div>
      </div>

      <div className="metrics">
        <div className="metric" title="Properties this search has ever discovered">
          <div className="metric-value">{formatCount(findingsCount)}</div>
          <div className="metric-label">Found</div>
        </div>
        <div className="metric" title="Properties on the most recent run that had never been seen before">
          <div className="metric-value">{formatCount(lastRun?.new_count ?? null)}</div>
          <div className="metric-label">New</div>
        </div>
        <div
          className="metric"
          title="Properties on the most recent run that met your criteria, including ones already known"
        >
          <div className="metric-value">{formatCount(lastRun?.scraped_count ?? null)}</div>
          <div className="metric-label">Matched</div>
        </div>
      </div>

      <p className="run-line">
        <span className="run-line-label">Last run</span>
        {lastRun ? (
          <>
            <RunBadge
              status={lastRun.status}
              startedAt={lastRun.started_at}
              finishedAt={lastRun.finished_at}
            />
            <TimeAgo iso={lastRun.started_at} />
          </>
        ) : (
          <span className="field-hint">Not run yet</span>
        )}
      </p>

      <dl className="kv">
        <dt>Min rating</dt>
        <dd>{search.min_rating === null ? 'Any' : formatRating(search.min_rating)}</dd>

        <dt>Pages</dt>
        <dd>{search.max_pages}</dd>

        <dt>Alerts to</dt>
        <dd>
          <RecipientList emails={search.alert_emails} />
        </dd>
      </dl>

      {lastRun?.status === 'error' && lastRun.error ? (
        <p className="notice notice-error" title={lastRun.error}>
          <span>{truncate(lastRun.error, 220)}</span>
        </p>
      ) : null}

      <div className="card-foot">
        <Link href={`/searches/${search.id}`} className="btn">
          Open
        </Link>
        {isOwner ? (
          <SearchActions id={search.id} label={search.label} active={search.active} />
        ) : null}
      </div>
    </article>
  );
}

function NoSearchesOfYourOwn() {
  return (
    <div className="empty">
      <h3 className="empty-title">None of your own yet</h3>
      <p className="empty-body">
        You have not added a search yourself. Paste a Booking.com results page into the form above
        and it starts watching on the next scheduled run. The searches below were shared with you by
        other people.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <h3 className="empty-title">No searches yet</h3>
      <p className="empty-body">
        A search is one Booking.com results page — a destination, your dates, and any filters you
        care about. bookalert re-runs it on a schedule, remembers every property it has already
        seen, and emails you only the genuinely new ones.
      </p>
      <ol className="steps">
        <li>Open Booking.com and search for what you want.</li>
        <li>Apply your dates, guests and filters until the results look right.</li>
        <li>Copy the URL from the address bar and paste it into the form above.</li>
      </ol>
      <a
        className="btn btn-primary"
        href="https://www.booking.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Build a search on Booking.com
      </a>
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
