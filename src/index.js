// src/index.js
// Public programmatic API for msw-contract-audit.
// Can be used as a library in addition to the CLI.

export { parseSpecFile, extractOperations, loadSpec } from './parser/openapi.js';
export { extractHandlersFromSource, parseHandlerFile, parseHandlerDirectory, loadHandlers } from './parser/msw.js';
export { normalizeOpenApiPath, normalizeMswPath, pathsAreEquivalent, operationKey } from './analyzer/normalize.js';
export { compare } from './analyzer/compare.js';
export { renderTerminal } from './reporter/terminal.js';
export { renderJson, buildJsonReport } from './reporter/json.js';

/**
 * High-level audit function: loads spec + handlers and returns a comparison result.
 *
 * @param {object} opts
 * @param {string} opts.spec     - Path to OpenAPI spec file.
 * @param {string} opts.handlers - Path to handler file or directory.
 * @returns {import('./analyzer/compare.js').AuditResult}
 */
export async function audit({ spec, handlers }) {
  const { loadSpec } = await import('./parser/openapi.js');
  const { loadHandlers } = await import('./parser/msw.js');
  const { compare } = await import('./analyzer/compare.js');

  const specOperations = loadSpec(spec);
  const mswHandlers = loadHandlers(handlers);
  return compare(specOperations, mswHandlers);
}
