# Gaji Dashboard Frontend Design

## Goal

Build a React frontend for one person to plan a monthly budget from salary and track spending. Initial release is a frontend demo; it does not provide real accounts or persistent data storage.

## Scope

- Dashboard: current-month balance, budget progress by category, and recent transactions.
- Transactions: list, add, and categorize expenses.
- Monthly history: review prior months using demo data.
- Settings: edit monthly salary and budget categories.
- Login and registration screens: visual demo only; no authentication.
- Responsive layout for desktop and mobile, Indonesian UI, IDR currency formatting.
- Futuristic agency-inspired visual direction: dark surfaces, bold typography, asymmetrical composition, restrained bright-green accent; preserve legibility.

## Architecture and behavior

- React single-page application with page-level navigation for Dashboard, Transactions, History, and Settings, plus demo Login/Register screens.
- Keep demo data and interactive form state in the browser runtime. No server, API, authentication, or cross-session persistence.
- Changing salary, categories, or transactions updates displayed totals and budget progress immediately.
- Seed data must be clearly presented as demo data.
- Use the existing project setup if present; otherwise choose the smallest conventional React setup compatible with the workspace. Do not add backend dependencies.

## Acceptance criteria

1. User can navigate all in-scope screens.
2. User can change salary and category budgets and see dashboard totals update.
3. User can add an expense with amount, category, date, and description; totals and category progress update.
4. Monthly history shows sample month data without implying it is persisted user data.
5. Layout remains usable on narrow mobile and desktop viewports, with accessible labels, keyboard focus, and readable contrast.
6. Login/Register are explicitly demo-only and do not imply secure account creation.

## Out of scope

Real authentication, database/API, account sync, bank integration, and durable storage.
