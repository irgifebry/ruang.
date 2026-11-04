import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { safeRedirectUri } from '@/lib/safe-redirect';

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`, and only picks it up when it
 * sits next to `app/`. This is the entry point for the Better Auth session validation
 * and the guest redirect.
 */
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const GUEST_ROUTES = ['/welcome', '/login', '/register', '/reset-password', '/auth', '/help', '/about'];

  function isGuestRoute(pathname: string) {
    return GUEST_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
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
  // Validate `?next=` to prevent open redirects; fall back to root.
  if (session && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register')) {
    const rawNext = request.nextUrl.searchParams.get('next');
    const target = safeRedirectUri(rawNext, request.nextUrl.origin, '/');
    const targetPath = new URL(target, request.nextUrl.origin).pathname;
    const destination = targetPath === '/login' || targetPath === '/register' ? '/' : target;
    return NextResponse.redirect(new URL(destination, request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image|twitter-image|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)',
  ],
};
