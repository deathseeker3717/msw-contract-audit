// src/parser/openapi.js
// Parses OpenAPI 3.x specifications (JSON or YAML) and extracts all HTTP operations.

import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import YAML from 'yaml';

/** HTTP methods that OpenAPI 3.x supports on path items. */
const OPENAPI_HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/**
 * Reads and parses an OpenAPI 3.x specification file (JSON or YAML).
 *
 * @param {string} filePath - Absolute or relative path to the spec file.
 * @returns {object} Parsed OpenAPI document.
 * @throws {Error} If the file cannot be read or parsed.
 */
export function parseSpecFile(filePath) {
  const absPath = resolve(filePath);
  let raw;

  try {
    raw = readFileSync(absPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`OpenAPI spec file not found: ${absPath}`);
    }
    throw new Error(`Cannot read OpenAPI spec file: ${absPath}\n${err.message}`);
  }

  const ext = extname(absPath).toLowerCase();

  if (ext === '.json') {
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse JSON spec file: ${absPath}\n${err.message}`);
    }
  }

  if (ext === '.yaml' || ext === '.yml') {
    try {
      return YAML.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse YAML spec file: ${absPath}\n${err.message}`);
    }
  }

  throw new Error(
    `Unsupported spec file extension: "${ext}". Supported formats: .json, .yaml, .yml`
  );
}

/**
 * @typedef {Object} SpecOperation
 * @property {string} method   - Lowercase HTTP method (e.g. "get", "post").
 * @property {string} path     - Raw path from the spec (e.g. "/users/{id}").
 * @property {string} [operationId] - Optional operationId from the spec.
 * @property {string} [summary]     - Optional summary from the spec.
 */

/**
 * Extracts all HTTP operations from a parsed OpenAPI 3.x document.
 *
 * Validates that the document looks like an OpenAPI 3.x spec before extracting.
 *
 * @param {object} doc - Parsed OpenAPI document object.
 * @returns {SpecOperation[]} Array of operations found in the spec.
 * @throws {Error} If the document does not appear to be a valid OpenAPI 3.x spec.
 */
export function extractOperations(doc) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('Invalid OpenAPI document: expected an object.');
  }

  if (!doc.openapi) {
    throw new Error(
      'Invalid OpenAPI document: missing "openapi" version field. ' +
        'Only OpenAPI 3.x specifications are supported.'
    );
  }

  if (!doc.openapi.startsWith('3.')) {
    throw new Error(
      `Unsupported OpenAPI version: "${doc.openapi}". Only OpenAPI 3.x is supported.`
    );
  }

  const paths = doc.paths;

  if (!paths || typeof paths !== 'object') {
    // A spec with no paths is valid but produces zero operations.
    return [];
  }

  const operations = [];

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const method of OPENAPI_HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      operations.push({
        method,
        path: pathStr,
        operationId: operation.operationId ?? null,
        summary: operation.summary ?? null,
      });
    }
  }

  return operations;
}

/**
 * Convenience: parse file and extract operations in one call.
 *
 * @param {string} filePath
 * @returns {SpecOperation[]}
 */
export function loadSpec(filePath) {
  const doc = parseSpecFile(filePath);
  return extractOperations(doc);
}
