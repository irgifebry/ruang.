import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

const MAX_BYTES = 2 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

function responseError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

function hasImageSignature(bytes, mime) {
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/gif') return bytes.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null;
  if (mime === 'image/webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function storageAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Avatar storage is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function boundedRequest(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: Buffer.concat(chunks),
  });
}

async function currentUser(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return null;
  if (!origin && request.headers.get('sec-fetch-site') === 'cross-site') return null;
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function POST(request) {
  try {
    const user = await currentUser(request);
    if (!user) return responseError('Sesi tidak ditemukan atau permintaan ditolak.', 401);
    const maxRequestBytes = MAX_BYTES + 65_536;
    const rawLength = request.headers.get('content-length');
    const length = rawLength === null ? null : Number(rawLength);
    if (length !== null && (!Number.isSafeInteger(length) || length < 0 || length > maxRequestBytes)) {
      return responseError('Ukuran gambar maksimal 2 MB.', 413);
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
      return responseError('Format permintaan tidak valid.', 415);
    }

    const bounded = await boundedRequest(request, maxRequestBytes);
    if (!bounded) return responseError('Ukuran gambar maksimal 2 MB.', 413);
    const form = await bounded.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) {
      return responseError('Ukuran gambar maksimal 2 MB.', 400);
    }

    const extension = MIME_EXTENSIONS.get(file.type);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!extension || !hasImageSignature(bytes, file.type)) {
      return responseError('File bukan gambar yang didukung.', 400);
    }

    const path = `${user.id}/avatar-${randomUUID()}.${extension}`;
    const { error } = await storageAdmin().storage.from('avatars').upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;

    const pool = getPool();
    let previousPath;
    try {
      const previous = await pool.query('SELECT avatar_path FROM profiles WHERE id = $1', [user.id]);
      previousPath = previous.rows[0]?.avatar_path;
      const saved = await pool.query('UPDATE profiles SET avatar_path = $1 WHERE id = $2 RETURNING id', [path, user.id]);
      if (!saved.rowCount) throw new Error('Profile not found.');
    } catch (error) {
      await storageAdmin().storage.from('avatars').remove([path]);
      throw error;
    }

    if (previousPath && previousPath !== path && previousPath.startsWith(`${user.id}/`)) {
      const { error: cleanupError } = await storageAdmin().storage.from('avatars').remove([previousPath]);
      if (cleanupError) console.error('Previous avatar cleanup failed:', cleanupError);
    }

    return NextResponse.json({ path });
  } catch (error) {
    console.error('Avatar upload failed:', error);
    return responseError('Gagal mengunggah foto.', 500);
  }
}

export async function DELETE(request) {
  try {
    const user = await currentUser(request);
    if (!user) return responseError('Sesi tidak ditemukan atau permintaan ditolak.', 401);

    const body = await request.json().catch(() => null);
    const path = body?.path;
    const filename = typeof path === 'string' ? path.slice(user.id.length + 1) : '';
    if (typeof path !== 'string' || !path.startsWith(`${user.id}/`) ||
        !/^avatar-[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i.test(filename)) {
      return responseError('Path avatar tidak valid.', 400);
    }

    const cleared = await getPool().query(
      'UPDATE profiles SET avatar_path = NULL WHERE id = $1 AND avatar_path = $2 RETURNING id',
      [user.id, path],
    );
    if (!cleared.rowCount) return responseError('Foto tidak ditemukan.', 404);
    const { error } = await storageAdmin().storage.from('avatars').remove([path]);
    if (error) {
      console.error('Avatar object cleanup failed after profile update:', error);
      return responseError('Foto dilepas dari profil, tetapi file gagal dibersihkan.', 500);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Avatar delete failed:', error);
    return responseError('Gagal menghapus foto.', 500);
  }
}
