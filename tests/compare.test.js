// tests/compare.test.js
import { describe, it, expect } from 'vitest';
import { compare } from '../src/analyzer/compare.js';
import { normalizeOpenApiPath, normalizeMswPath, pathsAreEquivalent, operationKey } from '../src/analyzer/normalize.js';

// ── normalizeOpenApiPath ──────────────────────────────────────────────────────

describe('normalizeOpenApiPath', () => {
  it('converts {param} to :param', () => {
    expect(normalizeOpenApiPath('/users/{id}')).toBe('/users/:id');
  });

  it('converts multiple params', () => {
    expect(normalizeOpenApiPath('/users/{userId}/posts/{postId}'))
      .toBe('/users/:userid/posts/:postid');
  });

  it('lowercases the path', () => {
    expect(normalizeOpenApiPath('/Users/Profile')).toBe('/users/profile');
  });

  it('strips trailing slash', () => {
    expect(normalizeOpenApiPath('/users/')).toBe('/users');
  });

  it('preserves root slash', () => {
    expect(normalizeOpenApiPath('/')).toBe('/');
  });

  it('collapses double slashes', () => {
    expect(normalizeOpenApiPath('/users//posts')).toBe('/users/posts');
  });

  it('handles path with no params', () => {
    expect(normalizeOpenApiPath('/products')).toBe('/products');
  });

  it('throws on non-string input', () => {
    expect(() => normalizeOpenApiPath(42)).toThrow(TypeError);
  });
});

// ── normalizeMswPath ──────────────────────────────────────────────────────────

describe('normalizeMswPath', () => {
  it('lowercases the path', () => {
    expect(normalizeMswPath('/Users/Profile')).toBe('/users/profile');
  });

  it('strips trailing slash', () => {
    expect(normalizeMswPath('/users/')).toBe('/users');
  });

  it('extracts pathname from full URL', () => {
    expect(normalizeMswPath('https://api.example.com/users')).toBe('/users');
  });

  it('extracts pathname with params from full URL', () => {
    expect(normalizeMswPath('https://api.example.com/users/:id')).toBe('/users/:id');
  });

  it('handles plain path passthrough', () => {
    expect(normalizeMswPath('/users/:id')).toBe('/users/:id');
  });

  it('throws on non-string input', () => {
    expect(() => normalizeMswPath(null)).toThrow(TypeError);
  });
});

// ── pathsAreEquivalent ────────────────────────────────────────────────────────

describe('pathsAreEquivalent', () => {
  it('matches OpenAPI {param} with MSW :param', () => {
    expect(pathsAreEquivalent('/users/{id}', '/users/:id')).toBe(true);
  });

  it('matches identical paths', () => {
    expect(pathsAreEquivalent('/products', '/products')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(pathsAreEquivalent('/Users', '/users')).toBe(true);
  });

  it('ignores trailing slashes', () => {
    expect(pathsAreEquivalent('/users/', '/users')).toBe(true);
  });

  it('returns false for different paths', () => {
    expect(pathsAreEquivalent('/users', '/products')).toBe(false);
  });

  it('returns false when method differs (different paths)', () => {
    expect(pathsAreEquivalent('/users/{id}', '/orders/:id')).toBe(false);
  });
});

// ── operationKey ──────────────────────────────────────────────────────────────

describe('operationKey', () => {
  it('produces consistent key for OpenAPI path', () => {
    expect(operationKey('GET', '/users/{id}')).toBe('get:/users/:id');
  });

  it('produces consistent key for MSW path', () => {
    expect(operationKey('GET', '/users/:id')).toBe('get:/users/:id');
  });

  it('lowercases method', () => {
    expect(operationKey('POST', '/users')).toBe('post:/users');
  });
});

// ── compare ───────────────────────────────────────────────────────────────────

describe('compare', () => {
  // Helper builders
  const op = (method, path, operationId = null) => ({ method, path, operationId, summary: null });
  const handler = (method, path, file = 'handlers.js') => ({
    method, path, rawPath: path, file, dynamic: false,
  });
  const dynamicHandler = (method, rawPath, file = 'handlers.js') => ({
    method, path: '', rawPath, file, dynamic: true,
  });

  it('reports all matched when handlers cover all spec ops', () => {
    const result = compare(
      [op('get', '/users'), op('post', '/users')],
      [handler('get', '/users'), handler('post', '/users')]
    );
    expect(result.matched).toHaveLength(2);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
    expect(result.coverage).toBe(100);
  });

  it('reports missing when spec op has no handler', () => {
    const result = compare(
      [op('get', '/users'), op('delete', '/users')],
      [handler('get', '/users')]
    );
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].method).toBe('delete');
    expect(result.coverage).toBe(50);
  });

  it('reports extra when handler has no spec op', () => {
    const result = compare(
      [op('get', '/users')],
      [handler('get', '/users'), handler('post', '/legacy')]
    );
    expect(result.extra).toHaveLength(1);
    expect(result.extra[0].rawPath).toBe('/legacy');
  });

  it('normalizes OpenAPI {param} and MSW :param as equivalent', () => {
    const result = compare(
      [op('get', '/users/{id}')],
      [handler('get', '/users/:id')]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.missing).toHaveLength(0);
  });

  it('normalizes full URL in handlers', () => {
    const result = compare(
      [op('get', '/users')],
      [{ method: 'get', path: 'https://api.example.com/users', rawPath: 'https://api.example.com/users', file: 'h.js', dynamic: false }]
    );
    expect(result.matched).toHaveLength(1);
  });

  it('reports dynamic handlers as warnings and excludes them from matching', () => {
    const result = compare(
      [op('get', '/users')],
      [dynamicHandler('get', '<variable: path>')]
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/Dynamic handler/);
    expect(result.missing).toHaveLength(1); // spec op unmatched
  });

  it('reports duplicate handlers as warnings', () => {
    const result = compare(
      [op('get', '/users')],
      [handler('get', '/users'), handler('get', '/users')]
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/Duplicate handler/);
    expect(result.matched).toHaveLength(1); // counted once
  });

  it('reports 100% coverage when spec has no operations', () => {
    const result = compare([], [handler('get', '/anything')]);
    expect(result.coverage).toBe(100);
    expect(result.extra).toHaveLength(1);
  });

  it('is case-insensitive on method names', () => {
    const result = compare(
      [op('get', '/users')],
      [{ method: 'GET', path: '/users', rawPath: '/users', file: 'h.js', dynamic: false }]
    );
    expect(result.matched).toHaveLength(1);
  });

  it('distinguishes GET vs POST on same path', () => {
    const result = compare(
      [op('get', '/users'), op('post', '/users')],
      [handler('get', '/users')]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.missing[0].method).toBe('post');
  });

  it('runs the full example scenario correctly', () => {
    // Spec: GET /users, POST /users, GET /users/{id}, DELETE /users/{id}, GET /products
    // Handlers: GET /users, POST /users, GET /users/:id, POST /legacy-users (extra)
    const specOps = [
      op('get', '/users', 'listUsers'),
      op('post', '/users', 'createUser'),
      op('get', '/users/{id}', 'getUser'),
      op('delete', '/users/{id}', 'deleteUser'),
      op('get', '/products', 'listProducts'),
    ];
    const handlers = [
      handler('get', '/users'),
      handler('post', '/users'),
      handler('get', '/users/:id'),
      handler('post', '/legacy-users'),
    ];
    const result = compare(specOps, handlers);

    expect(result.matched).toHaveLength(3);
    expect(result.missing).toHaveLength(2);
    expect(result.extra).toHaveLength(1);
    expect(result.coverage).toBe(60);
    expect(result.missing.map(o => o.method + ' ' + o.path)).toEqual(
      expect.arrayContaining(['delete /users/{id}', 'get /products'])
    );
    expect(result.extra[0].rawPath).toBe('/legacy-users');
  });
});
