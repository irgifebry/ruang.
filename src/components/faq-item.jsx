'use client';

import { useId, useState } from 'react';

/**
 * One FAQ row: the question is a button, the answer collapses under it.
 *
 * This was a `<details>`. Native disclosure cannot animate its own close — the
 * content is `display: none` the instant the element closes, so there is no exit
 * to run. Driving the state here instead lets both directions use the same
 * `grid-template-rows: 0fr → 1fr` transition, which is what makes the answer
 * slide rather than snap.
 *
 * Markup follows the disclosure pattern: `aria-expanded` on the button and
 * `aria-controls` pointing at the panel. The panel is `aria-hidden` while
 * collapsed because the collapsed copy is still in the DOM for the transition
 * to run against — a screen reader should not read an answer the sighted user
 * cannot see. It holds no focusable nodes, which is what makes hiding it safe.
 */
export function FaqItem({ question, answer, className = '' }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={`border-b border-ruang-line py-[16px] ${className}`}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="w-full flex items-start justify-between gap-[14px] text-left cursor-pointer text-[14px] font-medium text-ruang-ink"
        >
          {question}
          <span
            aria-hidden="true"
            className={`faq-toggle flex-none font-mono text-[14px] text-ruang-accent-text ${open ? 'faq-toggle-open' : ''}`}
          >
            +
          </span>
        </button>
      </h3>

      <div
        id={panelId}
        aria-hidden={!open}
        className={`faq-collapse ${open ? 'faq-collapse-open' : ''}`}
      >
        <div className="overflow-hidden">
          <p className="pt-[10px] max-w-[680px] text-[13px] text-ruang-muted leading-[1.7]">{answer}</p>
        </div>
      </div>
    </div>
  );
}