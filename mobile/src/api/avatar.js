/**
 * Avatar upload, removal and URL building for the native app.
 *
 * The server route `/api/avatar` owns the real boundary: it reads the bearer
 * session, checks the multipart body's size and magic bytes, writes the object
 * and stores a path shaped `<userId>/avatar-<uuid>.<ext>`. This module does the
 * cheap checks before a byte is sent (type and, when the picker reports one,
 * 2 MB), builds the `{ uri, name, type }` part React Native's `FormData` needs
 * for a picked file, and turns a stored path back into a public URL. No Expo
 * import lives here, so the rules are testable under plain `node --test`.
 */

import { avatarBaseURL } from '../config.js';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Kept in step with the server's MIME → extension table and path regex. */
export const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** iOS/Android pickers normally send a MIME type, but a few providers only
 * give a filename. Deriving it from the extension keeps those uploads usable. */
const EXTENSION_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

function assetMime(asset) {
  if (asset.mimeType) return String(asset.mimeType).toLowerCase();
  const extension = String(asset.fileName ?? '').split('.').pop()?.toLowerCase();
  return EXTENSION_MIME[extension] ?? String(asset.type ?? '').toLowerCase();
}

/**
 * Validates a picked asset and returns a multipart body with one `file` part.
 *
 * `asset` is the shape `expo-image-picker` returns in `result.assets[0]`:
 * `{ uri, fileName?, mimeType?, type?, fileSize? }`. `FormDataImpl` is injected
 * only so a test can record what would have been appended; in the app the
 * platform global is used.
 */
export function buildAvatarForm(asset, FormDataImpl = globalThis.FormData) {
  if (!asset || typeof asset.uri !== 'string' || !asset.uri) {
    throw new Error('Pilih file gambar.');
  }

  const mime = assetMime(asset);
  if (!mime.startsWith('image/')) throw new Error('Pilih file gambar.');
  const extension = MIME_EXTENSIONS[mime];
  if (!extension) throw new Error('File bukan gambar yang didukung.');

  // Some pickers (notably on iOS) omit `fileSize`. Do not reject those: the
  // server reads the actual multipart bytes and enforces the same 2 MB limit,
  // so an unknown size is not evidence of an oversized image. Only a size the
  // picker did report can be rejected before the upload.
  const size = Number(asset.fileSize ?? asset.size);
  if (Number.isFinite(size) && (size <= 0 || size > MAX_AVATAR_BYTES)) {
    throw new Error('Ukuran maksimal 2 MB.');
  }

  // The server generates the storage path and enforces its shape; the part's
  // name is only a multipart filename, not a path we get to choose here.
  const form = new FormDataImpl();
  form.append('file', { uri: asset.uri, name: `avatar.${extension}`, type: mime });
  return form;
}

/** POSTs the multipart body; resolves to the storage path stored on the profile. */
export async function uploadAvatar(client, form) {
  const result = await client.request('/api/avatar', { method: 'POST', body: form });
  const path = result?.path;
  if (typeof path !== 'string' || !path) throw new Error('Gagal mengunggah foto.');
  return path;
}

/** DELETEs a stored path; the server clears the DB pointer before the object. */
export function deleteAvatar(client, path) {
  if (!path) return Promise.resolve(null);
  return client.request('/api/avatar', { method: 'DELETE', body: { path } });
}

/**
 * Absolute URL for a stored avatar path, or null when there is no upload.
 *
 * `version` is the cache buster the screen bumps after an upload or removal:
 * the object keeps its path, so a plain URI would keep showing the old photo.
 * A Google picture never comes through here — that is a full URL already and
 * the screen falls back to it only when there is no uploaded path.
 */
export function avatarUrl(path, version = 0, baseURL) {
  if (!path) return null;
  const origin = String(baseURL ?? avatarBaseURL()).replace(/\/+$/, '');
  const url = `${origin}/storage/v1/object/public/avatars/${encodeURI(path)}`;
  return version ? `${url}?v=${version}` : url;
}
