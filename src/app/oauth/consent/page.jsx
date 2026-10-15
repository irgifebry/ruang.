'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/client';
import { safePath, safeRedirectUri } from '@/lib/safe-redirect';
import { Button, GhostButton } from '@/components/form';
import { LoadingState, Panel } from '@/components/ui';

/**
 * OAuth authorization consent screen.
 *
 * The proxy lets guests reach this route (`src/lib/middleware.ts`) so the whole
 * request, including `next`, can be carried through sign-in; the middleware
 * cannot do the redirect itself because whether a session exists in the
 * browser is only known here. Scopes are shown verbatim from the query string
 * — this project registers no OAuth clients, so there is nothing to look up.
 */

const SCOPE_LABELS = {
  openid: 'Identitas dasar akunmu',
  email: 'Alamat email akunmu',
  profile: 'Nama dan foto profil',
};

const FALLBACK_SCOPES = ['Identitas dasar akunmu (email dan nama profil)'];

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<LoadingState label="Memuat permintaan akses..." />}>
      <ConsentScreen />
    </Suspense>
  );
}

function ConsentScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabaseRef = useRef(null);
  if (supabaseRef.current === null) supabaseRef.current = createClient();

  const [ready, setReady] = useState(false);

  const query = searchParams.toString();
  const backTo = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    let active = true;
    supabaseRef.current.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        router.replace(`/login?next=${encodeURIComponent(backTo)}`);
      } else {
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [router, backTo]);

  if (!ready) return <LoadingState label="Memuat permintaan akses..." />;

  const clientId = searchParams.get('client_id') || 'Aplikasi pihak ketiga';
  const nextPath = safePath(searchParams.get('next'));
  const state = searchParams.get('state');
  const rawScopes = (searchParams.get('scope') || '').split(' ').filter(Boolean);
  const scopes = rawScopes.length
    ? rawScopes.map((scope) => SCOPE_LABELS[scope] || `Izin "${scope}"`)
    : FALLBACK_SCOPES;

  const handleAllow = () => {
    const redirectUri = searchParams.get('redirect_uri');
    const target = redirectUri
      ? safeRedirectUri(redirectUri, window.location.origin, nextPath)
      : nextPath;
    const url = new URL(target, window.location.origin);
    if (state && !url.searchParams.has('state')) url.searchParams.set('state', state);
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  };

  const handleDeny = () => {
    router.replace(nextPath);
    router.refresh();
  };

  return (
    <div className="py-[34px] max-w-[640px] mx-auto" id="konten">
      <header className="mb-section">
        <h1 className="text-[clamp(34px,4.5vw,52px)] tracking-[-0.065em] leading-[1.12] font-medium mb-[10px]">
          Izinkan <em className="font-normal italic text-ruang-accent-text">akses?</em>
        </h1>
        <p className="text-[14px] text-ruang-muted leading-[1.6] break-words">
          <strong className="text-ruang-ink font-medium">{clientId}</strong> minta izin buat
          akses akun ruang. milikmu.
        </p>
      </header>

      <Panel>
        <span className="font-mono text-[11px] tracking-[0.08em] text-ruang-muted uppercase">Yang diminta</span>
        <ul className="mt-[13px] flex flex-col gap-[10px]">
          {scopes.map((scope) => (
            <li key={scope} className="flex items-start gap-[10px] text-[13px] text-ruang-body leading-[1.5]">
              <span className="w-[6px] h-[6px] bg-ruang-accent flex-none mt-[7px]" />
              {scope}
            </li>
          ))}
        </ul>

        <p className="mt-[18px] text-[12px] text-ruang-subtle leading-[1.65]">
          Kamu bisa tolak kapan aja. Tolak berarti balik ke halaman sebelumnya tanpa izin
          tambahan.
        </p>

        <div className="flex flex-wrap gap-[11px] mt-[20px]">
          <Button type="button" onClick={handleAllow}>
            Izinkan akses
          </Button>
          <GhostButton type="button" onClick={handleDeny}>
            Tolak
          </GhostButton>
        </div>
      </Panel>

      <p className="mt-[18px] text-[13px] text-ruang-muted leading-[1.6]">
        <Link href="/" className="text-ruang-accent-text hover:underline">
          Kembali ke ringkasan
        </Link>{' '}
        tanpa memberi izin.
      </p>
    </div>
  );
}
