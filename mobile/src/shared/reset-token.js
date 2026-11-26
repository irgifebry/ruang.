/**
 * Better Auth reset tokens are opaque, URL-safe ids (generateId(32)).
 *
 * Reject the shapes that can never be one — blanks, whitespace, control
 * characters and runaway strings — before they reach the API, without guessing
 * an exact alphabet that a future Better Auth version might change. The token
 * itself is never rendered or echoed back in an error message.
 */
const RESET_TOKEN = /^[A-Za-z0-9._~-]{8,512}$/;

export function isValidResetToken(value) {
  return typeof value === 'string' && RESET_TOKEN.test(value);
}
