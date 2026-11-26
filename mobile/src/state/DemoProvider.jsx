/**
 * Guest demo state — one local flag and one local dataset.
 *
 * Mounted in the root layout inside Theme/Session, so it is available to the
 * onboarding route (which calls `enterDemo` from "Lihat-lihat dulu"), to
 * `AppShell` (which stops redirecting a demo guest), and to every ledger
 * screen (which will pass `data` into `useLedgerData`). Entering demo never
 * signs in, and leaving it only clears the flag — it never touches the
 * session or writes to the API.
 *
 * `data` is built once and kept in state: a stable object identity matters
 * because screens hand it to hooks that cache by reference.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { buildDemoData } from '../shared/demo-data.js';

const DemoContext = createContext(null);

export function DemoProvider({ children }) {
  const [isDemo, setIsDemo] = useState(false);
  const [data] = useState(() => buildDemoData());

  const enterDemo = useCallback(() => setIsDemo(true), []);
  const exitDemo = useCallback(() => setIsDemo(false), []);

  const value = useMemo(
    () => ({ isDemo, data, enterDemo, exitDemo }),
    [isDemo, data, enterDemo, exitDemo],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error('useDemo must be used inside DemoProvider');
  }
  return context;
}
