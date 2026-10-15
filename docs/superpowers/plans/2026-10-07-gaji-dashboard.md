# Gaji Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive React frontend demo for salary budgeting and expense tracking.

**Architecture:** React single-page app with local runtime state and page-level navigation. Keep money calculations in a small pure module; pages consume shared demo data and callbacks from the app shell. No backend, durable storage, or real authentication.

**Tech Stack:** React, existing workspace tooling if present; otherwise minimal Vite React setup. Native CSS and browser APIs; avoid dependencies unless already installed and needed.

**Spec:** `docs/superpowers/specs/2026-10-07-gaji-dashboard-design.md`

## Global Constraints

- Indonesian UI, currency in IDR.
- Dark, futuristic agency-inspired visual direction with restrained bright-green accent and readable contrast.
- Responsive desktop and mobile layouts.
- Demo data clearly labeled; changes exist only in browser runtime.
- Login/Register are visual demo only; no authentication.
- No backend, API, bank integration, or durable storage.

## Review Focus

- Zero or negative salary/budget input: validation prevents nonsensical totals.
- Invalid expense amount or missing category: form reports validation and does not mutate state.
- Long descriptions/category names: transaction rows remain readable at mobile width.
- Empty transaction list or category list: useful empty state and no runtime errors.
- Large IDR values: currency formatting remains readable without overflow.

---

### Task 1: React app shell and responsive visual foundation

**Files:**
- Create or modify project manifest and app entry files based on existing workspace.
- Create: `src/App.jsx`
- Create: `src/styles.css`
- Create: `index.html` if absent.

**Interfaces:**
- Produces: app shell with Dashboard, Transactions, History, Settings, Login, Register navigation states.

- [ ] Inspect workspace files and preserve existing React/tooling setup if present; otherwise initialize minimal Vite React without extra libraries.
- [ ] Create app shell with responsive navigation and demo-data notice; all routes render placeholder page headings.
- [ ] Add CSS tokens, dark futurist visual system, clear focus styles, and mobile layout.
- [ ] Run available build command; verify app loads and navigation switches views.

### Task 2: Demo model and money calculations

**Files:**
- Create: `src/data.js`
- Create: `src/money.js`
- Test: `src/money.test.js` (or a runnable assert check if no test runner exists)

**Interfaces:**
- `formatIDR(value: number): string`
- `getBudgetSummary(salary: number, budgets: Budget[], expenses: Expense[]): Summary`
- Budget shape: `{ id, name, limit }`; Expense shape: `{ id, description, amount, categoryId, date }`.

- [ ] Add failing checks for IDR formatting, category spent/remaining, salary remainder, and zero/negative edge inputs.
- [ ] Run checks and confirm failure.
- [ ] Add realistic but explicitly demo-labeled salary, category budgets, transactions, and two months of history.
- [ ] Implement pure calculation/formatting functions with safe handling for invalid numeric values.
- [ ] Run checks and confirm pass.

### Task 3: Dashboard and budget editing

**Files:**
- Create: `src/pages/Dashboard.jsx`
- Modify: `src/App.jsx`, `src/styles.css`

**Interfaces:**
- Dashboard consumes `{ salary, budgets, expenses, onNavigate }`.
- Uses `getBudgetSummary` and `formatIDR` from Task 2.

- [ ] Render remaining balance, salary, total budget, category progress, and recent expenses.
- [ ] Add clear over-budget state and empty-category state.
- [ ] Verify calculations reflect demo data and layout works at mobile/desktop widths.

### Task 4: Transactions and expense entry

**Files:**
- Create: `src/pages/Transactions.jsx`
- Modify: `src/App.jsx`, `src/styles.css`

**Interfaces:**
- Transactions consumes `{ expenses, budgets, onAddExpense }`.
- `onAddExpense(expense: Expense): void` validates amount/category before updating app runtime state.

- [ ] Render transaction list with date, category, description, and IDR amount.
- [ ] Add labeled form for description, amount, category, and date; show inline errors.
- [ ] Add tests/checks for invalid amount, missing category, and successful add.
- [ ] Verify adding an expense updates dashboard totals and category progress.

### Task 5: History, settings, and demo auth screens

**Files:**
- Create: `src/pages/History.jsx`
- Create: `src/pages/Settings.jsx`
- Create: `src/pages/DemoAuth.jsx`
- Modify: `src/App.jsx`, `src/styles.css`

**Interfaces:**
- History consumes month-indexed demo summaries.
- Settings consumes `{ salary, budgets, onSaveSettings }`.
- DemoAuth accepts `{ mode, onNavigate }`; must state credentials are not created or saved.

- [ ] Render month selector/history from sample data, clearly labeled as demo.
- [ ] Add salary and category budget editing with validation and immediate dashboard update.
- [ ] Render login/register visual screens with explicit demo-only notice; no password handling or auth calls.
- [ ] Verify zero/negative settings reject, empty category state works, and long category labels remain usable on mobile.

### Task 6: Final verification and accessibility pass

**Files:**
- Modify files above only as needed.

- [ ] Run project test/check command and production build; record actual results.
- [ ] Check keyboard navigation, visible focus, form labels/errors, semantic headings, and color contrast.
- [ ] Check narrow mobile and desktop layouts, including long labels and large IDR values.
- [ ] Confirm no data persistence, API calls, or real authentication were added.
