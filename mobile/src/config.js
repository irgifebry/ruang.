export const DEFAULT_API_URL = 'https://ruang-cashflow.vercel.app';

// The avatars bucket is public, so this project URL is not a secret — it is the
// same value the web app builds its avatar URLs from. Keeping it here means a
// fresh mobile install shows uploaded photos without an extra setup step.
export const DEFAULT_AVATAR_STORAGE_URL = 'https://bqgxiiuaefbnxslzkoek.supabase.co';

/**
 * Base URL of the ruang HTTP API.
 *
 * `apiUrl` (from the caller) wins over `EXPO_PUBLIC_API_URL` (from `.env.local`);
 * otherwise the production default is used. The result never has a trailing slash.
 */
export function apiBaseURL({ apiUrl } = {}) {
  const raw = apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;
  return String(raw).replace(/\/+$/, '');
}

/**
 * Base URL of the Storage API that serves `/avatars`.
 *
 * This is deliberately *not* `apiBaseURL()`: the Next.js app only stores the
 * path and the object itself lives on Supabase. Pointing the image at the app
 * origin would render a 404 page in an `<Image>` instead of the user's photo.
 * `EXPO_PUBLIC_SUPABASE_URL` overrides the deployed default for a self-hosted
 * project. The result never has a trailing slash.
 */
export function avatarBaseURL({ supabaseUrl } = {}) {
  const raw = supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? DEFAULT_AVATAR_STORAGE_URL;
  return String(raw).replace(/\/+$/, '');
}
