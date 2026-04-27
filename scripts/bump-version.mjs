import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, '..', 'package.json');
const clPath  = join(__dirname, '..', 'CHANGELOG.md');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

// Allow an explicit target version via "version_next" in package.json.
// If absent, auto-increment the patch segment.
let next;
if (pkg.version_next) {
  next = pkg.version_next;
  delete pkg.version_next;
} else {
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  next = `${major}.${minor}.${patch + 1}`;
}

pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`📦  Version bumped to ${next}`);

// Insert a placeholder section into CHANGELOG.md for this version.
// Always placed immediately after the "# mnml Changelog" title line.
// Idempotent — skipped if the version heading already exists.
const today    = new Date().toISOString().slice(0, 10);
const existing = existsSync(clPath) ? readFileSync(clPath, 'utf-8') : '# mnml Changelog\n';

if (!existing.includes(`## v${next}`)) {
  const placeholder = `## v${next} — ${today}\n\n<!-- fill in release notes here -->\n`;
  // Insert after the first heading line (# mnml Changelog), if present.
  const titleMatch = existing.match(/^# .+\n/);
  let updated;
  if (titleMatch) {
    const splitAt = titleMatch.index + titleMatch[0].length;
    updated = existing.slice(0, splitAt) + '\n' + placeholder + '\n' + existing.slice(splitAt);
  } else {
    updated = placeholder + '\n' + existing;
  }
  writeFileSync(clPath, updated);
  console.log(`📝  CHANGELOG.md: added placeholder for v${next}`);
} else {
  console.log(`📝  CHANGELOG.md: v${next} section already present`);
}
