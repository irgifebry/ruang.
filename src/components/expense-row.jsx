'use client';

import { barClass, chipClass } from '@/lib/category-colors';
import { formatDateLong, formatIDR, formatIDRCompact } from '@/lib/money';
import { EmptyState } from './ui';

/**
 * A single transaction row — an expense, or an income entry.
 *
 * The layout is a three-column grid rather than nested flex boxes so the amount
 * stays right-aligned and never wraps, and the middle column truncates. The
 * spec's review focus called out long descriptions and large IDR values at
 * mobile width, which this handles: description and category name truncate with
 * an ellipsis, the amount keeps `whitespace-nowrap`, and the full text is
 * available via `title`.
 *
 * A phone is narrower than that budget assumes. `main` and `Panel` take 92px of
 * a 375px screen, and the chip plus the two action buttons take a further 108px,
 * leaving roughly 175px for the description *and* the amount. The amount is
 * `whitespace-nowrap` and cannot wrap, so on a single line the two of them shared
 * those 175px and the description — the only thing that identifies the row — was
 * truncated to a handful of pixels.
 *
 * So below `sm` the row becomes a two-line grid: the amount moves up beside the
 * name and the action buttons drop down beside the metadata, leaving each of the
 * four pieces its own space and nothing to truncate. The amount uses the compact
 * form there because it is the one column that cannot wrap; the exact rupiah is
 * on `title`, and the full figure ships from `sm` up where there is room for it.
 *
 * `kind` is the only difference between the two row types, and it is applied to
 * the three places a reader could otherwise confuse them: the sign, the colour,
 * and the secondary line. Income rows carry a `source` where expenses carry a
 * category, because "where did this money come from" is a label rather than an
 * envelope — there is nothing in the schema to compare a source against.
 */
export function ExpenseRow({ expense, budget, kind, onEdit, onDelete, dense = false, index = 0 }) {
  // `kind` wins when a list is all one kind — that is what the transactions
  // screen's tabs have. A mixed list (the dashboard's "Terbaru") passes no
  // `kind` and lets each row declare its own, so the sign, colour and label of a
  // row never depend on where it happens to sit in a list.
  const isIncome = kind ? kind === 'income' : expense?.direction === 'income';
  const color = isIncome ? 'lime' : budget?.color ?? 'lime';
  const categoryName = isIncome
    ? expense.source || 'Pemasukan'
    : budget?.name ?? 'Tanpa kategori';
  const expenseInitial = isIncome ? '+' : expense.description?.slice(0, 1).toUpperCase() ?? '?';
  const dateValue = isIncome ? expense.received_on : expense.spent_on;
  const amountTone = isIncome ? 'text-ruang-accent-text' : 'text-ruang-ink';

  return (
    /* Three columns on desktop, two rows on a phone. The grid is what makes the
       second line possible: the chip spans both rows in column one, the text
       stacks in column two, and the amount and the action buttons share the
       right edge — so nothing has to be truncated to make room for anything
       else. From `sm` up the grid collapses to the original single-row flex. */
    <div
      className={`row-stagger grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-x-[12px] gap-y-[6px] border-b border-ruang-line sm:flex sm:gap-y-0 ${
        dense ? 'py-[11px]' : 'py-[14px]'
      }`}
      style={{ '--i': index }}
    >
      <span
        className={`w-[30px] h-[30px] row-span-2 sm:row-span-auto grid place-items-center text-[12px] font-semibold ${chipClass(
          color,
        )}`}
        aria-hidden="true"
      >
        {expenseInitial}
      </span>

      {/* `contents` below `sm` dissolves this wrapper so the two lines become grid
          items of the row and can each take a cell of their own. From `sm` up it
          is a real block again, so the two lines stack as they always did. */}
      <div className="contents sm:flex sm:flex-col sm:flex-1 sm:min-w-0">
        <strong
          className="col-start-2 row-start-1 min-w-0 truncate text-[13px] font-medium text-ruang-ink"
          title={expense.description}
        >
          {expense.description}
        </strong>

        <small
          className="col-start-2 row-start-2 min-w-0 mt-[4px] truncate text-ruang-muted text-[12px]"
          title={categoryName}
        >
          {categoryName} <span className="text-ruang-ghost px-[3px]">·</span>
          <time dateTime={dateValue}>{formatDateLong(dateValue)}</time>
        </small>
      </div>

      {/* Full figure from `sm` up, in its own column as before. Below `sm` the
          compact form moves into column three so the name above it keeps the
          whole of column two — placing it in the same cell as the text was what
          made the two overlap. */}
      <strong
        className={`hidden sm:block font-mono text-[13px] ${amountTone} whitespace-nowrap flex-none`}
        title={`${formatIDR(expense.amount)}`}
      >
        {isIncome ? '+' : '−'}
        {formatIDR(expense.amount)}
      </strong>

      <strong
        className={`sm:hidden col-start-3 row-start-1 justify-self-end self-center font-mono text-[13px] ${amountTone} whitespace-nowrap`}
        title={`${formatIDR(expense.amount)}`}
      >
        {isIncome ? '+' : '−'}
        {formatIDRCompact(expense.amount)}
      </strong>

      {(onEdit || onDelete) && (
        /* On the second line of column three, level with the metadata rather than
           floating beside the name. That column is `auto`, so it is as wide as
           the amount — wider than the two 26px buttons — and without
           `justify-self-end` they hug the left of it and leave a ragged gap
           under the amount's right edge. On desktop they return to a single
           centred row, where the column is exactly their own width. */
        <div className="col-start-3 row-start-2 flex items-center justify-self-end gap-[2px] sm:row-start-auto">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(expense)}
              aria-label={`Ubah transaksi ${expense.description}`}
              className="w-[26px] h-[26px] grid place-items-center text-ruang-subtle hover:text-ruang-accent-text rounded-[3px] transition-colors"
            >
              <PencilGlyph />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(expense)}
              aria-label={`Hapus transaksi ${expense.description}`}
              className="w-[26px] h-[26px] grid place-items-center text-ruang-subtle hover:text-ruang-danger-ink rounded-[3px] transition-colors"
            >
              <TrashGlyph />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Inline SVG rather than icon components: at 13px inside a 26px button the
// glyphs need to inherit `currentColor` tightly, and these keep the row free of
// extra library imports.
function PencilGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );
}

/** The whole list, including its empty state. */
export function ExpenseList({ expenses, budgets = [], kind, onEdit, onDelete, dense, emptyLabel }) {
  if (!expenses.length) {
    return <EmptyState>{emptyLabel ?? 'Belum ada transaksi. Catat pengeluaran pertama.'}</EmptyState>;
  }

  const byId = new Map(budgets.map((budget) => [budget.id, budget]));

  return (
    <div className="border-t border-ruang-line">
      {expenses.map((expense, i) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          budget={expense.budgets ?? byId.get(expense.category_id)}
          kind={kind}
          onEdit={onEdit}
          onDelete={onDelete}
          dense={dense}
          index={i}
        />
      ))}
    </div>
  );
}

/**
 * One category's budget usage.
 *
 * Over-budget categories get both a colour change and a text label ("LEBIH
 * 420.000"), because a bar colour on its own is not an accessible signal.
 *
 * The spent/limit pair is `whitespace-nowrap`, so it is the one part of the row
 * that cannot give ground. `Rp 1.500.000 / Rp 1.500.000` is 27 characters of
 * tabular mono: on a phone it took the whole line, truncated the category name
 * to nothing and pushed the percentage past the edge of the card. Three things
 * fix it, all scoped to below `sm` so the desktop row is unchanged — the pair
 * uses the compact form ("Rp 1,5 jt / Rp 1,5 jt"), the name drops to its own
 * line above it, and the over-budget note moved out of the fixed-width
 * percentage column and under the bar, where it has the whole row to itself.
 */
export function CategoryRow({ category, index }) {
  const percent = Math.round(category.percent ?? 0);

  return (
    <div
      className="row-stagger flex items-center gap-[12px] py-[14px] border-b border-ruang-line"
      style={{ '--i': index }}
    >
      <div
        className={`w-[28px] h-[28px] flex-none grid place-items-center font-mono text-[11px] ${chipClass(category.color)}`}
        aria-hidden="true"
      >
        {String(index + 1).padStart(2, '0')}
      </div>

      <div className="flex-1 min-w-0">
        {/* Below `sm` the name and the figure stack instead of sharing a line.
            The pair is `whitespace-nowrap`, so on one line it takes whatever it
            needs and the name — the only thing that identifies the row — is
            what gets truncated to nothing. Stacked, each gets the full width. */}
        <div className="sm:flex sm:items-baseline sm:justify-between sm:gap-[8px]">
          <strong className="block sm:inline min-w-0 text-[13px] font-medium truncate text-ruang-ink" title={category.name}>
            {category.name}
          </strong>

          <span
            className="block sm:inline text-ruang-body font-mono text-[12px] whitespace-nowrap mt-[4px] sm:mt-0 sm:ml-[8px]"
            title={`${formatIDR(category.spent)} dari ${formatIDR(category.limit)}`}
          >
            <span className="sm:hidden">
              {formatIDRCompact(category.spent)} <i className="text-ruang-ghost font-style-normal mx-[3px]">/</i>{' '}
              {formatIDRCompact(category.limit)}
            </span>
            <span className="hidden sm:inline">
              {formatIDR(category.spent)} <i className="text-ruang-ghost font-style-normal mx-[3px]">/</i>{' '}
              {formatIDR(category.limit)}
            </span>
          </span>
        </div>

        <div
          className="h-[3px] bg-ruang-track mt-[10px] sm:mt-[8px]"
          role="progressbar"
          aria-valuenow={Math.min(percent, 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${category.name}: ${percent}% dari batas bulanan terpakai`}
        >
          <span
            className={`bar-grow block h-full ${category.over ? 'bg-ruang-danger' : barClass(category.color)}`}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>

        {category.over && (
          <div className="mt-[8px] text-[11px] text-ruang-danger">
            Lebih <span className="font-mono">{formatIDR(Math.abs(category.remaining))}</span>
          </div>
        )}
      </div>

      <div
        className={`w-[52px] text-right font-mono text-[12px] flex-none self-center ${
          category.over ? 'text-ruang-danger' : 'text-ruang-muted'
        }`}
      >
        {percent}%
      </div>
    </div>
  );
}
