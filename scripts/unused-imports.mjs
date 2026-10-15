/**
 * Reports imported bindings that never appear in the module body.
 *
 * Not a linter — a quick sweep for dead imports left behind by refactoring. Run
 * with `node scripts/unused-imports.mjs`.
 */
import { readFileSync, globSync } from 'node:fs';

const files = globSync('src/**/*.{js,jsx}');
let total = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  // Strip the import lines so a name is only "used" if it appears in real code.
  const body = source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?$/gm, '');

  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim();
      if (!name) continue;

      const pattern = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
      if (!pattern.test(body)) {
        console.log(`${file}: unused -> ${name}`);
        total += 1;
      }
    }
  }
}

console.log(`\n${total} unused import(s)`);