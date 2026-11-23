// src/analyzer/compare.js
// Compares extracted OpenAPI spec operations against discovered MSW handlers.

import { operationKey, normalizeOpenApiPath, normalizeMswPath } from './normalize.js';

/**
 * @typedef {import('../parser/openapi.js').SpecOperation} SpecOperation
 * @typedef {import('../parser/msw.js').MswHandler} MswHandler
 */

/**
 * @typedef {Object} AuditResult
 * @property {SpecOperation[]} specOperations   - All operations found in the spec.
 * @property {MswHandler[]}    handlers         - All handlers found in source files.
 * @property {SpecOperation[]} matched          - Spec operations that have a handler.
 * @property {SpecOperation[]} missing          - Spec operations with no handler.
 * @property {MswHandler[]}    extra            - Handlers with no matching spec operation.
 * @property {number}          coverage         - Percentage (0–100) of spec ops covered.
 * @property {string[]}        warnings         - Non-fatal issues (e.g. dynamic handlers).
 */

/**
 * Compares a list of OpenAPI operations against a list of MSW handlers.
 *
 * Rules:
 * - Both method and normalized path must match.
 * - OpenAPI `{param}` and MSW `:param` are treated as equivalent.
 * - Handlers that could not be statically resolved (dynamic paths) are reported
 *   as warnings rather than silently ignored.
 *
 * @param {SpecOperation[]} specOperations
 * @param {MswHandler[]} handlers
 * @returns {AuditResult}
 */
export function compare(specOperations, handlers) {
  const warnings = [];

  // Build a map of handler keys for O(1) lookup.
  // key → MswHandler
  const handlerMap = new Map();

  for (const handler of handlers) {
    if (handler.dynamic) {
      warnings.push(
        `Dynamic handler cannot be statically resolved and will not be matched: ` +
          `${handler.method.toUpperCase()} ${handler.rawPath} (in ${handler.file})`
      );
      continue;
    }

    const key = `${handler.method.toLowerCase()}:${normalizeMswPath(handler.path)}`;

    if (handlerMap.has(key)) {
      warnings.push(
        `Duplicate handler detected and will be counted once: ` +
          `${handler.method.toUpperCase()} ${handler.rawPath} (in ${handler.file})`
      );
      continue;
    }

    handlerMap.set(key, handler);
  }

  const matched = [];
  const missing = [];

  // Build a set of spec keys for reverse lookup.
  const specKeySet = new Set();

  for (const op of specOperations) {
    const key = operationKey(op.method, op.path);
    specKeySet.add(key);

    if (handlerMap.has(key)) {
      matched.push(op);
    } else {
      missing.push(op);
    }
  }

  // Extra handlers: handlers whose key isn't in the spec.
  const extra = [];
  for (const [key, handler] of handlerMap.entries()) {
    if (!specKeySet.has(key)) {
      extra.push(handler);
    }
  }

  const total = specOperations.length;
  const coverage = total === 0 ? 100 : Math.round((matched.length / total) * 100);

  return {
    specOperations,
    handlers,
    matched,
    missing,
    extra,
    coverage,
    warnings,
  };
}
