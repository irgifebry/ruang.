/**
 * Avatar helpers.
 *
 * Uploads and deletions go through the server route `/api/avatar` (POST and
 * DELETE), which owns authentication, size/MIME/magic-byte validation and the
 * database write. This module owns the one thing the browser still needs:
 * turning a stored `profiles.avatar_path` into a public URL. Both the sidebar
 * and the profile screen call `avatarUrl`, so the bucket path is written once.
 */

const BUCKET = 'avatars';
const PUBLIC_PATH = '/storage/v1/object/public/avatars/';
const MAX_BYTES = 2 * 1024 * 1024;

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function hasImageSignature(bytes, mime) {
  if (!bytes || bytes.length < 12) return false;
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') {
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    return png.every((b, i) => bytes[i] === b);
  }
  if (mime === 'image/gif') {
    const head = String.fromCharCode(...bytes.subarray(0, 6));
    return head === 'GIF87a' || head === 'GIF89a';
  }
  if (mime === 'image/webp') {
    return String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
  }
  return false;
}

function generateUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Uploads the avatar and returns the storage path to store on the profile.
 *
 * @deprecated Use `POST /api/avatar` instead.
 */
export async function uploadAvatar(supabase, userId, file) {
  if (!userId) throw new Error('Sesi tidak ditemukan.');
  if (!file || file.size === 0 || file.size > MAX_BYTES) {
    throw new Error('Ukuran gambar maksimal 2 MB.');
  }

  const extension = EXTENSIONS[file.type];
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!extension || !hasImageSignature(bytes, file.type)) {
    throw new Error('File bukan gambar yang didukung.');
  }

  const id = generateUuid();
  const path = `${userId}/avatar-${id}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) throw new Error(error.message || 'Gagal mengunggah foto.');
  return path;
}

/**
 * Removes an avatar object.
 *
 * @deprecated Use `DELETE /api/avatar` instead.
 */
export async function deleteAvatar(supabase, path) {
  if (!path) return;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // Intentionally ignored.
  }
}

/**
 * The public URL for a stored avatar path, or null when there is no path.
 *
 * The URL shape lives here rather than in two components: the sidebar used to
 * concatenate the string and the profile screen called `getPublicUrl`, so a
 * bucket or URL change only ever reached one of them. `version` is the optional
 * cache-buster those callers append after an upload or a re-read — the object
 * keeps its path, so a bare `src` would keep showing the previous image.
 */
export function avatarUrl(path, version = 0) {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const url = `${base}${PUBLIC_PATH}${encodeURI(path)}`;
  return version ? `${url}?v=${version}` : url;
}
