// src/reporter/json.js
// Serialises audit results to a structured JSON object.

/**
 * @typedef {import('../analyzer/compare.js').AuditResult} AuditResult
 */

/**
 * Converts an AuditResult to a plain JSON-serialisable object.
 *
 * @param {AuditResult} result
 * @param {object}      [opts]
 * @param {string}      [opts.specFile] - Spec path recorded in the report.
 * @returns {object} JSON-ready report object.
 */
export function buildJsonReport(result, opts = {}) {
  const { specFile = '' } = opts;
  const { specOperations, handlers, matched, missing, extra, coverage, warnings } = result;

  return {
    specFile,
    summary: {
      operations: specOperations.length,
      handlersFound: handlers.filter(h => !h.dynamic).length,
      dynamicHandlers: handlers.filter(h => h.dynamic).length,
      matched: matched.length,
      missing: missing.length,
      extra: extra.length,
      coverage,
    },
    matched: matched.map(op => ({
      method: op.method.toUpperCase(),
      path: op.path,
      operationId: op.operationId,
    })),
    missing: missing.map(op => ({
      method: op.method.toUpperCase(),
      path: op.path,
      operationId: op.operationId,
    })),
    extra: extra.map(h => ({
      method: h.method.toUpperCase(),
      path: h.rawPath,
      file: h.file,
    })),
    warnings,
    passed: missing.length === 0,
  };
}

/**
 * Renders the JSON report to stdout as a pretty-printed JSON string.
 *
 * @param {AuditResult} result
 * @param {object}      [opts]
 */
export function renderJson(result, opts = {}) {
  const report = buildJsonReport(result, opts);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
