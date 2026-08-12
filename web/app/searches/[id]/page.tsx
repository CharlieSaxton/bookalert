import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { formatAbsolute, formatCount, formatRating } from '@/lib/format';
import type { Finding, Run, Search } from '@/lib/types';
import { SearchActions } from '@/app/_components/search-actions';
import { RecipientsEditor } from '@/app/_components/recipients-editor';
import { ActiveBadge, RunBadge, TimeAgo } from '@/app/_components/bits';
import { Topbar } from '@/app/_components/topbar';

const FINDINGS_LIMIT = 300;
const RUNS_LIMIT = 50;

export default async function SearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect('/login');

  const supabase = await createClient();

  const { data: searchRow, error: searchError } = await supabase
    .from('searches')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  // A missing row and someone else's row are indistinguishable under RLS, which
  // is exactly what we want to show the visitor.
  if (searchError) throw new Error('Could not load this search.');
  if (!searchRow) notFound();

  const search = searchRow as Search;

  const [findingsResult, runsResult, findingsCount] = await Promise.all([
    supabase
      .from('findings')
      .select('*')
      .eq('search_id', id)
      .order('first_seen', { ascending: false })
      .limit(FINDINGS_LIMIT),
    supabase
      .from('runs')
      .select('*')
      .eq('search_id', id)
      .order('started_at', { ascending: false })
      .limit(RUNS_LIMIT),
    supabase.from('findings').select('id', { count: 'exact', head: true }).eq('search_id', id),
  ]);

  const findings = (findingsResult.data ?? []) as Finding[];
  const runs = (runsResult.data ?? []) as Run[];
  const total = findingsCount.count ?? findings.length;
  const recipients = search.alert_emails ?? [];

  return (
    <div className="shell">
      <Topbar email={user.email ?? ''} />

      <main className="main">
        <div className="stack">
          <p className="breadcrumb">
            <Link href="/">Your searches</Link>
            <span aria-hidden="true">/</span>
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--s3)',
              flexWrap: 'wrap',
            }}
          >
            <h1 className="page-title">{search.label}</h1>
            <ActiveBadge active={search.active} />
          </div>
          <p className="page-lede">
            Added {formatAbsolute(search.created_at)}. Alerts go to {formatCount(recipients.length)}{' '}
            {recipients.length === 1 ? 'recipient' : 'recipients'}.
          </p>
        </div>

        <section className="section">
          <h2 className="section-label">Settings</h2>
          <div className="panel panel-pad stack" style={{ gap: 'var(--s4)' }}>
            <dl className="kv">
              <dt>Min rating</dt>
              <dd>{search.min_rating === null ? 'Any' : formatRating(search.min_rating)}</dd>

              <dt>Pages per run</dt>
              <dd>
                {search.max_pages} {search.max_pages === 1 ? 'page' : 'pages'} per run
              </dd>

              <dt>State</dt>
              <dd>{search.active ? 'Active — re-checked on schedule' : 'Paused — not re-checked'}</dd>
            </dl>

            <hr className="divider" />

            <div className="stack" style={{ gap: 'var(--s2)' }}>
              <span className="section-label">Alert recipients</span>
              <p className="field-hint">
                Everyone listed gets the same email when this search turns up a property it has
                never seen. Changes save as you make them.
              </p>
              <RecipientsEditor searchId={search.id} emails={recipients} />
            </div>

            <hr className="divider" />

            <div className="stack" style={{ gap: 'var(--s1)' }}>
              <span className="section-label">Search URL</span>
              <a
                className="url-line"
                href={search.search_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {search.search_url}
              </a>
            </div>

            <hr className="divider" />

            <SearchActions
              id={search.id}
              label={search.label}
              active={search.active}
              redirectTo="/"
            />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-label">Findings</h2>
            <p className="count-hint">
              {formatCount(total)} {total === 1 ? 'property' : 'properties'}
              {total > findings.length ? ` · showing newest ${formatCount(findings.length)}` : ''}
            </p>
          </div>
          <p className="page-lede" style={{ fontSize: '0.8125rem' }}>
            These are new discoveries, newest first. A property is listed once — the first time it
            ever appeared in this search — so this is a log of what is new, not a snapshot of
            current results.
            {search.min_rating === null
              ? ''
              : ` Properties rated below ${formatRating(search.min_rating)}, and any with no guest score yet, never reach this list.`}
          </p>

          {findings.length === 0 ? (
            <div className="empty">
              <h3 className="empty-title">Nothing discovered yet</h3>
              <p className="empty-body">
                {runs.length === 0
                  ? 'This search has not run yet. The first run records everything it sees as the starting point.'
                  : 'The last run found no properties that were new to this search. That is the normal steady state.'}
              </p>
            </div>
          ) : (
            <ul className="findings">
              {findings.map((finding) => (
                <li key={finding.id} className="finding">
                  <div className="finding-main">
                    <a
                      className="finding-name"
                      href={finding.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {finding.name || finding.property_id}
                    </a>
                    <span className="finding-meta">
                      First seen <TimeAgo iso={finding.first_seen} />
                    </span>
                  </div>
                  <div className="finding-side">
                    {finding.rating === null ? (
                      <span className="field-hint" title="Booking.com shows no guest score yet">
                        No score
                      </span>
                    ) : (
                      <span title="Guest rating out of 10">{formatRating(finding.rating)}/10</span>
                    )}
                    {finding.price ? <span className="finding-price">{finding.price}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-label">Run history</h2>
            {runs.length > 0 ? (
              <p className="count-hint">
                {formatCount(runs.length)} most recent {runs.length === 1 ? 'run' : 'runs'}
              </p>
            ) : null}
          </div>

          {runs.length === 0 ? (
            <div className="empty">
              <h3 className="empty-title">No runs recorded</h3>
              <p className="empty-body">
                Runs appear here as soon as the scheduled checker picks this search up.
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Started</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num" title="Properties that met your criteria">
                      Matched
                    </th>
                    <th scope="col" className="num" title="Of those, never seen before">
                      New
                    </th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="cell-when">
                        <TimeAgo iso={run.started_at} />
                      </td>
                      <td>
                        <RunBadge
                          status={run.status}
                          startedAt={run.started_at}
                          finishedAt={run.finished_at}
                        />
                      </td>
                      <td className="num">{formatCount(run.scraped_count)}</td>
                      <td className="num">{formatCount(run.new_count)}</td>
                      <td
                        className={run.error ? 'cell-error' : ''}
                        title={run.error ?? undefined}
                      >
                        {run.error ? run.error : <span className="field-hint">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
