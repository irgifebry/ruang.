import { Settings } from '../../../src/screens/Settings.jsx';

/**
 * The Pengaturan tab lives in `src/screens/Settings.jsx`; this file is the sole
 * owner of the `/settings` route. The named import is pinned by
 * `tests/settings-exports.test.mjs` — `expo export` cannot catch a missing
 * named export, and a missing one renders an empty tab.
 */
export default function Pengaturan() {
  return <Settings />;
}
