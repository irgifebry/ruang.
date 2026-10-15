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
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0b0d0c',
          color: '#f0f1eb',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <main style={{ padding: '24px', maxWidth: '440px', textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: '34px', letterSpacing: '-0.05em', fontWeight: 500 }}>
            Ada yang <span style={{ color: '#c9fb55', fontStyle: 'italic', fontWeight: 400 }}>salah.</span>
          </h1>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.7, color: '#8c948c' }}>
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
                background: '#c9fb55',
                color: '#11150b',
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
                border: '1px solid #333b33',
                color: '#dfe4dc',
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
