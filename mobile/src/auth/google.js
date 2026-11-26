/**
 * Native Google sign-in for the ruang app — the native mirror of the web's
 * `signIn.social` flow.
 *
 * `configureGoogle` and `signInWithGoogle` dynamically import
 * `@react-native-google-signin/google-signin`: the package's entry points
 * use Metro-style extensionless imports, so a static import would break
 * this module under plain `node --test` — and `buildSocialPayload` must stay
 * pure.
 *
 * Run the payload tests with: cd mobile && node --test tests/google.test.mjs
 */

const CALLBACK_URL = 'ruang://oauth-return';

/**
 * Builds the payload handed to the HTTP client for a native Google sign-in:
 * the provider, the idToken plus any SDK nonce, and the app scheme the OAuth
 * return lands in.
 *
 * Pure — no SDK imports, and a missing `nonce` stays `undefined` on the
 * payload rather than being dropped: the web form posts the key too.
 *
 * @throws when `idToken` is missing or blank.
 */
export function buildSocialPayload({ idToken, nonce } = {}) {
  const token = typeof idToken === 'string' ? idToken.trim() : '';
  if (!token) throw new Error('Google idToken tidak ditemukan');
  return {
    provider: 'google',
    idToken: { token, nonce },
    callbackURL: CALLBACK_URL,
  };
}

async function loadGoogleSignin() {
  return import('@react-native-google-signin/google-signin');
}

/**
 * Registers the two Google client IDs with the native SDK.
 */
export async function configureGoogle({ webClientId, iosClientId } = {}) {
  const { GoogleSignin } = await loadGoogleSignin();
  GoogleSignin.configure({ webClientId, iosClientId });
}

/**
 * Runs the native sign-in flow and returns the credential pieces.
 *
 * @returns `{ idToken, nonce }` — the idToken the native flow returns and
 * the nonce, when the SDK supplies one (it is `undefined` otherwise).
 *
 * @throws when the user cancels, the flow fails, or no idToken comes back.
 */
export async function signInWithGoogle() {
  const { GoogleSignin } = await loadGoogleSignin();

  const response = await GoogleSignin.signIn();
  if (response?.type !== 'success' || !response.data) {
    throw new Error('Google sign-in gagal atau dibatalkan');
  }

  let { idToken } = response.data;
  if (!idToken) {
    const tokens = await GoogleSignin.getTokens();
    idToken = tokens?.idToken;
  }
  if (!idToken) {
    throw new Error('Google sign-in tidak memberikan idToken');
  }

  return { idToken, nonce: response.data?.nonce };
}
