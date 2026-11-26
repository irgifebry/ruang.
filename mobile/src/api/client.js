/**
 * The one HTTP client every mobile screen uses.
 *
 * Everything that touches the outside goes through `request()`: a JSON body,
 * `Origin` on every call, the stored bearer token and — for public endpoints
 * (`auth: false`) — the captcha header. A 401 is handled here: the stored
 * token is cleared and `onUnauthorized()` fires once, and the caller still
 * gets the `ApiError`, so screens never silently keep a stale session.
 *
 * This module is pure logic over injected dependencies — `fetchImpl` and the
 * storage adapter are constructor arguments — so it runs under plain
 * `node --test` with no Expo runtime. `storage.js` is the only place that
 * imports `expo-secure-store`.
 */

import { DEFAULT_API_URL } from '../config.js';

export const TOKEN_KEY = 'ruang.token';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function parseBaseURL(baseURL) {
  const url = new URL(baseURL); // throws TypeError for relative or invalid input
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`baseURL must be an absolute http(s) URL: ${baseURL}`);
  }
  return url;
}

/**
 * A multipart body must reach fetch untouched: `JSON.stringify` would turn it
 * into `{}`, and a hand-set `Content-Type: application/json` would hide the
 * boundary React Native generates from the FormData. Duck-typed rather than an
 * `instanceof FormData` check, because the platform supplies the constructor.
 */
function isMultipart(body) {
  return Boolean(body) && typeof body === 'object' && !Array.isArray(body) &&
    typeof body.append === 'function';
}

export function createApiClient({
  baseURL,
  fetchImpl,
  storage,
  getCaptchaToken,
  onUnauthorized,
} = {}) {
  // An empty `EXPO_PUBLIC_API_URL` normalizes to the production default
  // (`apiBaseURL()` is the single source of the URL, but it passes `''`
  // through for an empty env var).
  const base =
    baseURL == null || String(baseURL).trim() === '' ? DEFAULT_API_URL : String(baseURL);

  // One code path for both callers: `requestRaw` returns the response object
  // (`{ status, ok, headers, body }`), and `request` unwraps the parsed JSON —
  // restoring the Task 5 contract that ledger reads rely on while still
  // exposing the response headers (the `set-auth-token` the bearer plugin
  // writes on auth endpoints) to callers that need them.
  async function requestRaw(
    pathPart,
    { method = 'POST', body, auth = true, captcha = false } = {}
  ) {
    // Rejects a relative or invalid base URL: `new URL()` throws TypeError,
    // which surfaces here as a rejected promise.
    const url = parseBaseURL(base);
    const multipart = isMultipart(body);
    const headers = {
      Origin: url.origin,
      // The server keeps Turnstile for browsers and skips it for this client.
      // No security-sensitive value is sent — rate limits still apply.
      'x-ruang-app': '1',
      // Fetch sets multipart/form-data with its own boundary when the body is
      // a FormData; pinning JSON here would make every upload a 415.
      ...(multipart ? {} : { 'Content-Type': 'application/json' }),
    };

    if (auth) {
      const token = await storage.getItem(TOKEN_KEY);
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    if (captcha && getCaptchaToken) {
      const captchaToken = await getCaptchaToken();
      if (captchaToken) headers['x-captcha-response'] = captchaToken;
    }

    const response = await fetchImpl(`${base.replace(/\/+$/, '')}${pathPart}`, {
      method,
      headers,
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // A non-JSON error body is fine — the status decides what is thrown.
    }

    if (response.status === 401) {
      await storage.removeItem(TOKEN_KEY);
      if (onUnauthorized) {
        try {
          await onUnauthorized();
        } catch {
          // The 401 error is what the caller must see, not a callback failure.
        }
      }
      throw new ApiError(response.status, payload?.error ?? 'Sesi tidak ditemukan.');
    }

    if (!response.ok) {
      throw new ApiError(response.status, payload?.error ?? `HTTP ${response.status}`);
    }

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers ?? {},
      body: payload,
    };
  }

  async function request(pathPart, options = {}) {
    return (await requestRaw(pathPart, options)).body;
  }

  return {
    request,
    requestRaw,
    async setToken(token) {
      await storage.setItem(TOKEN_KEY, token);
    },
    async getToken() {
      return storage.getItem(TOKEN_KEY);
    },
    async clearToken() {
      await storage.removeItem(TOKEN_KEY);
    },
  };
}
