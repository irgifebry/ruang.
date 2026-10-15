'use client';

import { usePathname } from 'next/navigation';
import IdleLogout from './idle-logout';
import { SidebarWithSession } from './Sidebar';

/** Routes that render without the app chrome (marketing / guest walkthrough). */
const BARE_ROUTES = ['/welcome', '/login', '/register', '/reset-password'];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isBare = BARE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // On both branches, and deliberately: idle auto-logout is an auth behaviour,
  // not chrome. Mounting it only beside the sidebar left the bare routes
  // unguarded, and it has to survive navigation because `AppShell` itself does.
  // It resolves the session itself and stands down when there is none, which is
  // also what clears the clock left behind by a previous session.
  if (isBare) {
    return (
      <div className="min-h-screen bg-ruang-bg text-ruang-ink flex flex-col justify-center">
        <IdleLogout />
        <main className="w-full max-w-[1800px] mx-auto px-[22px] sm:px-[48px] py-[34px] relative">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ruang-bg text-ruang-ink">
      <IdleLogout />
      <SidebarWithSession />
      {/* `pt-[56px]` clears the fixed mobile bar; `lg:pt-0` hands the space
          back to the desktop sidebar, which is fixed at full height.
          `lg:ml-sidebar` is the same `--sidebar-w` the rail draws itself with,
          so the gutter follows a collapse instead of snapping after it. The page
          padding drops to 22px on small screens so content is not squeezed
          against the edge. */}
      <main className="pt-[56px] lg:pt-0 lg:ml-sidebar min-h-screen max-w-[1800px] px-[22px] sm:px-[30px] lg:px-[48px] relative transition-[margin-left] duration-[var(--sidebar-dur)] ease-[var(--sidebar-ease)]">
        {children}
      </main>
    </div>
  );
}
