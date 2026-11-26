/**
 * The one local flag that decides whether a guest sees the carousel.
 *
 * This module is deliberately Expo-free: `src/api/storage.js` is the only
 * module that imports `expo-secure-store`, and callers inject its adapter,
 * the same way `createApiClient` takes a storage adapter. That keeps the flag
 * helpers loadable by `node --test` while the app passes `secureStorage` from
 * `AppShell` and the `/onboarding` route.
 *
 * The flag is a marker, not an account: it is written only when the visitor
 * finishes or skips the carousel, and it never touches the session. A failed
 * read in the shell falls back to "seen" so broken storage cannot trap a
 * returning user in onboarding on every boot.
 */

export const ONBOARDING_KEY = 'ruang.onboarding.seen';
const SEEN_VALUE = '1';

/** The stored value is deliberately narrow — anything else is "not seen". */
export async function hasSeenOnboarding(storage) {
  return (await storage.getItem(ONBOARDING_KEY)) === SEEN_VALUE;
}

/** Stamps the flag. Called once the carousel is completed or skipped. */
export async function setSeenOnboarding(storage) {
  await storage.setItem(ONBOARDING_KEY, SEEN_VALUE);
}
