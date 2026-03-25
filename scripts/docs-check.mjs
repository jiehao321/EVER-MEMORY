import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

let failures = 0;

function check(label, ok) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    failures++;
  }
}

console.log('Documentation consistency check\n');

const pkg = JSON.parse(read('package.json'));
const version = pkg.version;
console.log(`Package version: ${version}\n`);

// 1. CHANGELOG references current version or clearly marks itself historical
const changelog = read('docs/CHANGELOG.md');
check(
  'CHANGELOG.md references current version or historical status note',
  changelog.includes(`[${version}]`) || changelog.includes('Repository Status Note'),
);

// 2. Tool count in API.md matches src/tools/index.ts exports
const apiMd = read('docs/API.md');
const toolsIndex = read('src/tools/index.ts');
const exportCount = (toolsIndex.match(/^export\s/gm) || []).length;
const apiToolMatch = apiMd.match(/Current SDK export count:\s*(\d+)/);
const apiToolCount = apiToolMatch ? parseInt(apiToolMatch[1], 10) : 0;
check(
  `API.md SDK export count (${apiToolCount}) matches src/tools/index.ts exports (${exportCount})`,
  apiToolCount === exportCount,
);

// 3. ARCHITECTURE.md version matches package.json
const archMd = read('docs/ARCHITECTURE.md');
check('ARCHITECTURE.md version matches package.json', archMd.includes(`**Version:** ${version}`));

// 4. CLAUDE.md version reference
const claudeMd = read('CLAUDE.md');
check('CLAUDE.md references current version', claudeMd.includes(version));

// 5. README links the maintained docs index
const readme = read('README.md');
check('README.md links docs/INDEX.md', readme.includes('docs/INDEX.md'));

// 6. docs/INDEX exists and links the public guide
const docsIndex = read('docs/INDEX.md');
check('docs/INDEX.md links GUIDE.md', docsIndex.includes('GUIDE.md'));

console.log('');
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('All checks passed.');
}
