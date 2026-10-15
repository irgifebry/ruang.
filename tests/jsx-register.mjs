/**
 * Installs the JSX loader hooks. Loaded via `node --import`.
 *
 * `module.register` runs the hooks on a worker thread, which is required here:
 * Node's synchronous loader path does not consult async `load` hooks, so with
 * in-thread hooks (the newer `registerHooks`) the test runner's own `.jsx`
 * import fails to resolve before the hook can run.
 *
 * `register` is deprecated in favour of `registerHooks`, but that replacement
 * cannot load `.jsx` from the test runner's synchronous loader, which is
 * precisely what these tests need. The warning is silenced here rather than
 * left to pollute every test run.
 */

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const text = typeof warning === 'string' ? warning : warning?.message ?? '';
  if (text.includes('module.register() is deprecated')) return;
  return emitWarning.call(process, warning, ...rest);
};

register('./jsx-hooks.mjs', pathToFileURL(import.meta.filename ?? __filename));

process.emitWarning = emitWarning;
