'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSession, signOut } from '@/lib/auth-client';
import { clearIdleState } from '@/lib/idle-logout';
import { toggleSidebar, isRailToggleClick } from '@/lib/sidebar';
import { useProfile } from '@/hooks/useProfile';
import {
  CloseIcon,
  HistoryIcon,
  HomeIcon,
  ListIcon,
  LogoutIcon,
  SettingsIcon,
} from './icons';
import BrandMark from './BrandMark';

/**
 * Section names, one word each. The page header is the only heading on screen,
 * so each H1 repeats its nav label verbatim — clicking "Transaksi" lands on a
 * page titled "Transaksi", not on "Pengeluaran".
 */
const NAV = [
  { href: '/', label: 'Ringkasan', icon: HomeIcon },
  { href: '/transactions', label: 'Transaksi', icon: ListIcon },
  { href: '/history', label: 'Riwayat', icon: HistoryIcon },
  { href: '/settings', label: 'Pengaturan', icon: SettingsIcon },
];

/**
 * Routes reachable only from the account menu, not from the main nav. It lives
 * under `/settings/` but is its own page, so a nested match on `/settings`
 * would keep "Pengaturan" highlighted while the user is on a page that nav item
 * does not link to.
 */
const ACCOUNT_ROUTES = ['/settings/profile'];

/** `/` must not also light up for every nested route, so it matches exactly. */
function isActive(pathname, href) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** The account menu links to pages, never to sections, so it matches exactly. */
function isAccountActive(pathname, href) {
  return pathname === href;
}

/** Main-nav highlight: account-menu routes belong to no nav item at all. */
function isNavActive(pathname, href) {
  if (ACCOUNT_ROUTES.includes(pathname)) return false;
  return isActive(pathname, href);
}

export default function Sidebar({ session, onSignOut, signingOut }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const closeTimer = useRef(null);

  const openDrawer = () => {
    clearTimeout(closeTimer.current);
    setDrawerMounted(true);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    closeTimer.current = setTimeout(() => setDrawerMounted(false), delay);
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // A collapsed rail is the hit area: hover it and the cursor says so, click it
  // and the rail opens again. An open rail deliberately ignores background
  // clicks — only the toggle button collapses it. Not a drag either: the width
  // is two fixed stops, and a drag would have to invent the third.
  const handleRailClick = (event) => {
    if (!isRailToggleClick(event.target)) return;
    toggleSidebar();
  };

  // A tap on any nav item should close the drawer, otherwise the menu stays
  // over the page the user just navigated to.
  useEffect(() => {
    if (drawerOpen) closeDrawer();
  }, [pathname]);

  // Lock body scroll while the drawer is open so the page behind cannot scroll.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  // Escape closes the drawer, matching the dialog behaviour users expect.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <>
      {/* Mobile bar. `lg:hidden`, and the desktop sidebar is hidden below `lg`,
          so exactly one of the two is ever in the layout. */}
      <header className="lg:hidden fixed inset-x-0 top-0 z-40 h-[56px] flex items-center justify-between px-[16px] border-b border-ruang-line bg-ruang-shell/95 backdrop-blur">
        <Brand />
        <button
          type="button"
          onClick={openDrawer}
          aria-label="Buka menu navigasi"
          aria-expanded={drawerOpen}
          className="w-[38px] h-[38px] grid place-items-center border border-ruang-line-3 rounded-[4px] text-ruang-ink hover:border-ruang-accent-text hover:text-ruang-accent-text transition-colors"
        >
          <MenuGlyph />
        </button>
      </header>

      {drawerMounted && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Tutup menu navigasi"
            onClick={closeDrawer}
            className={`${drawerOpen ? 'overlay-in' : 'overlay-out'} absolute inset-0 bg-black/70`}
            tabIndex={drawerOpen ? 0 : -1}
            aria-hidden={!drawerOpen}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu navigasi"
            className={`${drawerOpen ? 'drawer-in' : 'drawer-out'} absolute inset-y-0 right-0 w-[272px] max-w-[85vw] bg-ruang-shell border-l border-ruang-line p-[20px] flex flex-col`}
            aria-hidden={!drawerOpen}
            inert={!drawerOpen}
          >
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Tutup menu"
                className="w-[32px] h-[32px] grid place-items-center text-ruang-muted hover:text-ruang-ink hover:bg-ruang-hover rounded-[6px] transition-colors"
              >
                <CloseIcon size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-[24px] flex flex-col gap-[4px]">
              <NavLinks pathname={pathname} />
            </div>
            <UserBlock session={session} onSignOut={onSignOut} signingOut={signingOut} />
          </div>
        </div>
      )}

      {/* Desktop sidebar. Its width is `--sidebar-w`, which collapses when
          `<html>` carries `data-sidebar="collapsed"` — set before first paint by
          `PRE_HYDRATION_SIDEBAR_SCRIPT` and afterwards only by the toggle. No
          React state is involved, so the server render and the first client
          render agree and hydration has nothing to reconcile. The page gutter in
          `AppShell` reads the same variable.

          Do not add `relative` here to anchor the toggle button: `.relative` is
          emitted after `.fixed` in the stylesheet at equal specificity, so the
          rail would drop out of the viewport, collapse to its content height and
          push the page down. `position: fixed` is already the containing block
          the button needs.

          `onClick` makes the background of a *collapsed* rail a hit area that
          reopens it. The cursor is not set here — it belongs in `globals.css`
          next to the other collapsed-only rules, or it would show a resize
          cursor on an open rail whose background ignores clicks. */}
      <aside
        onClick={handleRailClick}
        className="sidebar-desktop hidden lg:flex fixed inset-y-0 left-0 w-sidebar border-r border-ruang-line bg-ruang-shell p-[28px_20px_20px] flex-col z-20 transition-[width] duration-[var(--sidebar-dur)] ease-[var(--sidebar-ease)]"
      >
        <CollapseToggle />
        <Brand />
        <div className="sidebar-heading mb-[14px] font-mono text-[11px] tracking-[0.14em] text-ruang-subtle">
          MENU
        </div>
        <nav className="flex flex-col gap-[4px]">
          <NavLinks pathname={pathname} />
        </nav>
        <UserBlock session={session} onSignOut={onSignOut} signingOut={signingOut} />
      </aside>
    </>
  );
}

/**
 * The collapse toggle, pinned half over the rail's edge so it stays reachable in
 * both states.
 *
 * It flips an attribute on `<html>` rather than holding state: the width, the
 * page gutter, the labels and the chevron are all CSS reading that attribute,
 * and the choice has to survive a reload before React is involved at all. Both
 * labels are in the markup and `globals.css` shows only one of them — which is
 * what the name changes with, since the button's meaning is state-dependent.
 *
 * `top-[74px]` puts it in the gap *below* the brand rather than beside the
 * wordmark. Level with `ruang.` the two sat close enough to read as one control,
 * and in the collapsed state there is no wordmark left to separate them anyway.
 * Measured from the padding box: the brand tile ends at 59px and the button runs
 * 75–101px, leaving 16px above it and 12px before the "MENU" heading at 113px —
 * which is a gap, not a neighbour, because the heading collapses to zero height
 * along with the rail.
 */
function CollapseToggle() {
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className="sidebar-toggle absolute top-[74px] right-[-13px] z-30 w-[26px] h-[26px] grid place-items-center rounded-full border border-ruang-line-3 bg-ruang-shell text-ruang-muted hover:text-ruang-ink hover:border-ruang-accent-text transition-colors cursor-pointer"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      <span className="sr-only sidebar-only-expanded">Ciutkan sidebar</span>
      <span className="sr-only sidebar-only-collapsed">Perluas sidebar</span>
    </button>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-[11px] text-[22px] font-bold tracking-[-1.3px] text-ruang-ink no-underline cursor-pointer">
      <span className="w-[30px] h-[30px] flex-none bg-ruang-accent text-ruang-accent-ink grid place-items-center rounded-[8px]">
        <BrandMark size={19} />
      </span>
      <span className="sidebar-label">
        ruang<span className="text-ruang-accent-text">.</span>
      </span>
    </Link>
  );
}

function NavLinks({ pathname }) {
  return (
    <>
      {NAV.map((item, i) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            style={{ '--i': i }}
            // The collapsed rail hides the label, so the row carries it as a
            // tooltip — CSS-only, which is why it is an attribute and not state.
            data-tip={item.label}
            className={`sidebar-item sidebar-tip relative row-stagger group h-[42px] flex items-center gap-[11px] text-[13.5px] rounded-[8px] transition-colors no-underline cursor-pointer ${
              active
                ? 'bg-ruang-hover text-ruang-ink font-medium'
                : 'text-ruang-muted hover:bg-ruang-hover hover:text-ruang-ink'
            }`}
          >
            <Icon
              size={16}
              className={`flex-none transition-colors ${
                active ? 'text-ruang-ink' : 'text-ruang-muted group-hover:text-ruang-ink'
              }`}
              aria-hidden="true"
            />
            <span className="sidebar-label">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

/**
 * The signed-in user, as the sidebar shows them. Clicking it opens the profile
 * settings, which is where the name, avatar and theme are edited.
 *
 * Reads `profiles.name` and `profiles.avatar_path`, falling back to the account
 * email and an initial.
 *
 * Neither the session nor the profile exists during SSR or on the first client
 * render — both arrive from an async read afterwards. Rendering them straight
 * away means the client's first pass produces different markup than the server
 * sent, and React throws the whole tree away and rebuilds it. So `resolved` gates
 * everything: the server and the first client render both show the placeholder,
 * and the real identity replaces it once the data is actually in hand.
 *
 * The profile itself comes from `useProfile`, a cache outside React. This block
 * is rendered twice — once in the always-mounted desktop sidebar, once in the
 * mobile drawer, which unmounts every time it closes. Reading it here kept both
 * copies flashing the placeholder on each open, and firing a second request.
 */
function UserBlock({ session, onSignOut, signingOut }) {
  const { profile, resolved, version } = useProfile(session?.user?.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const menuTimer = useRef(null);
  const pathname = usePathname();

  useEffect(() => () => clearTimeout(menuTimer.current), []);

  // Navigating from inside the popover (Profil / Bantuan / Tentang) leaves the
  // menu state untouched, so the popover stayed open and rode along to the new
  // page. Close it on every route change, through the same 180ms exit as the
  // toggle so it animates instead of vanishing.
  //
  // No state in the dependency list, deliberately. An earlier version read
  // `menuMounted` here to skip the timer when the popover was already closed,
  // which made this callback change identity whenever the menu opened — and the
  // effect below depends on it, so opening the menu re-ran the effect, which
  // closed it again 180ms later. Read `menuMounted` from a ref instead: the
  // callback stays stable, so only a real route change closes the menu.
  const menuMountedRef = useRef(menuMounted);
  menuMountedRef.current = menuMounted;

  const closeMenu = useCallback(() => {
    clearTimeout(menuTimer.current);
    setMenuOpen(false);
    if (menuMountedRef.current) {
      menuTimer.current = setTimeout(() => setMenuMounted(false), 180);
    }
  }, []);

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  const toggleMenu = () => {
    clearTimeout(menuTimer.current);
    if (menuOpen) {
      closeMenu();
    } else {
      setMenuMounted(true);
      requestAnimationFrame(() => setMenuOpen(true));
    }
  };

  const email = session?.user?.email ?? '';
  const label = resolved ? profile?.name?.trim() || session?.user?.name?.trim() || email || 'Pengguna' : 'Pengguna';
  const initial = label.charAt(0).toUpperCase();
  // An upload wins over the provider photo, matching the profile page. `?v=`
  // only appears after a re-read, so replacing the photo shows up here without a
  // full reload instead of being served stale out of the browser cache.
  const avatarSrc = !resolved
    ? null
    : profile?.avatar_path
      ? `https://bqgxiiuaefbnxslzkoek.supabase.co/storage/v1/object/public/avatars/${profile.avatar_path}${version ? `?v=${version}` : ''}`
      : profile?.provider_image || null;

  return (
    <div className="group relative mt-auto pt-[16px] border-t border-ruang-line">
      <button
        type="button"
        onClick={toggleMenu}
        aria-expanded={menuOpen}
        aria-controls="sidebar-account-menu"
        aria-label={`Buka menu akun${resolved && email ? ` untuk ${label}` : ''}`}
        className="sidebar-account w-full cursor-pointer flex items-center gap-[10px] py-[8px] rounded-[8px] hover:bg-ruang-hover transition-colors text-left"
      >
        <span className="w-[32px] h-[32px] overflow-hidden bg-ruang-hover text-ruang-ink border border-ruang-line-3 rounded-full grid place-items-center text-[13px] font-semibold flex-none">
          {avatarSrc ? <img src={avatarSrc} alt="" className="w-full h-full object-cover" /> : initial}
        </span>
        <span className="sidebar-label min-w-0 text-left">
          <strong className="block text-[13px] truncate text-ruang-ink font-medium" title={label}>{label}</strong>
          <small className="block text-[11px] text-ruang-muted truncate mt-[2px]" title={email || undefined}>
            {email || 'Rencana personal'}
          </small>
        </span>
        <span className="sidebar-label ml-auto w-[6px] h-[6px] bg-ruang-accent rounded-full flex-none" aria-hidden="true" />
      </button>
      {menuMounted && <nav id="sidebar-account-menu" aria-label="Pengaturan akun" className={`account-menu border border-ruang-line bg-ruang-shell p-[12px] shadow-lg ${menuOpen ? 'account-menu-open' : ''}`}>
        <p className="font-mono text-[10px] tracking-[0.12em] text-ruang-subtle uppercase px-[8px] mb-[6px]">Pengaturan akun</p>
        {[
          { href: '/settings/profile', label: 'Profil' },
          { href: '/help', label: 'Bantuan' },
          { href: '/about', label: 'Tentang' },
        ].map((item) => {
          const active = isAccountActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`block px-[8px] py-[9px] text-[13px] rounded-[4px] no-underline transition-colors ${active ? 'text-ruang-ink bg-ruang-hover' : 'text-ruang-muted hover:text-ruang-ink hover:bg-ruang-hover'}`}
            >
              {item.label}
            </Link>
          );
        })}
        <div className="h-px bg-ruang-line my-[8px]" />
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-[10px] px-[8px] py-[9px] text-[13px] text-ruang-muted hover:text-ruang-danger-ink rounded-[4px] transition-colors disabled:opacity-60 text-left cursor-pointer"
        >
          <LogoutIcon size={15} aria-hidden="true" /> {signingOut ? 'Keluar...' : 'Keluar'}
        </button>
      </nav>}
    </div>
  );
}

function MenuGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/**
 * Sidebar with the session already resolved by the app shell.
 *
 * The shell owns the session so the whole tree does not each hold their own
 * `onAuthStateChange` subscription; previously the sidebar and the page it
 * wrapped both subscribed independently.
 *
 * The idle auto-logout that used to live here now belongs to `IdleLogout` in the
 * app shell. It was unreachable from the tests — anything importing
 * `next/navigation` cannot be loaded by the render suite — and it was skipped
 * wholesale on the bare routes, so a session left open on `/login` was never
 * guarded. `IdleLogout` mounts on every route and its timing rules are plain
 * functions in `@/lib/idle-logout`.
 */
export function SidebarWithSession() {
  const [session, setSession] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getSession().then(({ data }) => setSession(data ?? null));
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    // Drop the idle clock on the way out. Without this a user who signs out
    // manually and comes back an hour later meets a deadline set an hour ago,
    // and gets thrown straight out of the fresh session they just made.
    clearIdleState();
    try {
      await signOut();
      router.replace('/login');
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  };

  return <Sidebar session={session} onSignOut={handleSignOut} signingOut={signingOut} />;
}
