export default function sitemap() {
  const base = 'https://ruang-cashflow.vercel.app';
  const lastModified = new Date();
  return [
    {
      url: `${base}/welcome`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${base}/about`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${base}/help`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${base}/welcome/help`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ];
}