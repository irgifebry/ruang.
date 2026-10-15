/**
 * Redirect targets taken from the query string (`?next=`, `redirect_uri=`).
 *
 * Anything absolute (`https://evil.test`), protocol-relative (`//evil.test`)
 * or slash-backslash (`/\evil.test`, which browsers normalise to `//`) would
 * hand the redirect to another host, so only same-origin paths survive.
 */

export function safePath(value, fallback = '/') {
  const path = typeof value === 'string' ? value : '';
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return fallback;
  return path;
}

/** An absolute `redirect_uri` is kept only when it points back at this origin. */
export function safeRedirectUri(value, origin, fallback = '/') {
  if (typeof value !== 'string' || value === '') return fallback;
  if (value.startsWith('/')) return safePath(value, fallback);

  try {
    const url = new URL(value);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
