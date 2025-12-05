import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../..'
);
const pkgPath = path.join(root, 'package.json');
const basePath = path.join(root, 'docs', 'openapi', 'base.yaml');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const contents = fs.readFileSync(basePath, 'utf8');

const updated = contents.replace(
  /(version:\s*)(\d+\.\d+\.\d+)/,
  `$1${pkg.version}`
);

if (updated === contents) {
  console.error('Version field not updated in docs/openapi/base.yaml');
  process.exit(1);
}

fs.writeFileSync(basePath, updated);
console.log(`docs/openapi/base.yaml version set to ${pkg.version}`);
