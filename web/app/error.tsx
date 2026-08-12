'use client';

export default function RouteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="shell">
      <div className="center-page">
        <div className="auth-card">
          <div className="auth-head">
            <h1 className="page-title">Something went wrong</h1>
            <p className="page-lede">
              We could not load this page. This is usually a temporary problem talking to the
              database.
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={reset}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
