import { NextResponse } from 'next/server';
import { purgeExpiredAccounts } from '@/lib/account-purge';

/**
 * Destroys the accounts whose seven-day grace period has run out.
 *
 * A route rather than a `pg_cron` job: the database can drop the rows, but the
 * avatar can only be removed through the Storage API, and Supabase blocks a SQL
 * `DELETE` on `storage.objects` precisely because it orphans the file. Running
 * the sweep here is what makes "dihapus permanen" mean the photo goes too.
 *
 * Schedule it daily in `vercel.json`. Vercel sends `CRON_SECRET` as a bearer
 * token automatically; without that variable configured this route refuses every
 * call rather than leaving a way to delete accounts open on a public URL.
 */

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET belum diatur. Hapus akun otomatis tidak aktif.' },
      { status: 503 }
    );
  }

  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Permintaan ditolak.' }, { status: 401 });
  }

  try {
    const purged = await purgeExpiredAccounts();
    return NextResponse.json({ success: true, purged: purged.length });
  } catch (error) {
    console.error('Account purge sweep failed:', error);
    return NextResponse.json({ error: 'Gagal membersihkan akun.' }, { status: 500 });
  }
}