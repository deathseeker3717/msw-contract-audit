// src/parser/msw.js
// Discovers MSW v2 HTTP handler definitions from JavaScript source files using
// Babel's AST parser. Supports .js, .mjs, .ts, .tsx files.
//
// Recognised patterns:
//   http.get('/path', resolver)
//   http.post('/path', resolver)
//   ... (all HTTP methods)
//
// Unresolved dynamic paths (e.g. http.get(buildUrl(), resolver)) are reported
// as dynamic rather than silently skipped.

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { parse as babelParse } from '@babel/parser';
import _traverse from '@babel/traverse';

// @babel/traverse ships as a CommonJS module with a default export.
// When imported as ESM the actual function may be on .default.
const traverse = typeof _traverse === 'function' ? _traverse : _traverse.default;

/** All HTTP method names that MSW v2 `http` object exposes. */
const MSW_HTTP_METHODS = new Set([
  'get', 'post', 'put', 'delete', 'patch', 'head', 'options',
]);

/** File extensions we attempt to parse. */
const SUPPORTED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

/**
 * @typedef {Object} MswHandler
 * @property {string}  method   - Lowercase HTTP method (e.g. "get").
 * @property {string}  path     - Normalised path string (populated when static).
 * @property {string}  rawPath  - The literal string exactly as found in source.
 * @property {string}  file     - Absolute path of the source file.
 * @property {boolean} dynamic  - True if the path could not be statically resolved.
 */

/**
 * Attempts to statically resolve the string value of a Babel AST node.
 *
 * Returns `null` when the value cannot be determined at parse time
 * (e.g. template literals with expressions, identifiers, function calls).
 *
 * @param {object} node - Babel AST node.
 * @returns {string|null}
 */
function resolveStringNode(node) {
  if (!node) return null;

  // Plain string literal: "/users"
  if (node.type === 'StringLiteral') {
    return node.value;
  }

  // Template literal with NO expressions: `\`/users\``
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map(q => q.value.cooked).join('');
  }

  // Everything else (identifier, call expression, template with expressions…)
  return null;
}

/**
 * Extracts MSW v2 handler definitions from a JavaScript/TypeScript source string.
 *
 * Looks for call expressions matching:
 *   `http.<method>(<pathExpression>, ...)`
 *
 * @param {string} source   - Source code content.
 * @param {string} filePath - File path used in error messages and handler metadata.
 * @returns {MswHandler[]}
 * @throws {Error} If the source cannot be parsed.
 */
export function extractHandlersFromSource(source, filePath) {
  let ast;

  try {
    ast = babelParse(source, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'importAssertions',
      ],
      strictMode: false,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
    });
  } catch (err) {
    throw new Error(`Failed to parse handler file: ${filePath}\n${err.message}`);
  }

  const handlers = [];

  traverse(ast, {
    CallExpression(nodePath) {
      const { node } = nodePath;
      const { callee, arguments: args } = node;

      // Pattern: http.<method>(pathArg, ...)
      if (
        callee.type !== 'MemberExpression' ||
        callee.object.type !== 'Identifier' ||
        callee.object.name !== 'http'
      ) {
        return;
      }

      const methodNode = callee.property;
      let methodName;

      if (methodNode.type === 'Identifier') {
        methodName = methodNode.name.toLowerCase();
      } else if (methodNode.type === 'StringLiteral') {
        methodName = methodNode.value.toLowerCase();
      } else {
        return;
      }

      if (!MSW_HTTP_METHODS.has(methodName)) return;

      // The first argument must be the path.
      if (!args || args.length === 0) return;
      const pathArg = args[0];

      const resolvedPath = resolveStringNode(pathArg);

      if (resolvedPath !== null) {
        handlers.push({
          method: methodName,
          path: resolvedPath,
          rawPath: resolvedPath,
          file: filePath,
          dynamic: false,
        });
      } else {
        // Dynamic path — cannot be resolved statically.
        const rawSource = describeNode(pathArg);
        handlers.push({
          method: methodName,
          path: '',
          rawPath: rawSource,
          file: filePath,
          dynamic: true,
        });
      }
    },
  });

  return handlers;
}

/**
 * Returns a human-readable description of an unresolvable AST node for
 * use in warning messages.
 *
 * @param {object} node
 * @returns {string}
 */
function describeNode(node) {
  switch (node.type) {
    case 'Identifier':
      return `<variable: ${node.name}>`;
    case 'TemplateLiteral':
      return '<template literal with expressions>';
    case 'CallExpression':
      return '<function call>';
    case 'MemberExpression':
      return '<member expression>';
    default:
      return `<${node.type}>`;
  }
}

/**
 * Reads and parses a single handler source file.
 *
 * @param {string} filePath - Path to the handler file.
 * @returns {MswHandler[]}
 * @throws {Error} If the file cannot be read.
 */
export function parseHandlerFile(filePath) {
  const absPath = resolve(filePath);
  let source;

  try {
    source = readFileSync(absPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Handler file not found: ${absPath}`);
    }
    throw new Error(`Cannot read handler file: ${absPath}\n${err.message}`);
  }

  return extractHandlersFromSource(source, absPath);
}

/**
 * Recursively discovers and parses all handler files within a directory.
 *
 * @param {string}   dirPath   - Root directory to search.
 * @param {object}   [opts]
 * @param {boolean}  [opts.recursive=true] - Whether to descend into subdirectories.
 * @returns {MswHandler[]}
 * @throws {Error} If the directory cannot be read.
 */
export function parseHandlerDirectory(dirPath, opts = {}) {
  const { recursive = true } = opts;
  const absDir = resolve(dirPath);

  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Handler directory not found: ${absDir}`);
    }
    throw new Error(`Cannot read handler directory: ${absDir}\n${err.message}`);
  }

  const handlers = [];
  const errors = [];

  for (const entry of entries) {
    const fullPath = join(absDir, entry.name);

    if (entry.isDirectory()) {
      if (recursive) {
        try {
          const nested = parseHandlerDirectory(fullPath, opts);
          handlers.push(...nested);
        } catch (err) {
          errors.push(err.message);
        }
      }
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    try {
      const fileHandlers = parseHandlerFile(fullPath);
      handlers.push(...fileHandlers);
    } catch (err) {
      // Collect parse errors but continue processing other files.
      errors.push(err.message);
    }
  }

  if (errors.length > 0) {
    // Surface all errors — prefix them so callers know the source.
    const combined = errors.map(e => `  - ${e}`).join('\n');
    throw new Error(`Errors encountered while parsing handler directory:\n${combined}`);
  }

  return handlers;
}

/**
 * Smart entry point: accepts either a file path or a directory path.
 *
 * @param {string} handlerPath
 * @returns {MswHandler[]}
 */
export function loadHandlers(handlerPath) {
  const absPath = resolve(handlerPath);

  let stat;
  try {
    stat = statSync(absPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Handler path not found: ${absPath}`);
    }
    throw new Error(`Cannot access handler path: ${absPath}\n${err.message}`);
  }

  if (stat.isDirectory()) {
    return parseHandlerDirectory(absPath);
  }

  if (stat.isFile()) {
    return parseHandlerFile(absPath);
  }

  throw new Error(`Handler path is neither a file nor a directory: ${absPath}`);
}
