'use client';

/**
 * Last-resort boundary: replaces the root layout, so it cannot rely on the app
 * stylesheet and carries its own inline styling.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#f6f7f9',
          color: '#10131a',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: '26rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.375rem', margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>
            bookalert hit an unexpected error
          </h1>
          <p style={{ color: '#565f6e', fontSize: '0.9375rem', margin: '0 0 1.5rem' }}>
            The page could not be rendered. Reloading usually clears it.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              font: 'inherit',
              fontSize: '0.875rem',
              fontWeight: 560,
              padding: '0.5625rem 1rem',
              borderRadius: 10,
              border: '1px solid #3f4fd1',
              background: '#3f4fd1',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
