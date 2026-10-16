/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Supabase publishes new releases often, and a minor bump has broken these
  // packages before. Pinning keeps a fresh `npm install` reproducible against a
  // known-good pairing instead of resolving to whatever is newest that day.
  experimental: {
    optimizePackageImports: ['@solar-icons/react'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      // Keep the authenticated app and auth/utility routes out of search
      // results. Public marketing pages (welcome, about, help) are left
      // indexable so crawlers can find them.
      {
        source: '/(login|register|reset-password|transactions|history|settings/:path*|auth/:path*|oauth/:path*)',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },

  // Disable Turbopack to use webpack with our alias config
  // turbopack: {},
};

module.exports = nextConfig;
