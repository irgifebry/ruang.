'use client';

import { LoaderIcon, DangerCircleIcon } from './icons';

/**
 * The small monospace kicker that opens every page header and panel.
 * `<span className="w-[6px] h-[6px] bg-ruang-accent block" />` was repeated on
 * all six screens, so it lives here now.
 */
export function Eyebrow({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-[8px] font-mono text-[11px] tracking-[0.04em] text-ruang-muted ${className}`}>
      {children}
    </div>
  );
}

/** Full-height loading state shared by every data-backed page. */
export function LoadingState({ label = 'Memuat data...' }) {
  return (
    <div className="py-[34px] max-w-[1310px] mx-auto">
      <div className="flex flex-col items-center justify-center min-h-[65vh]" role="status" aria-live="polite">
        <span className="w-[32px] h-[32px] bg-ruang-accent rounded-full flex items-center justify-center text-ruang-accent-ink">
          <LoaderIcon size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        </span>
        <p className="mt-[14px] text-[15px] text-ruang-ink font-medium">{label}</p>
      </div>
    </div>
  );
}

/**
 * Full-height error state. `onRetry` is optional: when the cause is an expired
 * session the useful action is to sign in again, and when it is a transient
 * failure the useful action is to retry.
 */
export function ErrorState({ message, onRetry, retryLabel = 'Coba lagi' }) {
  return (
    <div className="py-[34px] max-w-[1310px] mx-auto">
      <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-[22px]">
        <span className="w-[34px] h-[34px] bg-ruang-danger-ink rounded-full flex items-center justify-center text-ruang-accent-ink">
          <DangerCircleIcon size={18} aria-hidden="true" />
        </span>
        <p className="mt-[14px] text-[15px] leading-[1.6] text-ruang-ink max-w-[440px]">{message}</p>
        <div className="flex flex-wrap justify-center gap-[14px] mt-[24px]">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="h-[42px] px-[18px] flex items-center gap-[10px] text-[13px] font-bold rounded-[4px] bg-ruang-accent text-ruang-accent-ink hover:bg-ruang-accent-hover transition-colors active:scale-95"
            >
              {retryLabel}
            </button>
          )}
          <a
            href="/login"
            className="h-[42px] px-[18px] flex items-center text-[13px] font-bold rounded-[4px] border border-ruang-line-3 text-ruang-ink hover:border-ruang-accent-text hover:text-ruang-accent-text transition-colors no-underline"
          >
            Masuk lagi
          </a>
        </div>
      </div>
    </div>
  );
}

/** Dashed-border placeholder for an empty list, so a zero state never looks broken. */
export function EmptyState({ children, className = '' }) {
  return (
    <p className={`p-[24px_16px] text-center border border-dashed border-ruang-line-2 text-ruang-muted text-[13px] leading-[1.7] ${className}`}>
      {children}
    </p>
  );
}

/** The bordered surface every card on the site sits in. */
export function Panel({ children, className = '', tone = 'panel', ...rest }) {
  const toneClass =
    tone === 'raised' ? 'bg-ruang-raised border-ruang-line' : 'bg-ruang-panel border-ruang-line';
  return (
    <div className={`rounded-[10px] border p-[22px_24px] ${toneClass} ${className}`} {...rest}>
      {children}
    </div>
  );
}
