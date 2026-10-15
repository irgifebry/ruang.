'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, GhostButton } from './form';
import { DangerCircleIcon } from './icons';

/**
 * In-page confirmation dialog.
 *
 * Replaces `window.confirm`, which renders a browser-owned popup: it ignores the
 * dark theme, blocks the main thread, and cannot show the amount or the number
 * of rows a delete will take. This is the same question asked in the app's own
 * surface, with the same tokens as the rest of the UI.
 *
 * Accessibility contract: `role="alertdialog"` + `aria-modal`, focus moved to
 * the cancel button on open, Tab trapped inside the panel, Escape cancels, and
 * focus returns to the trigger (the browser does this for a real dialog only if
 * the trigger is restored manually, so it is done here).
 */

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  open = false,
  title = 'Lanjutkan?',
  eyebrow = 'KONFIRMASI',
  description,
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
  tone = 'danger',
  busy = false,
  busyLabel = 'Memproses...',
  onConfirm,
  onCancel,
}) {
  const panelRef = useRef(null);
  const cancelRef = useRef(null);
  const [portalReady, setPortalReady] = useState(false);
  // Two flags, because `open` and "still on screen" are different questions.
  // `open` answers the first; `mounted`/`closing` answer the second, and only
  // `mounted` decides whether the portal renders. Without the second pair the
  // dialog is torn out of the DOM on the same render that sets `open = false`,
  // so the exit animation never gets a frame to run in.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => setPortalReady(true), []);

  // Hold the dialog mounted through its exit animation, then drop it. The
  // timeout matches `confirm-out` in globals.css; a JS-driven unmount is the
  // price of animating an exit without a library.
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
    }, 160);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Focus the cancel button, not the destructive one: a stray Enter should not
  // delete anything.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // Escape cancels, Tab is trapped, and neither fires while a delete is in
  // flight (the caller's `busy` guard decides what "cancel" means there).
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onCancel?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  // The page behind must not scroll while the dialog is up. This keys off
  // `mounted`, not `open`, so the scrollbar does not snap back while the panel
  // is still fading out over the top of it.
  useEffect(() => {
    if (!mounted) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mounted]);

  if (!mounted) return null;

  const content = (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-[18px]">
      <div
        className={`absolute inset-0 bg-ruang-overlay/85 backdrop-blur-[3px] ${closing ? 'confirm-fade-out' : 'confirm-fade'}`}
        onClick={() => !busy && onCancel?.()}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`relative w-full max-w-[420px] bg-ruang-panel-2 border border-ruang-line-3 p-[21px_23px] shadow-[0_24px_70px_rgba(0,0,0,0.6)] ${closing ? 'confirm-out' : 'confirm-in'}`}
      >
        <div className="flex items-start gap-[12px]">
          <span className="w-[30px] h-[30px] flex-none grid place-items-center rounded-full bg-ruang-danger-surface text-ruang-danger-ink">
            <DangerCircleIcon size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0 pt-[2px]">
            <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-ruang-muted">{eyebrow}</span>
            <h2 id={titleId} className="text-[18px] tracking-[-0.03em] font-medium mt-[6px] text-ruang-ink break-words">
              {title}
            </h2>
          </div>
        </div>

        {description && (
          <p
            id={descriptionId}
            className="mt-[14px] text-[13px] leading-[1.65] text-ruang-body whitespace-pre-line break-words"
          >
            {description}
          </p>
        )}

        <div className="mt-[20px] flex flex-col-reverse sm:flex-row sm:justify-end gap-[9px]">
          <GhostButton ref={cancelRef} onClick={onCancel} disabled={busy} className="sm:min-w-[112px]">
            {cancelLabel}
          </GhostButton>
          <Button
            onClick={onConfirm}
            busy={busy}
            busyLabel={busyLabel}
            tone={tone}
            className="sm:min-w-[112px]"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
  return portalReady ? createPortal(content, document.body) : content;
}

/**
 * Promise-based wrapper, so a handler reads top to bottom:
 *
 *   if (!(await confirm({ title: 'Hapus transaksi?', ... }))) return;
 *
 * Passing `onConfirm` keeps the dialog open in its busy state until that async
 * action settles; returning `false` from it resolves the caller's promise with
 * `false` (the action failed and the page-level `FormMessage` explains why).
 * Without `onConfirm` the dialog closes as soon as the user confirms.
 *
 * The returned `dialog` element must be rendered once by the caller.
 */
export function useConfirm() {
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(null);

  const settle = useCallback((result) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setBusy(false);
    setRequest(null);
    pending?.resolve(result);
  }, []);

  const confirm = useCallback((options) => {
    // Only one dialog exists. A second request supersedes the first and settles
    // the earlier promise, so a double click cannot leave a caller awaiting
    // forever.
    pendingRef.current?.resolve(false);

    return new Promise((resolve) => {
      pendingRef.current = { resolve };
      setBusy(false);
      setRequest(options);
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!request?.onConfirm) {
      settle(true);
      return;
    }

    setBusy(true);
    let result = true;
    try {
      result = await request.onConfirm();
    } catch {
      // The caller's mutation helper already recorded the message; treat a throw
      // as "not done" so the caller takes its failure path.
      result = false;
    }
    settle(result !== false);
  }, [request, settle]);

  const handleCancel = useCallback(() => {
    if (busy) return;
    settle(false);
  }, [busy, settle]);

  // Navigating away mid-request must not strand a pending await.
  useEffect(() => () => pendingRef.current?.resolve(false), []);

  const dialog = (
    <ConfirmDialog
      {...(request ?? {})}
      open={Boolean(request)}
      busy={busy}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}
