#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yamljs';
import { sync as globSync } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const basePath = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'openapi',
  'base.yaml'
);

function getCliOption(flag) {
  const arg = process.argv.slice(2).find(value => value.startsWith(`${flag}=`));
  if (arg) {
    return arg.split('=')[1];
  }

  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv.length > index + 1) {
    return process.argv[index + 1];
  }

  return null;
}

function resolveCliPath(value) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

const cliPathsDir = getCliOption('--pathsDir');
const cliDistDir = getCliOption('--distDir');

const pathsDir =
  resolveCliPath(cliPathsDir) ||
  path.join(__dirname, '..', '..', 'docs', 'openapi', 'paths');
const distDir =
  resolveCliPath(cliDistDir) ||
  path.join(__dirname, '..', '..', 'docs', 'openapi', 'dist');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadYaml(p) {
  if (!fs.existsSync(p)) {
    return {};
  }
  const content = fs.readFileSync(p, 'utf8');
  return YAML.parse(content) || {};
}

function main() {
  ensureDir(distDir);

  const base = loadYaml(basePath);

  const merged = {
    ...base,
    paths: base.paths || {},
    components: base.components || {},
  };

  const snippetFiles = globSync(path.join(pathsDir, '*.yaml'));

  if (snippetFiles.length === 0) {
    console.warn('⚠️  Keine OpenAPI-Snippets in openapi/paths gefunden.');
  }

  for (const file of snippetFiles) {
    console.log(`🔗 Mer­ge OpenAPI-Snippet: ${path.basename(file)}`);
    const snippet = loadYaml(file);

    if (snippet.paths) {
      for (const [p, methods] of Object.entries(snippet.paths)) {
        merged.paths[p] = {
          ...(merged.paths[p] || {}),
          ...methods,
        };
      }
    }

    if (snippet.components) {
      merged.components = merged.components || {};
      for (const [compType, compVal] of Object.entries(snippet.components)) {
        merged.components[compType] = {
          ...(merged.components[compType] || {}),
          ...compVal,
        };
      }
    }
  }

  const outPath = path.join(distDir, 'openapi.yaml');
  fs.writeFileSync(outPath, YAML.stringify(merged, 4, 2), 'utf8');
  console.log(`✅ OpenAPI-Bundle geschrieben: ${outPath}`);
}

main();
