/**
 * Module hooks that make the app's JSX and path aliases loadable under plain
 * Node, so the render tests can exercise the real components.
 *
 * The project has no Babel or TypeScript install, so this borrows the Babel
 * bundle Next.js already ships (`next/dist/compiled/babel`). That keeps `npm
 * test` dependency-free while still testing the actual components rather than
 * copies of them.
 *
 * Three Node/Next-specific details are handled here:
 *
 * 1. Next wraps Babel presets behind an internal lazy accessor that must be
 *    called with a Babel `api` object; the real preset is the returned
 *    `default`. Passing the wrapper itself fails with "Unknown option:
 *    .default".
 *
 * 2. Node does not read `jsconfig.json`, so the `@/` alias has to be resolved
 *    manually, and its ESM resolver needs an extension where the app omits one.
 *
 * 3. The hooks stay out of the way entirely for anything that is not project
 *    source — builtins (`node:test`) and `node_modules` are delegated to the
 *    default loader untouched. Intercepting those is what produces
 *    ERR_UNKNOWN_MODULE_FORMAT, because their result is not a normal
 *    source-object.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// Anchored one directory up, so resolution does not depend on the working
// directory the tests are launched from.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const require = createRequire(join(ROOT, 'noop.js'));
const babel = require('./node_modules/next/dist/compiled/babel/bundle.js');
const core = babel.core();

const BABEL_API = {
  version: '7.0.0',
  cache: () => {},
  env: () => 'development',
  assertVersion: () => {},
};

// `presetReact` is an accessor; the standard-shaped preset is on `.default`.
const presetReact = babel.presetReact(BABEL_API).default;

/** True for files this loader should consider transforming. */
function isProjectSource(path) {
  if (!/\.jsx?$/.test(path)) return false;
  return path.startsWith(SRC) || path.startsWith(join(ROOT, 'tests'));
}

function compile(source, path) {
  const { code } = core.transformSync(source, {
    presets: [[presetReact, { runtime: 'automatic' }]],
    configFile: false,
    babelrc: false,
    filename: path,
    sourceType: 'module',
  });
  return code;
}

/** True when the file needs the JSX transform at all. */
function needsTransform(path, source) {
  if (path.endsWith('.jsx')) return true;
  // Most `.js` files in this project are plain modules, so only pay for the
  // transform when something actually looks like JSX.
  return /<[A-Za-z/>]/.test(source);
}

/** Appends an extension Node can load when the app omitted one. */
function withExtension(path) {
  if (/\.(jsx?|mjs|cjs|json)$/.test(path)) return path;
  for (const ext of ['.js', '.jsx']) {
    if (existsSync(path + ext)) return path + ext;
  }
  return path;
}

export function resolve(specifier, context, nextResolve) {
  const isAlias = specifier.startsWith('@/');
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');

  // Everything else — including builtins and node_modules — goes straight to
  // the default resolver, unmodified.
  if (!isAlias && !isRelative) return nextResolve(specifier, context);

  const base = isAlias
    ? join(SRC, specifier.slice(2))
    : resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);

  const target = withExtension(base);
  if (!existsSync(target)) return nextResolve(specifier, context);

  return { url: pathToFileURL(target).href, format: 'module', shortCircuit: true };
}

function loadFile(url, context, next) {
  if (!url.startsWith('file:')) return next(url, context);

  const path = fileURLToPath(url);
  if (!isProjectSource(path)) return next(url, context);

  const source = readFileSync(path, 'utf8');
  if (!needsTransform(path, source)) return next(url, context);

  return { format: 'module', shortCircuit: true, source: compile(source, path) };
}

/** Sync path, which is what the test runner's loader uses. */
export function loadSync(url, context, nextLoadSync) {
  return loadFile(url, context, nextLoadSync);
}

/** Async path, for importers that go through it. */
export async function load(url, context, nextLoad) {
  return loadFile(url, context, nextLoad);
}
