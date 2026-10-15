'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui';

/**
 * Route-level error boundary.
 *
 * Without this, any render error inside a page replaced the whole app with
 * Next.js's bare production screen, including on the authenticated routes where
 * the user would have no way back to the app.
 */
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      message={
        error?.message ||
        'Terjadi kesalahan saat menampilkan halaman ini. Coba muat ulang atau kembali ke ringkasan.'
      }
      onRetry={reset}
      retryLabel="Muat ulang"
    />
  );
}
