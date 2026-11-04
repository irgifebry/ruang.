'use client';

/**
 * Last-resort error boundary: replaces the root layout, so it must render its
 * own `<html>`/`<body>` and cannot use `globals.css` (docs: global-error does
 * not include global styles) — the theme is applied inline instead.
 */
export default function GlobalError({ error, reset }) {
  return (
    <html lang="id">
      <head>
        <title>ruang. — terjadi kesalahan</title>
        <style>{`
          button:focus-visible,
          a:focus-visible {
            outline: 2px solid rgb(var(--c-accent-text, 201 251 85));
            outline-offset: 2px;
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'rgb(var(--c-bg, 11 13 12))',
          color: 'rgb(var(--c-ink, 240 241 235))',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <main style={{ padding: '24px', maxWidth: '440px', textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: '34px', letterSpacing: '-0.05em', fontWeight: 500 }}>
            Ada yang <span style={{ color: 'rgb(var(--c-accent-text, 201 251 85))', fontStyle: 'italic', fontWeight: 400 }}>salah.</span>
          </h1>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.7, color: 'rgb(var(--c-muted, 140 148 140))' }}>
            Kesalahan fatal — halaman ini gagal dimuat. Coba muat ulang; jika terus berlanjut, masuk
            kembali dari halaman login.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '22px' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                height: '42px',
                padding: '0 17px',
                border: 0,
                borderRadius: '4px',
                background: 'rgb(var(--c-accent, 201 251 85))',
                color: 'rgb(var(--c-accent-ink, 17 21 11))',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Coba lagi
            </button>
            <a
              href="/login"
              style={{
                height: '42px',
                padding: '0 17px',
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: '4px',
                border: '1px solid rgb(var(--c-line-3, 51 59 51))',
                color: 'rgb(var(--c-ink, 240 241 235))',
                fontSize: '11px',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Halaman masuk
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
