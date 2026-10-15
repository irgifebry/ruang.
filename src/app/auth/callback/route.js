import { NextResponse } from 'next/server';

/**
 * OAuth and email-confirmation landing route.
 *
 * Supabase redirects here with a `?code=` once an email link is followed. The
 * exchange has to happen before the app can read a session, so this route
 * performs it server-side and then forwards to the dashboard.
 *
 * `/reset-password` handles the password-recovery variant of the same link, and
 * the proxy excludes `/auth` from the guest gate so this route can run for a
 * visitor who has no session yet.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  // Only same-origin relative paths, so this cannot be used as an open redirect.
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // The exchange needs the anon client and the visitor's auth cookies. Built
  // inline because importing the app's Supabase client would drag the browser
  // client into an edge-capable server bundle.
  const { createServerClient } = await import('@supabase/ssr');

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=autentikasi-gagal`);
  }

  return NextResponse.redirect(`${origin}${target}`);
}
