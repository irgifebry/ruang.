/**
 * Renders the page and component modules to confirm they actually produce
 * markup.
 *
 * A green `next build` proves the modules parse, not that they render: a bad
 * destructuring shape or an undefined lookup still compiles. These tests render
 * the presentational pieces with realistic data, including the edge cases the
 * spec called out — empty lists, zero salary, over-budget categories, long
 * labels and large amounts.
 *
 * Usage: node tests/render.test.jsx
 *
 * Requires a JSX loader, which node does not provide. Run through the alias in
 * package.json or convert with the helper below.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { formatIDR, getBudgetSummary } from '../src/lib/money.js';

const {
  ExpenseList,
  CategoryRow,
} = await import('../src/components/expense-row.jsx');

const {
  EmptyState,
  Eyebrow,
  ErrorState,
  LoadingState,
  Panel,
} = await import('../src/components/ui.jsx');

const { ConfirmDialog } = await import('../src/components/confirm-dialog.jsx');

const { Toast } = await import('../src/components/toast.jsx');

const { AllocationDonut, SpendChart } = await import('../src/components/charts.jsx');

const { spendByDay, spendByMonth } = await import('../src/lib/charts.js');

const budgets = [
  { id: 'food', name: 'Makan & minum', monthly_limit: 1_000_000, color: 'lime' },
  { id: 'home', name: 'Tempat tinggal', monthly_limit: 2_000_000, color: 'blue' },
];

test('ExpenseList renders rows with amounts and dates', () => {
  const html = renderToStaticMarkup(
    React.createElement(ExpenseList, {
      expenses: [
        { id: '1', description: 'Belanja mingguan', amount: 385_000, spent_on: '2026-10-07', category_id: 'food' },
      ],
      budgets,
    }),
  );

  assert.match(html, /Belanja mingguan/);
  assert.match(html, /Makan &amp; minum/);
  assert.match(html, /385\.000/);
  assert.match(html, /7 Oktober 2026/);
});

test('ExpenseList renders the empty state instead of nothing', () => {
  const html = renderToStaticMarkup(
    React.createElement(ExpenseList, { expenses: [], budgets }),
  );
  assert.match(html, /Belum ada transaksi/);
});

test('ExpenseList accepts a custom empty message', () => {
  const html = renderToStaticMarkup(
    React.createElement(ExpenseList, { expenses: [], budgets, emptyLabel: 'Tidak ada yang cocok.' }),
  );
  assert.match(html, /Tidak ada yang cocok/);
});

test('ExpenseList survives an expense whose category is missing', () => {
  const html = renderToStaticMarkup(
    React.createElement(ExpenseList, {
      expenses: [{ id: '1', description: 'Yatim', amount: 1000, spent_on: '2026-10-07', category_id: 'gone' }],
      budgets,
    }),
  );
  // Falls back rather than throwing on an undefined category.
  assert.match(html, /Tanpa kategori/);
});

test('ExpenseList truncates a very long description instead of overflowing', () => {
  const long = 'Belanja ' + 'sangat '.repeat(40) + 'panjang';
  const html = renderToStaticMarkup(
    React.createElement(ExpenseList, {
      expenses: [{ id: '1', description: long, amount: 1_000_000, spent_on: '2026-10-07', category_id: 'food' }],
      budgets,
    }),
  );

  assert.match(html, /truncate/);
  // The full text is preserved for the title attribute / screen readers.
  assert.ok(html.includes(long));
});

test('ExpenseList keeps a very large amount on one line', () => {
  const html = renderToStaticMarkup(
    React.createElement(ExpenseList, {
      expenses: [{ id: '1', description: 'Beli', amount: 9_876_543_210, spent_on: '2026-10-07', category_id: 'food' }],
      budgets,
    }),
  );
  assert.match(html, /9\.876\.543\.210/);
  assert.match(html, /whitespace-nowrap/);
});

test('CategoryRow marks an over-budget category in text, not colour alone', () => {
  const summary = getBudgetSummary(5_000_000, budgets, [{ category_id: 'food', amount: 1_400_000 }]);
  const food = summary.categories.find((category) => category.id === 'food');

  const html = renderToStaticMarkup(React.createElement(CategoryRow, { category: food, index: 0 }));

  assert.match(html, /Lebih/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="100"/);
});

test('CategoryRow on a zero-limit category does not claim to be over budget', () => {
  const summary = getBudgetSummary(1_000_000, [
    { id: 'misc', name: 'Lainnya', monthly_limit: 0, color: 'pink' },
  ], []);

  const html = renderToStaticMarkup(
    React.createElement(CategoryRow, { category: summary.categories[0], index: 0 }),
  );

  assert.doesNotMatch(html, /Lebih/);
});

test('CategoryRow label survives a long category name', () => {
  const summary = getBudgetSummary(1_000_000, [
    { id: 'x', name: 'Kategori dengan nama yang sangat panjang sekali', monthly_limit: 1000, color: 'violet' },
  ], []);

  const html = renderToStaticMarkup(
    React.createElement(CategoryRow, { category: summary.categories[0], index: 0 }),
  );

  assert.match(html, /Kategori dengan nama yang sangat panjang sekali/);
  assert.match(html, /truncate/);
});

test('Panel accepts an id so it can be a scroll target', () => {
  const html = renderToStaticMarkup(
    React.createElement(Panel, { id: 'form-transaksi' }, 'isi'),
  );
  assert.match(html, /id="form-transaksi"/);
  assert.match(html, /isi/);
});

test('Eyebrow and EmptyState render their content', () => {
  assert.match(renderToStaticMarkup(React.createElement(Eyebrow, null, 'JUDUL')), /JUDUL/);
  assert.match(
    renderToStaticMarkup(React.createElement(EmptyState, null, 'Kosong')),
    /Kosong/,
  );
});

test('LoadingState announces itself as a status', () => {
  const html = renderToStaticMarkup(React.createElement(LoadingState, { label: 'Memuat...' }));
  assert.match(html, /role="status"/);
  assert.match(html, /Memuat/);
});

test('ErrorState escapes its message rather than injecting markup', () => {
  const html = renderToStaticMarkup(
    React.createElement(ErrorState, { message: '<script>alert(1)</script>' }),
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('ConfirmDialog renders nothing while closed', () => {
  assert.equal(renderToStaticMarkup(React.createElement(ConfirmDialog, { open: false })), '');
});

test('ConfirmDialog is a modal alertdialog with a labelled title and description', () => {
  const html = renderToStaticMarkup(
    React.createElement(ConfirmDialog, {
      open: true,
      title: 'Hapus transaksi ini?',
      description: '"Belanja" sebesar Rp385.000 akan dihapus permanen.',
      confirmLabel: 'Hapus transaksi',
    }),
  );

  assert.match(html, /role="alertdialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="/);
  assert.match(html, /aria-describedby="/);
  assert.match(html, /Hapus transaksi ini\?/);
  assert.match(html, /Hapus transaksi/);
  assert.match(html, /Batal/);
});

test('ConfirmDialog keeps its description text on its own lines', () => {
  const html = renderToStaticMarkup(
    React.createElement(ConfirmDialog, {
      open: true,
      title: 'Hapus kategori "Makan"?',
      description: '3 transaksi ikut terhapus.\n\nTidak bisa dikembalikan.',
    }),
  );

  // The browser popup broke the message over a blank line; keeping that needs
  // whitespace-pre-line, otherwise the sentences run together.
  assert.match(html, /whitespace-pre-line/);
});

test('ConfirmDialog stops a long category name from pushing the panel wide', () => {
  const html = renderToStaticMarkup(
    React.createElement(ConfirmDialog, {
      open: true,
      title: `Hapus kategori "${'kategori '.repeat(20)}"?`,
    }),
  );

  assert.match(html, /max-w-\[420px\]/);
  assert.match(html, /break-words/);
});

test('ConfirmDialog marks the destructive action, not the safe one', () => {
  const html = renderToStaticMarkup(
    React.createElement(ConfirmDialog, { open: true, title: 'Hapus?', confirmLabel: 'Hapus' }),
  );

  // The destructive action takes the danger fill while the cancel button stays on
  // the neutral outline, so the two never look equally weighted.
  assert.match(html, /bg-ruang-danger-ink/);
  assert.match(html, /hover:bg-ruang-danger-hover/);
});

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

test('Toast renders nothing while closed', () => {
  assert.equal(renderToStaticMarkup(React.createElement(Toast, { open: false })), '');
});

test('Toast announces itself politely rather than interrupting', () => {
  const html = renderToStaticMarkup(
    React.createElement(Toast, { open: true, title: 'Sesi berakhir' }, 'Kamu dikeluarkan.'),
  );

  // A visitor may be mid-word in the email field. `role="status"` mentions the
  // message without taking focus or interrupting; `alert` would interrupt, and
  // `alertdialog` would demand the form be dealt with first.
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.equal(/aria-modal/.test(html), false);
  assert.match(html, /Sesi berakhir/);
  assert.match(html, /Kamu dikeluarkan\./);
});

test('Toast is out of the way of the page it floats over', () => {
  const html = renderToStaticMarkup(React.createElement(Toast, { open: true }, 'Halo'));

  // Fixed and anchored to the bottom, so it never reserves layout: the form
  // behind must keep exactly the shape it had before the message arrived.
  assert.match(html, /fixed/);
  assert.match(html, /bottom-/);
  assert.equal(/class="[^"]*mb-\[18px\]/s.test(html), false);
});

test('Toast ties its progress bar to the same duration as its timer', () => {
  // Two independent numbers would drift, and the bar would sit there claiming
  // time that is left after the toast has already gone.
  const html = renderToStaticMarkup(
    React.createElement(Toast, { open: true, duration: 5000 }, 'Halo'),
  );

  assert.match(html, /--toast-duration:5000ms/);
  assert.match(html, /toast-progress/);
});

test('Toast can be dismissed by a pointer', () => {
  const html = renderToStaticMarkup(
    React.createElement(Toast, { open: true, onDismiss: () => {} }, 'Halo'),
  );

  // The auto-dismiss is the primary exit, but eight seconds is a long time to be
  // held by a message, so there is a real button with a real label.
  assert.match(html, /aria-label="Tutup notifikasi"/);
  assert.match(html, /<button/);
});

// ---------------------------------------------------------------------------
// Account deletion
//
// The panel has to state the grace period on the card itself, not only inside
// the dialog: a user who reads "Hapus akun" and stops there should already know
// the act is reversible.
// ---------------------------------------------------------------------------

test('DeleteAccountPanel names the grace period on the panel, not only in the dialog', async () => {
  const { DeleteAccountPanel } = await import('../src/components/DeleteAccountPanel.jsx');

  const html = renderToStaticMarkup(React.createElement(DeleteAccountPanel));

  assert.match(html, /Hapus akun/);
  assert.match(html, /7 hari/);
  // The reassuring half is the one that has to survive truncation.
  assert.match(html, /masuk lagi dan semuanya kembali/);
});

test('DeleteAccountPanel marks the request as destructive, not as a save', async () => {
  const { DeleteAccountPanel } = await import('../src/components/DeleteAccountPanel.jsx');

  const html = renderToStaticMarkup(React.createElement(DeleteAccountPanel));

  assert.match(html, /bg-ruang-danger-ink/);
});

// ---------------------------------------------------------------------------
// Charts
//
// The edge cases here are the ones the render tests exist for: a user with no
// budgets at all, a colour the database has never heard of, and a category name
// long enough to push the legend wide.
// ---------------------------------------------------------------------------

const allocation = [
  { id: 'food', name: 'Makan & minum', value: 2_400_000, color: 'lime' },
  { id: 'home', name: 'Tempat tinggal', value: 3_000_000, color: 'blue' },
  { id: 'bills', name: 'Tagihan', value: 950_000, color: 'violet' },
];

test('AllocationDonut names every category and its share, not just colours', () => {
  const html = renderToStaticMarkup(React.createElement(AllocationDonut, { categories: allocation }));

  assert.match(html, /Makan &amp; minum/);
  assert.match(html, /Tempat tinggal/);
  assert.match(html, /Tagihan/);
  // Largest-first, so the biggest wedge leads both the ring and the legend.
  assert.match(html, /Tempat tinggal[\s\S]*?Makan &amp; minum/);
  // Shares are in the markup, so the chart does not rely on telling colours
  // apart: 3.0 / 2.4 / 0.95 of a 6.35 total.
  assert.match(html, /47%/);
  assert.match(html, /38%/);
  assert.match(html, /15%/);
});

test('AllocationDonut exposes the chart as an image with a summary label', () => {
  const html = renderToStaticMarkup(React.createElement(AllocationDonut, { categories: allocation }));

  assert.match(html, /role="img"/);
  assert.match(html, /Alokasi anggaran per kategori/);
  // One <path> per category, plus the empty track circle.
  assert.equal((html.match(/<path/g) ?? []).length, 3);
});

test('AllocationDonut renders the empty state rather than a blank ring', () => {
  const html = renderToStaticMarkup(
    React.createElement(AllocationDonut, { categories: [], emptyLabel: 'Belum ada kategori.' }),
  );

  // A ring drawn from nothing reads as a rendering failure, not an empty month.
  assert.match(html, /Belum ada kategori/);
  assert.doesNotMatch(html, /<path/);
});

test('AllocationDonut falls back rather than blanking on an unknown colour', () => {
  // The colour column is a plain string in Postgres; a new value must not
  // produce an SVG with no fill.
  const html = renderToStaticMarkup(
    React.createElement(AllocationDonut, {
      categories: [{ id: 'x', name: 'Aneka', value: 1000, color: 'chartreuse' }],
    }),
  );

  assert.match(html, /<path/);
  assert.match(html, /fill="rgb\(var\(--c-accent\)\)"/);
});

test('AllocationDonut truncates a very long category name', () => {
  const html = renderToStaticMarkup(
    React.createElement(AllocationDonut, {
      categories: [{ id: 'x', name: 'Kategori ' + 'panjang '.repeat(30), value: 1000, color: 'pink' }],
    }),
  );

  assert.match(html, /truncate/);
});

test('SpendChart scales bars against a rounded axis, and the tallest one reaches the top', () => {
  const html = renderToStaticMarkup(
    React.createElement(SpendChart, {
      series: spendByDay(
        [
          { spent_on: '2026-10-02', amount: 500_000 },
          { spent_on: '2026-10-05', amount: 1_000_000 },
        ],
        '2026-10',
      ),
    }),
  );

  // Gridlines sit on the rounded ceiling, so the peak bar has to touch it or the
  // chart is quietly undersized.
  assert.match(html, /height:100%/);
  assert.match(html, /height:50%/);
});

test('SpendChart keeps a spent day visible but leaves an unspent one at zero', () => {
  const html = renderToStaticMarkup(
    React.createElement(SpendChart, {
      series: [
        { label: '1', value: 0 },
        // A sliver against a much larger peak still has to be visible, or a
        // small expense is indistinguishable from no expense at all.
        { label: '2', value: 1_000 },
        { label: '3', value: 500_000 },
      ],
    }),
  );

  const heights = [...html.matchAll(/height:([\d.]+)%/g)].map((match) => Number(match[1]));
  assert.ok(heights.includes(0));
  assert.ok(heights.some((height) => height > 0 && height < 5));
  assert.ok(heights.includes(100));
});

test('SpendChart exposes every value to a screen reader', () => {
  const html = renderToStaticMarkup(
    React.createElement(SpendChart, {
      series: [{ label: '1', value: 385_000 }],
      axisLabel: (point) => `Tanggal ${point.label}`,
    }),
  );

  // The bars are colour and geometry; the numbers have to be in the text too.
  // `\s` because id-ID writes a non-breaking space between the symbol and digits.
  assert.match(html, /Tanggal 1: Rp\s385\.000/);
});

test('SpendChart marks the active granularity instead of only colouring it', () => {
  const html = renderToStaticMarkup(
    React.createElement(SpendChart, { series: [{ label: '1', value: 100 }], granularity: 'month' }),
  );

  assert.match(html, /aria-pressed="true"[\s\S]*?BULAN/);
  assert.match(html, /aria-pressed="false"[\s\S]*?HARI/);
});

test('SpendChart renders the empty state for a month with nothing in it', () => {
  const html = renderToStaticMarkup(
    React.createElement(SpendChart, { series: spendByDay([], '2026-10') }),
  );

  // Thirty-one empty bars would draw a grid with nothing on it, which looks
  // like a broken chart rather than a quiet month.
  assert.match(html, /Belum ada pengeluaran pada rentang ini/);
  assert.doesNotMatch(html, /<li/);
});

test('SpendChart thins the axis labels on a long daily series', () => {
  const html = renderToStaticMarkup(
    React.createElement(SpendChart, { series: spendByDay([{ spent_on: '2026-10-01', amount: 1000 }], '2026-10') }),
  );

  // 31 day numbers side by side would overlap into a grey band.
  const labels = [...html.matchAll(/<span class="flex-1 min-w-0 text-center[^"]*">([^<]*)</g)];
  const shown = labels.filter((match) => match[1].trim() !== '');
  assert.ok(shown.length < 31);
  assert.ok(shown.length >= 7);
});

test('SpendChart labels a monthly series by month, not by number', () => {
  const html = renderToStaticMarkup(
    React.createElement(SpendChart, {
      series: spendByMonth([{ spent_on: '2026-10-05', amount: 900_000 }], '2026-10', 3),
      granularity: 'month',
      axisLabel: (point) => point.key,
    }),
  );

  assert.match(html, /2026-08/);
  assert.match(html, /2026-10/);
});