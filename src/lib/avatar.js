/**
 * @deprecated Legacy client-side avatar helpers.
 *
 * Not currently imported by application code. Avatar upload and deletion are
 * handled by the server-side route `/api/avatar` (POST and DELETE), which enforces
 * authentication, file size bounds, MIME and magic-byte validation, and database synchronization.
 *
 * Kept for reference or backward compatibility.
 */

const BUCKET = 'avatars';
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

/** The public URL for a stored path, or null when there is no avatar. */
export function avatarUrl(supabase, path) {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
