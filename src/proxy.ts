import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`, and only picks it up when it
 * sits next to `app/`. This is the entry point for the Better Auth session validation
 * and the guest redirect.
 */
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const GUEST_ROUTES = ['/welcome', '/login', '/register', '/reset-password', '/auth', '/help', '/about'];

  function isGuestRoute(pathname: string) {
    return GUEST_ROUTES.some((route) => pathname.startsWith(route));
  }

  if (
    !session &&
    !isGuestRoute(request.nextUrl.pathname) &&
    // the OAuth consent route sends unauthenticated visitors to the login page
    // itself, so that it can preserve the authorization in the `next` parameter
    request.nextUrl.pathname !== '/oauth/consent'
  ) {
    // no user: land on the dummy walkthrough instead of a blank dashboard
    const url = request.nextUrl.clone();
    url.pathname = '/welcome';
    return NextResponse.redirect(url);
  }

  if (session && (request.nextUrl.pathname === '/welcome' || request.nextUrl.pathname.startsWith('/welcome/'))) {
    // already signed in, no reason to keep looking at the dummy page
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // A signed-in user has no reason to sit on the login or register form either.
  // `?next=` is dropped so it cannot bounce the user straight back here after
  // signing in.
  if (session && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.searchParams.get('next') || '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)'],
};
