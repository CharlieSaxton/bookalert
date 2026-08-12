export default function Loading() {
  return (
    <div className="shell">
      <div className="main" aria-busy="true" aria-label="Loading search">
        <div className="stack">
          <div className="skeleton" style={{ height: '1.75rem', width: 'min(100%, 18rem)' }} />
          <div className="skeleton" style={{ height: '1rem', width: 'min(100%, 26rem)' }} />
        </div>
        <div className="skeleton" style={{ height: '12rem' }} />
        <div className="skeleton" style={{ height: '18rem' }} />
      </div>
    </div>
  );
}
