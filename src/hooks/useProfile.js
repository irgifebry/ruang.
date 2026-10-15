'use client';

import { useEffect, useState } from 'react';

/**
 * The signed-in user's own `profiles` row, read once per user and shared by
 * every component that shows it.
 *
 * The mobile drawer unmounts whenever it closes, so a `UserBlock` that kept its
 * own copy of the profile re-ran the read on every open: the name, the email and
 * the photo fell back to the placeholder and snapped back a moment later. The
 * cache lives here, outside React, so a remount resolves from it on the first
 * render and never refetches.
 *
 * Nothing is cached during the server render or the first client render — the
 * read only starts in an effect — so the two still agree and hydration does not
 * discard the tree. `resolved` stays the gate for exactly that reason.
 */
let cache = { userId: null, profile: null, resolved: false, version: 0 };
let inflight = null;
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

function startLoad(userId) {
  if (inflight) return inflight;

  inflight = fetch('/api/ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'fetchProfile' }),
  })
    .then((res) => res.json())
    .then((data) => {
      cache = { ...cache, userId, profile: data ?? null, resolved: true };
    })
    // A failed read must not leave the block stuck on the placeholder, which
    // would look like a signed-out user while they are signed in. Whatever was
    // last known stays on screen.
    .catch(() => {
      cache = { ...cache, userId, resolved: true };
    })
    .finally(() => {
      inflight = null;
      notify();
    });

  return inflight;
}

/**
 * Re-reads the profile and tells every subscriber, without blanking the copy
 * already on screen. Call after a write, so a name or avatar change made on the
 * profile page reaches the sidebar too.
 *
 * `version` ticks on every such read. The avatar object keeps its path when it
 * is replaced, so the sidebar has to change the URL or the browser serves the
 * previous photo from its own cache — the same reason the profile page appends
 * its own `?v=`.
 */
export function refreshProfile() {
  if (!cache.userId || inflight) return;
  cache = { ...cache, version: cache.version + 1 };
  startLoad(cache.userId);
}

/**
 * Returns `{ profile, resolved, version }` for the given user id.
 *
 * `resolved` is false while there is nothing to show — during SSR, on the first
 * client render, and whenever the account changes. It is true for a signed-out
 * visitor with no session, so the block still renders its placeholder.
 */
export function useProfile(userId) {
  const [, rerender] = useState(0);

  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      // No session is a settled answer, not a pending one.
      if (cache.userId !== null) {
        cache = { userId: null, profile: null, resolved: true, version: 0 };
        notify();
      }
      return;
    }
    if (cache.userId === userId && cache.resolved) return;
    startLoad(userId);
  }, [userId]);

  const mine = cache.userId === userId;
  return {
    profile: mine ? cache.profile : null,
    resolved: mine && cache.resolved,
    version: mine ? cache.version : 0,
  };
}