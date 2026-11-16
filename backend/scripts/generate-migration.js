#!/usr/bin/env node
// Safe wrapper around `typeorm migration:generate`.
//
// TypeORM diffs the schema against the entities and, because our hand-written CHECK constraints
// (src/migrations/integrity.ts) are not declared there, it emits `DROP CONSTRAINT "chk_..."` in up()
// on EVERY run. Applying that silently removes the financial integrity rules (this already happened once).
// This wrapper removes those statements from up() and tells you. ALWAYS still read the file.
//
//   npm run migration:generate -- src/migrations/Name
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('usage: npm run migration:generate -- src/migrations/Name');
  process.exit(1);
}
const dir = path.dirname(target);
const before = new Set(fs.readdirSync(dir));

execSync(`npx typeorm-ts-node-commonjs -d src/data-source.ts migration:generate ${target}`, { stdio: 'inherit' });

const created = fs.readdirSync(dir).filter((f) => !before.has(f) && f.endsWith('.ts'));
for (const f of created) {
  const file = path.join(dir, f);
  const src = fs.readFileSync(file, 'utf8');
  const downAt = src.indexOf('public async down');
  const up = src.slice(0, downAt);
  const lines = up.split('\n');
  const kept = lines.filter((l) => !/DROP CONSTRAINT "chk_/.test(l));
  const removed = lines.length - kept.length;
  fs.writeFileSync(file, kept.join('\n') + src.slice(downAt));
  console.log(`\n[generate-migration] ${f}: removed ${removed} DROP CONSTRAINT "chk_*" statement(s) from up() (they would delete integrity rules).`);
  console.log('[generate-migration] Review the file by hand before committing.');
}
