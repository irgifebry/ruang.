import { LoadingState } from '@/components/ui';

/**
 * Root streaming fallback. Distinct label from the per-page `Memuat data...`
 * state, so the e2e loader check can still tell them apart.
 */
export default function Loading() {
  return <LoadingState label="Memuat halaman..." />;
}
