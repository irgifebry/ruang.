'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, HistoryIcon } from './icons';

/**
 * A transient notice that floats over the page instead of sitting in the layout.
 *
 * Built for the case where a message is worth showing once and then getting out
 * of the way. The `?deleted=1` and `?idle=1` notices on `/login` were inline
 * panels inside the form, which meant a notice about *why you are here* was
 * pushing the email field down and permanently changing the page the visitor
 * came to use. Nothing about either message needs to survive past the first few
 * seconds, and neither needs to be read before the form can be used.
 *
 * It is deliberately **not** a dialog, and the difference is the design:
 *
 * - No focus trap, no `aria-modal`, no focus move on open. The visitor may be
 *   halfway through typing an email, and yanking focus away from a field they
 *   were using is a worse outcome than the message they were not reading.
 * - No Escape handler bound to the document either, for the same reason: an
 *   invisible listener that swallows Escape from a page you are still typing in
 *   is not a shortcut.
 * - The dismiss button is there for pointer users and is reachable by Tab for
 *   everyone else; the auto-dismiss is the primary exit and it is announced by a
 *   progress bar rather than left to be discovered.
 *
 * `role="status"` makes it a polite live region, so a screen reader mentions it
 * without interrupting whatever the visitor is doing.
 */

/** Matches `toast-out` in `globals.css`. */
const EXIT_MS = 160;

export function Toast({
  open = false,
  title,
  children,
  icon: Icon = HistoryIcon,
  duration = 8000,
  onDismiss,
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  // Two flags, and the same split `ConfirmDialog` uses. `open` answers "should
  // it be showing"; `mounted`/`closing` answer "is it still on screen", and only
  // `mounted` decides whether anything renders. Collapsing them tears the element
  // out on the same render that sets `open = false`, so the exit animation never
  // gets a frame to run in.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    // Already down and staying down — this is the first render, not a close.
    if (!mounted) return undefined;

    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  // `onDismiss` is deliberately absent from the dependencies and read through a
  // ref instead. Callers pass an inline arrow, so depending on it would rebuild
  // this timer on every render of the page behind the toast — and a timer that
  // keeps being replaced by one just like it never reaches its duration, which
  // looks exactly like a toast that refuses to close.
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => dismissRef.current?.(), duration);
    return () => window.clearTimeout(timer);
  }, [open, duration]);

  if (!mounted) return null;

  const content = (
    // Full-bleed on a phone, bottom-right from `sm` up. Above the safe area on
    // anything with a home indicator, since a fixed bottom edge there sits under
    // the gesture bar.
    <div className="fixed z-[130] inset-x-[16px] bottom-[max(16px,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-[22px] sm:bottom-[22px] sm:w-[392px] pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto relative overflow-hidden bg-ruang-panel-2 border border-ruang-line-3 shadow-[0_18px_50px_rgba(0,0,0,0.5)] ${closing ? 'toast-out' : 'toast-in'}`}
      >
        <div className="flex items-start gap-[11px] p-[14px_15px_16px]">
          <span className="w-[26px] h-[26px] flex-none grid place-items-center rounded-full bg-ruang-hover text-ruang-muted">
            <Icon size={14} aria-hidden="true" />
          </span>

          <div className="min-w-0 flex-1 pt-[2px]">
            {title && <p className="text-[13px] font-medium text-ruang-ink break-words">{title}</p>}
            <p className="text-[12.5px] leading-[1.6] text-ruang-body break-words">{children}</p>
          </div>

          <button
            type="button"
            onClick={() => dismissRef.current?.()}
            aria-label="Tutup notifikasi"
            className="flex-none -mt-[2px] -mr-[2px] w-[24px] h-[24px] grid place-items-center rounded-[4px] text-ruang-ghost hover:text-ruang-ink hover:bg-ruang-hover transition-colors cursor-pointer"
          >
            <CloseIcon size={13} aria-hidden="true" />
          </button>
        </div>

        {/* The bar is the affordance. A toast that vanishes with no sign that it
            was ever going to is the complaint that produces every "did that even
            happen?" moment. Driven by the same `duration` as the timer, so the
            two cannot drift apart. */}
        <span
          aria-hidden="true"
          className="toast-progress absolute bottom-0 left-0 h-[2px] w-full bg-ruang-accent/45"
          style={{ '--toast-duration': `${duration}ms` }}
        />
      </div>
    </div>
  );

  return portalReady ? createPortal(content, document.body) : content;
}
