export default function Loading() {
  return (
    <div className="shell">
      <div className="main" aria-busy="true" aria-label="Loading your searches">
        <div className="stack">
          <div className="skeleton" style={{ height: '1.75rem', width: '12rem' }} />
          <div className="skeleton" style={{ height: '1rem', width: 'min(100%, 32rem)' }} />
        </div>
        <div className="skeleton" style={{ height: '14rem' }} />
        <div className="card-grid">
          <div className="skeleton" style={{ height: '17rem' }} />
          <div className="skeleton" style={{ height: '17rem' }} />
        </div>
      </div>
    </div>
  );
}
