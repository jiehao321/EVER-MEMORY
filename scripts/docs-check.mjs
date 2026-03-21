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

// 1. CHANGELOG contains current version
const changelog = read('docs/CHANGELOG.md');
check('CHANGELOG.md contains current version', changelog.includes(`[${version}]`));

// 2. Tool count in API.md matches src/tools/index.ts exports
const apiMd = read('docs/API.md');
const toolsIndex = read('src/tools/index.ts');
const exportCount = (toolsIndex.match(/^export\s/gm) || []).length;
const apiToolMatch = apiMd.match(/(\d+)\s+SDK tool functions/);
const apiToolCount = apiToolMatch ? parseInt(apiToolMatch[1], 10) : 0;
check(`API.md tool count (${apiToolCount}) matches src/tools/index.ts exports (${exportCount})`, apiToolCount === exportCount);

// 3. ARCHITECTURE.md version matches package.json
const archMd = read('docs/ARCHITECTURE.md');
check('ARCHITECTURE.md version matches package.json', archMd.includes(`**Version:** ${version}`));

// 4. CLAUDE.md version reference
const claudeMd = read('CLAUDE.md');
check('CLAUDE.md references current version', claudeMd.includes(version));

// 5. README test badge has a number
const readme = read('README.md');
const badgeMatch = readme.match(/tests-(\d+)%20passing/);
check('README.md test badge has valid count', badgeMatch && parseInt(badgeMatch[1], 10) > 0);

console.log('');
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('All checks passed.');
}
