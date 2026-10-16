export default function robots() {
  const base = 'https://ruang-cashflow.vercel.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/transactions', '/history', '/settings', '/login', '/register', '/reset-password', '/auth', '/oauth', '/api'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}