// src/analyzer/normalize.js
// Path normalization utilities: converts between OpenAPI and Express/MSW path
// parameter syntax and strips trailing slashes for consistent comparison.

/**
 * Normalizes an OpenAPI-style path to a canonical form:
 * - Replaces `{param}` placeholders with `:param`.
 * - Removes trailing slashes (except for root "/").
 * - Collapses multiple consecutive slashes.
 * - Lowercases the entire path.
 *
 * @param {string} path - OpenAPI path (e.g. "/users/{id}/posts/{postId}").
 * @returns {string} Normalized path (e.g. "/users/:id/posts/:postId").
 */
export function normalizeOpenApiPath(path) {
  if (typeof path !== 'string') {
    throw new TypeError(`normalizeOpenApiPath: expected string, got ${typeof path}`);
  }

  return path
    .toLowerCase()
    .replace(/\{([^}]+)\}/g, ':$1')   // {id} → :id
    .replace(/\/+/g, '/')             // collapse // → /
    .replace(/(?<!^)\/$/, '');        // strip trailing slash (not root)
}

/**
 * Normalizes an MSW/Express-style path to canonical form:
 * - Already uses `:param` syntax — kept as-is.
 * - Removes trailing slashes (except for root "/").
 * - Collapses multiple consecutive slashes.
 * - Lowercases the entire path.
 *
 * Also handles full URLs (e.g. "https://api.example.com/users/:id"):
 * strips the scheme+host and returns only the pathname.
 *
 * @param {string} path - MSW path or full URL.
 * @returns {string} Normalized path.
 */
export function normalizeMswPath(path) {
  if (typeof path !== 'string') {
    throw new TypeError(`normalizeMswPath: expected string, got ${typeof path}`);
  }

  let normalized = path;

  // Strip scheme + host if the handler uses a full URL.
  try {
    const url = new URL(path);
    normalized = url.pathname + (url.search || '');
  } catch {
    // Not a full URL — treat as a plain path. That's fine.
  }

  return normalized
    .toLowerCase()
    .replace(/\/+/g, '/')           // collapse //
    .replace(/(?<!^)\/$/, '');      // strip trailing slash (not root)
}

/**
 * Returns true when two paths represent the same endpoint after normalization.
 * Accepts mixed OpenAPI / MSW / Express syntax on either side.
 *
 * @param {string} a - First path (any format).
 * @param {string} b - Second path (any format).
 * @returns {boolean}
 */
export function pathsAreEquivalent(a, b) {
  const na = normalizeOpenApiPath(a);
  const nb = normalizeOpenApiPath(b);
  return na === nb;
}

/**
 * Builds a canonical operation key string from an HTTP method and path.
 * Used as the unique identifier for map lookups in the comparator.
 *
 * @param {string} method - HTTP method (case-insensitive).
 * @param {string} path   - Path in any supported format.
 * @returns {string}  e.g. "get:/users/:id"
 */
export function operationKey(method, path) {
  return `${method.toLowerCase()}:${normalizeOpenApiPath(path)}`;
}
