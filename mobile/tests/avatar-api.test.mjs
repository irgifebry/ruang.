/**
 * The pre-flight avatar checks and the public URL helper are pure, so the
 * rules the picker enforces are asserted here rather than on a device.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MIME_EXTENSIONS,
  MAX_AVATAR_BYTES,
  avatarUrl,
  buildAvatarForm,
  deleteAvatar,
  uploadAvatar,
} from '../src/api/avatar.js';

/** A FormData stand-in that records the appended part verbatim. */
function recordingFormData() {
  const parts = [];
  return {
    parts,
    FormDataImpl: class {
      append(key, value) {
        parts.push({ key, value });
      }
    },
  };
}

const asset = (overrides = {}) => ({
  uri: 'file:///tmp/picked.jpg',
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  type: 'image',
  fileSize: 1024,
  ...overrides,
});

test('a picked image becomes one { uri, name, type } file part', () => {
  const { parts, FormDataImpl } = recordingFormData();
  buildAvatarForm(asset(), FormDataImpl);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].key, 'file');
  assert.deepEqual(parts[0].value, {
    uri: 'file:///tmp/picked.jpg',
    name: 'avatar.jpg',
    type: 'image/jpeg',
  });
});

test('every supported MIME type maps to the extension the server accepts', () => {
  for (const [mime, extension] of Object.entries(MIME_EXTENSIONS)) {
    const { parts, FormDataImpl } = recordingFormData();
    buildAvatarForm(asset({ mimeType: mime }), FormDataImpl);
    assert.equal(parts[0].value.name, `avatar.${extension}`);
  }
});

test('a missing MIME type falls back to the filename extension', () => {
  const { parts, FormDataImpl } = recordingFormData();
  buildAvatarForm(asset({ mimeType: undefined, fileName: 'foto.PNG' }), FormDataImpl);
  assert.equal(parts[0].value.type, 'image/png');
  assert.equal(parts[0].value.name, 'avatar.png');
});

test('a non-image or unsupported type is rejected before the request', () => {
  const { FormDataImpl } = recordingFormData();
  assert.throws(() => buildAvatarForm(asset({ mimeType: 'application/pdf' }), FormDataImpl), /Pilih file gambar/);
  assert.throws(() => buildAvatarForm(asset({ mimeType: 'image/tiff' }), FormDataImpl), /didukung/);
  assert.throws(() => buildAvatarForm(null, FormDataImpl), /Pilih file gambar/);
});

test('a file over 2 MB is rejected before the request', () => {
  const { FormDataImpl } = recordingFormData();
  assert.throws(
    () => buildAvatarForm(asset({ fileSize: MAX_AVATAR_BYTES + 1 }), FormDataImpl),
    /Ukuran maksimal 2 MB/,
  );
});

test('an unreported file size reaches the server, which enforces the limit', () => {
  const { parts, FormDataImpl } = recordingFormData();
  buildAvatarForm(asset({ fileSize: undefined, size: undefined }), FormDataImpl);
  buildAvatarForm(asset({ fileSize: 'unknown' }), FormDataImpl);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].value.type, 'image/jpeg');
});

test('upload posts the multipart body and returns the stored path', async () => {
  const calls = [];
  const client = {
    async request(path, options) {
      calls.push({ path, ...options });
      return { path: 'user-1/avatar-abc12345.jpg' };
    },
  };
  const { FormDataImpl } = recordingFormData();
  const form = buildAvatarForm(asset(), FormDataImpl);
  assert.equal(await uploadAvatar(client, form), 'user-1/avatar-abc12345.jpg');
  assert.equal(calls[0].path, '/api/avatar');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body, form);
});

test('delete sends the stored path, and skips the request without one', async () => {
  const calls = [];
  const client = {
    async request(path, options) {
      calls.push({ path, ...options });
      return { success: true };
    },
  };
  await deleteAvatar(client, null);
  assert.equal(calls.length, 0);
  await deleteAvatar(client, 'user-1/avatar-abc12345.jpg');
  assert.deepEqual(calls, [
    { path: '/api/avatar', method: 'DELETE', body: { path: 'user-1/avatar-abc12345.jpg' } },
  ]);
});

test('avatarUrl is absolute, keeps the folder separator and busts the cache', () => {
  assert.equal(
    avatarUrl('user-1/avatar-abc12345.jpg', 0, 'https://storage.test'),
    'https://storage.test/storage/v1/object/public/avatars/user-1/avatar-abc12345.jpg',
  );
  assert.equal(
    avatarUrl('user-1/avatar-abc12345.jpg', 3, 'https://storage.test/'),
    'https://storage.test/storage/v1/object/public/avatars/user-1/avatar-abc12345.jpg?v=3',
  );
  assert.equal(avatarUrl(null, 2, 'https://storage.test'), null);
});
