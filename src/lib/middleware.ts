import { NextResponse, type NextRequest } from 'next/server';

/**
 * @deprecated DEAD CODE - DO NOT USE
 *
 * Next.js 16 uses `src/proxy.ts` (App Router proxy entry) with Better Auth
 * (`auth.api.getSession`). This Supabase auth middleware is legacy and retained
 * as a safe no-op fallback so accidental imports do not crash or kick users out.
 */
export async function updateSession(request: NextRequest) {
  return NextResponse.next({
    request,
  });
}
