'use client';

import { useEffect } from 'react';

/**
 * Freezes the page behind an overlay.
 *
 * `document.body.style.overflow = 'hidden'` is the whole trick, and it is not
 * something a native `<dialog>` does for you: `showModal()` makes the rest of the
 * document inert to input, but the page behind it still scrolls under the
 * backdrop. On a trackpad that reads as the dialog sliding over a page that is
 * still moving underneath it.
 *
 * Shared rather than duplicated because the two overlays are built differently —
 * this one is a hand-rolled div, that one a native `<dialog>` — and the lock is
 * the one behaviour they must not disagree about.
 *
 * `locked` should stay true for as long as the overlay is *visible*, not merely
 * open. A closing overlay that releases the lock immediately lets the page
 * scroll while the panel is still fading out over the top of it, which is why
 * the confirm dialog keys off its own `mounted` rather than `open`.
 *
 * The previous inline value is restored rather than cleared, so a component that
 * had its own overflow set does not lose it, and the lock composes: two overlays
 * opening at once each capture `''` and hand it back in reverse order.
 */
export function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}