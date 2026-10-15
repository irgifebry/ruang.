/**
 * Avatar upload.
 *
 * Separate from `ledger.js` because this talks to Supabase Storage rather than
 * to a table — but it still takes the client explicitly, like every other write
 * in the app.
 *
 * The path is namespaced by user id (`<userId>/avatar-<random>.<ext>`) because the
 * storage policies key on that first path segment. The random suffix is what
 * makes replacing a photo work: the same filename would be a cache hit in the
 * browser, so a new avatar would keep rendering the old image.
 */

const BUCKET = 'avatars';

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Uploads the avatar and returns the storage path to store on the profile.
 *
 * Throws on any failure, including one that is only visible after the upload
 * already succeeded — the caller shows one message either way.
 */
export async function uploadAvatar(supabase, userId, file) {
  if (!userId) throw new Error('Sesi tidak ditemukan.');

  const extension = EXTENSIONS[file.type];
  if (!extension) {
    throw new Error('Format gambar tidak didukung. Pakai JPG, PNG, WebP, atau GIF.');
  }

  // Math.random is not a security control here — the storage policy is. This only
  // has to be unique enough not to collide with an existing object.
  const suffix = Math.random().toString(36).slice(2, 10);
  const path = `${userId}/avatar-${suffix}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    // Re-uploading under the same key is how the old avatar would be replaced,
    // but the random suffix already avoids that; upsert is a safety net.
    upsert: true,
  });

  if (error) throw new Error(error.message || 'Gagal mengunggah foto.');
  return path;
}

/**
 * Removes an avatar object.
 *
 * Best-effort: `updateProfile({ avatar_path: null })` is what actually clears the
 * avatar, and that has to succeed even if the storage object cannot be deleted.
 * A leftover file in the bucket is invisible to the user; a profile row still
 * pointing at a deleted file would render a broken image.
 */
export async function deleteAvatar(supabase, path) {
  if (!path) return;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // Intentionally ignored, see above.
  }
}

/** The public URL for a stored path, or null when there is no avatar. */
export function avatarUrl(supabase, path) {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}