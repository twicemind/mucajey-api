#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as parser from '@babel/parser';
import * as traverseModule from '@babel/traverse';
import http from 'node:http';
import YAML from 'yamljs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const cliRoutesDir = getCliOption('--routesDir');
const cliOutDir = getCliOption('--outDir');

function resolveCliPath(value) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

const routesDir =
  resolveCliPath(cliRoutesDir) ||
  path.join(__dirname, '..', '..', 'src', 'server', 'routes');
console.log('Using routesDir:', routesDir);
const outDir =
  resolveCliPath(cliOutDir) ||
  path.join(__dirname, '..', '..', 'docs', 'openapi', 'paths');
console.log('Using outDir:', outDir);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function convertExpressPathToOpenApi(p) {
  return p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function extractPathParameters(expressPath) {
  const params = [];
  const regex = /:([A-Za-z0-9_]+)/g;
  let match;
  while ((match = regex.exec(expressPath)) !== null) {
    params.push({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
  }
  return params;
}

function buildTagNameFromFile(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function processRouteFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const ast = parser.parse(source, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'classProperties', 'dynamicImport'],
  });

  const paths = {};
  const tagName = buildTagNameFromFile(filePath);
  const routeResponseMap = new WeakMap();

  const traverse =
    traverseModule.default?.default ||
    traverseModule.default?.traverse ||
    traverseModule.traverse ||
    traverseModule;

  traverse(ast, {
    CallExpression(callPath) {
      const node = callPath.node;
      const callee = node.callee;
      const handlerNode = callPath.getFunctionParent()?.node;

      const isResultDocumentation =
        callee &&
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'result' &&
        ((callee.property.type === 'Identifier' &&
          callee.property.name === 'documentation') ||
          (callee.property.type === 'StringLiteral' &&
            callee.property.value === 'documentation'));

      if (isResultDocumentation) {
        const arg = node.arguments[0];
        if (!arg || arg.type !== 'ObjectExpression' || !handlerNode) return;

        let method;
        let routePath;
        let description;

        for (const prop of arg.properties) {
          if (prop.type !== 'ObjectProperty') continue;

          const keyName =
            prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;

          if (!prop.value || prop.value.type !== 'StringLiteral') continue;

          const val = prop.value.value;

          if (keyName === 'method') method = val;
          else if (keyName === 'path') routePath = val;
          else if (keyName === 'description') description = val;
        }

        if (!method || !routePath) return;

        const openapiPath = convertExpressPathToOpenApi(routePath);
        const methodKey = method.toLowerCase();

        if (!paths[openapiPath]) {
          paths[openapiPath] = {};
        }

        const entry = {
          summary: description || `${method} ${openapiPath}`,
          description: description || '',
          tags: [tagName],
          parameters: extractPathParameters(routePath),
          responses: {
            200: { description: 'Successful response' },
          },
        };

        paths[openapiPath][methodKey] = entry;
        routeResponseMap.set(handlerNode, entry);
        return;
      }

      const isResStatusCall =
        callee &&
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'res' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'status';

      if (!isResStatusCall || !handlerNode) return;

      const statusArg = node.arguments[0];
      if (!statusArg || statusArg.type !== 'NumericLiteral') return;

      const responseEntry = routeResponseMap.get(handlerNode);
      if (!responseEntry) return;

      const statusCode = String(statusArg.value);
      if (!responseEntry.responses[statusCode]) {
        responseEntry.responses[statusCode] = {
          description: http.STATUS_CODES[statusArg.value] || 'Response',
        };
      }
    },
  });

  return paths;
}

function collectRouteFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  entries.forEach(entry => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  });
  return files;
}

function main() {
  ensureDir(outDir);

  const files = collectRouteFiles(routesDir);

  if (files.length === 0) {
    console.error('⚠️  Keine Router-Dateien gefunden in', routesDir);
    process.exit(1);
  }

  for (const fullPath of files) {
    const relative = path.relative(routesDir, fullPath);
    console.log(`🔍 Verarbeite Router-File: ${relative}`);

    const paths = processRouteFile(fullPath);

    if (Object.keys(paths).length === 0) {
      console.warn(
        `⚠️  Keine result.documentation()-Aufrufe in ${relative} gefunden.`
      );
      continue;
    }

    const yamlObj = { paths };
    const outFileName =
      path.basename(fullPath, path.extname(fullPath)) + '.yaml';
    const outPath = path.join(outDir, outFileName);

    fs.writeFileSync(outPath, YAML.stringify(yamlObj, 4, 2), 'utf8');
    console.log(`✅ OpenAPI-Snippet geschrieben: ${outPath}`);
  }
}

main();
