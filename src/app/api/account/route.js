import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { cancelDeletion, requestDeletion } from '@/lib/account-purge';

/**
 * Account-level facts the profile page needs: whether this user has a password
 * at all, and which providers are linked.
 *
 * Better Auth keeps the password hash on the `account` row it created at signup.
 * An account created through Google sign-in has a `google` row and no `credential`
 * row, which is the whole difference the password panel branches on — asking for
 * "kata sandi saat ini" from someone who never set one is a dead end. The same
 * distinction decides whether deleting the account asks for a password.
 *
 * Deliberately reads `account` only. The pending-deletion flag comes from the
 * profile row the profile page has already loaded, and a column added here
 * instead would mean this route 500s on any database where its migration has not
 * landed yet — taking the password panel down with it, for a field it never
 * displays.
 */

/** Kept in step with `minPasswordLength`, which defaults to 8. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Rejects a cross-origin POST.
 *
 * These routes authenticate off the session cookie alone, and Better Auth's own
 * origin check lives in its router middleware — which calling `auth.api.*`
 * directly bypasses. A missing `Origin` (curl, a same-origin form post) passes;
 * a present one has to match the request's own origin exactly.
 */
function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === request.nextUrl.origin;
}

/** Reads the session from the request cookies. */
async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sesi tidak ditemukan. Silakan masuk kembali.' },
      { status: 401 }
    );
  }

  try {
    const { rows } = await getPool().query(
      `SELECT "providerId", password IS NOT NULL AS has_password
       FROM account
       WHERE "userId" = $1`,
      [user.id]
    );

    return NextResponse.json({
      // A `credential` row without a hash is not a usable password, so the hash is
      // what decides — not merely the row's existence.
      hasPassword: rows.some((row) => row.providerId === 'credential' && row.has_password),
      providers: rows.filter((row) => row.providerId !== 'credential').map((row) => row.providerId),
    });
  } catch (error) {
    // The panel behind this treats any failure as "assume there is a password",
    // which is a dead end for an SSO-only user, so the failure is worth naming
    // rather than surfacing as a bare 500 with no body for the client to read.
    console.error('Account status query failed:', error);
    return NextResponse.json({ error: 'Gagal memuat status akun.' }, { status: 500 });
  }
}

/**
 * Schedules the account for deletion, or cancels a pending one.
 *
 * Nothing is deleted here. The request stamps `profiles.deletion_requested_at`
 * and revokes every session; the account survives untouched for seven days, and
 * the client is signed out so the only way back in is to sign in again — which
 * is what clears the stamp.
 *
 * The password is required when the account has one. Deleting an account is not
 * something a hijacked session should be able to do on its own, and a Google-only
 * account has no password to ask for; there the confirmation is the button.
 */
export async function PATCH(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Permintaan ditolak.' }, { status: 403 });
  }

  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sesi tidak ditemukan. Silakan masuk kembali.' },
      { status: 401 }
    );
  }

  const { action, password } = await request.json().catch(() => ({}));

  if (action === 'cancelDeletion') {
    try {
      await cancelDeletion(user.id);
    } catch (error) {
      return serverError('Cancel account deletion failed:', error);
    }
    return NextResponse.json({ success: true });
  }

  if (action !== 'requestDeletion') {
    return NextResponse.json({ error: 'Aksi tidak dikenal.' }, { status: 400 });
  }

  const { rows } = await getPool().query(
    `SELECT "providerId", password IS NOT NULL AS has_password
     FROM account
     WHERE "userId" = $1`,
    [user.id]
  );
  const hasPassword = rows.some((row) => row.providerId === 'credential' && row.has_password);

  if (hasPassword) {
    // Better Auth owns the hash and its own comparison rules, so this asks it
    // rather than re-deriving bcrypt parameters here.
    try {
      await auth.api.verifyPassword({ body: { password: password ?? '' }, headers: await headers() });
    } catch (err) {
      const status = err?.statusCode ?? 401;
      return NextResponse.json(
        { error: 'Kata sandi salah. Akun belum dijadwalkan untuk dihapus.' },
        { status: status === 500 ? 500 : 400 }
      );
    }
  }

  let requestedAt;
  try {
    requestedAt = await requestDeletion(user.id);
  } catch (error) {
    return serverError('Account deletion request failed:', error);
  }

  // Every session goes, including this one: a pending account should not be
  // usable from a browser that still holds a cookie, and the sign-out is what
  // makes "masuk lagi" the restore gesture rather than a no-op.
  await auth.api.revokeSessions({ headers: await headers() }).catch((err) => {
    console.error('Could not revoke sessions after a deletion request:', err);
  });

  return NextResponse.json({ success: true, deletionRequestedAt: requestedAt });
}

/** Turns an unexpected throw into the same shape every caller already handles. */
function serverError(context, error) {
  console.error(context, error);
  return NextResponse.json({ error: 'Terjadi kesalahan pada server.' }, { status: 500 });
}

/**
 * Sets the *first* password on an account that has none.
 *
 * Deliberately not "change the password": `auth.api.setPassword` refuses once a
 * hash exists (`PASSWORD_ALREADY_SET`), so this route cannot be used to overwrite
 * a password someone already has. Changing one stays on Better Auth's
 * `/change-password`, which additionally requires the current one.
 */
export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Permintaan ditolak.' }, { status: 403 });
  }

  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sesi tidak ditemukan. Silakan masuk kembali.' },
      { status: 401 }
    );
  }

  const { newPassword } = await request.json().catch(() => ({}));

  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.` },
      { status: 400 }
    );
  }

  try {
    await auth.api.setPassword({
      body: { newPassword },
      headers: await headers(),
    });
  } catch (err) {
    const code = err?.body?.code;
    const status = err?.statusCode ?? 500;

    if (code === 'PASSWORD_ALREADY_SET') {
      return NextResponse.json(
        { error: 'Kata sandi sudah diatur. Gunakan form ganti kata sandi.', code },
        { status: 409 }
      );
    }
    if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG') {
      return NextResponse.json(
        { error: `Kata sandi harus antara ${MIN_PASSWORD_LENGTH} dan 128 karakter.`, code },
        { status: 400 }
      );
    }
    if (code === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'Sesi tidak ditemukan. Silakan masuk kembali.', code },
        { status: 401 }
      );
    }

    console.error('Set password error:', err);
    return NextResponse.json(
      { error: 'Gagal membuat kata sandi. Coba lagi.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}