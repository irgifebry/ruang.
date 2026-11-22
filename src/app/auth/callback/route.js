import { NextResponse } from 'next/server';

/**
 * There is no code exchange at this path any more. The real OAuth callback is
 * Better Auth's `/api/auth/callback/google`, reached through the catch-all
 * `/api/auth/[...all]` route.
 *
 * Keep a redirect here rather than deleting the route: old bookmarks, emails
 * and documentation still point at `/auth/callback`, and a 404 there would look
 * like a broken deployment. A single redirect with a fixed error code gives a
 * clear failure without pretending to support a flow we deliberately removed.
 * The `code` query parameter is ignored on purpose — nothing consumes it here.
 */
export async function GET(request) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '?error=autentikasi-tidak-didukung';
  return NextResponse.redirect(url);
}
