import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="shell">
      <div className="center-page">
        <div className="auth-card">
          <div className="auth-head">
            <h1 className="page-title">Not found</h1>
            <p className="page-lede">
              That page does not exist, or it belongs to a different account.
            </p>
          </div>
          <Link href="/" className="btn btn-primary btn-lg btn-block">
            Back to your searches
          </Link>
        </div>
      </div>
    </div>
  );
}
