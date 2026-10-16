import { DM_Mono, Space_Grotesk } from 'next/font/google';
import Script from 'next/script';
import AppShell from '../components/AppShell';
import { ThemeProvider } from '../lib/theme';
import { PRE_HYDRATION_THEME_SCRIPT } from '../lib/theme-presets';
import { PRE_HYDRATION_SIDEBAR_SCRIPT } from '../lib/sidebar';
import './globals.css';

// `next/font` self-hosts both families at build time. The previous setup used a
// CSS `@import url('https://fonts.googleapis.com/...')`, which is render-blocking,
// cannot be preloaded, and depends on a third-party request on every cold load.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  // Canonical origin used for every relative URL in this object (OG image,
  // canonical link, etc.). Must match the deployed host, not a placeholder,
  // otherwise sitemaps and canonicals point at a domain no one serves.
  metadataBase: new URL('https://ruang-cashflow.vercel.app'),
  title: {
    default: 'ruang. — rencana keuangan pribadi',
    template: '%s · ruang.',
  },
  description:
    'Ubah gaji bulanan jadi anggaran yang bisa dipantau, lalu catat setiap pengeluaran terhadapnya.',
  applicationName: 'ruang.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'ruang. — rencana keuangan pribadi',
    description: 'Atur gaji jadi anggaran, catat pengeluaran, dan lihat sisa uangmu setiap bulan.',
    url: '/',
    siteName: 'ruang.',
    locale: 'id_ID',
    type: 'website',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'ruang. — rencana keuangan pribadi',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ruang. — rencana keuangan pribadi',
    description: 'Atur gaji jadi anggaran, catat pengeluaran, dan lihat sisa uangmu setiap bulan.',
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

/**
 * Colour scheme for browser widgets (scrollbars, form controls, the date
 * picker). The initial value is a hint; the pre-paint script below sets the
 * accurate one on `<html>`.
 */
export const viewport = {
  themeColor: '#0b0d0c',
  colorScheme: 'dark',
};

/**
 * Builds the pre-paint theme script.
 *
 * Generated in `theme-presets.js` rather than hand-written here, so the theme
 * logic has one definition. It lives there because `layout.jsx` imports
 * `next/font`, which the test suite's Node loader cannot resolve — keeping the
 * generator in a plain module makes it testable.
 */

export default function RootLayout({ children }) {
  return (
    // `suppressHydrationWarning` because the pre-paint script below rewrites
    // `class` on this element after the server produced the HTML.
    <html lang="id" className={`${spaceGrotesk.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        {/*
          Runs before the body paints so the saved theme is already in place.

          Uses `next/script` with `strategy="beforeInteractive"` which injects
          the inline script into the initial HTML document, executing before
          any hydration. This replaces the raw `<script>` that triggered
          React's development warning in Next.js 16.
        */}
        <Script
          id="pre-hydration-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_THEME_SCRIPT }}
        />
        {/*
          Same reasoning for the sidebar: a collapsed rail restored from
          localStorage would otherwise paint full width and then narrow once
          React took over. It only sets `data-sidebar` on <html>, which is the
          single thing every collapse rule in `globals.css` reads.
        */}
        <Script
          id="pre-hydration-sidebar"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_SIDEBAR_SCRIPT }}
        />
        {/* Revealed on `focus-visible`, not `focus`. It is the first focusable
            thing in the document, so bare `focus` let it surface on focus it did
            not earn — a click or a tap that the browser resolved to it, or the
            focus simply surviving a client-side <Link> navigation, since App
            Router does not reset it. That is the "suddenly there, and then it
            sits over the header" behaviour. `focus-visible` restricts the reveal
            to real keyboard traversal, which is the only case that needs it, and
            matches how the rest of the app rings focus. */}
        <a
          href="#konten"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-[10px] focus-visible:left-[10px] focus-visible:z-[60] focus-visible:h-[38px] focus-visible:px-[14px] focus-visible:flex focus-visible:items-center focus-visible:rounded-[4px] focus-visible:bg-ruang-accent focus-visible:text-ruang-accent-ink focus-visible:text-[11px] focus-visible:font-bold no-underline"
        >
          Lewati ke konten
        </a>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
