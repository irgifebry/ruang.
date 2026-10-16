import { ImageResponse } from 'next/og';

export const alt = 'ruang. — rencana keuangan pribadi';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: '#0b0d0c',
          color: '#f4f1ea',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '12px',
              background: '#c9fb55',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10140a',
              fontSize: '40px',
              fontWeight: 700,
            }}
          >
            r
          </div>
          <div style={{ fontSize: '34px', fontWeight: 600, letterSpacing: '-0.04em' }}>ruang.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '68px', fontWeight: 600, letterSpacing: '-0.05em', lineHeight: 1.05, maxWidth: '960px' }}>
            Ubah gaji bulanan jadi anggaran yang bisa dipantau.
          </div>
          <div style={{ fontSize: '30px', color: '#a9a49a', maxWidth: '900px', lineHeight: 1.4 }}>
            Catat setiap pengeluaran terhadapnya dan lihat sisa uangmu setiap bulan.
          </div>
        </div>
        <div style={{ fontSize: '22px', color: '#7a756c' }}>ruang-cashflow.vercel.app</div>
      </div>
    ),
    { ...size },
  );
}