// tests/msw.test.js
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

import {
  extractHandlersFromSource,
  parseHandlerFile,
  parseHandlerDirectory,
  loadHandlers,
} from '../src/parser/msw.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, '../examples');

// ── Helpers ──────────────────────────────────────────────────────────────────

let _tmpCount = 0;
function tmpDir() {
  const d = join(tmpdir(), `msw-audit-msw-${process.pid}-${++_tmpCount}`);
  mkdirSync(d, { recursive: true });
  return d;
}

function writeHandler(dir, name, content) {
  const fp = join(dir, name);
  writeFileSync(fp, content, 'utf8');
  return fp;
}

// ── extractHandlersFromSource ─────────────────────────────────────────────────

describe('extractHandlersFromSource', () => {
  it('extracts a simple GET handler', () => {
    const src = `
      import { http, HttpResponse } from 'msw';
      export const handlers = [
        http.get('/users', () => HttpResponse.json([])),
      ];
    `;
    const handlers = extractHandlersFromSource(src, 'test.js');
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toMatchObject({ method: 'get', path: '/users', dynamic: false });
  });

  it('extracts all supported HTTP methods', () => {
    const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
    const src = methods
      .map(m => `http.${m}('/path', () => {});`)
      .join('\n');
    const handlers = extractHandlersFromSource(src, 'test.js');
    expect(handlers).toHaveLength(methods.length);
    for (const m of methods) {
      expect(handlers.some(h => h.method === m)).toBe(true);
    }
  });

  it('extracts path with Express-style parameters', () => {
    const src = `http.get('/users/:id', () => {});`;
    const [h] = extractHandlersFromSource(src, 'test.js');
    expect(h.path).toBe('/users/:id');
    expect(h.dynamic).toBe(false);
  });

  it('marks dynamic path (identifier) as dynamic', () => {
    const src = `
      const path = getPath();
      http.get(path, () => {});
    `;
    const handlers = extractHandlersFromSource(src, 'test.js');
    expect(handlers).toHaveLength(1);
    expect(handlers[0].dynamic).toBe(true);
  });

  it('marks dynamic template literal with expressions as dynamic', () => {
    const src = 'http.get(`/users/${userId}`, () => {});';
    const [h] = extractHandlersFromSource(src, 'test.js');
    expect(h.dynamic).toBe(true);
  });

  it('resolves static template literal (no expressions) as static', () => {
    const src = 'http.get(`/users`, () => {});';
    const [h] = extractHandlersFromSource(src, 'test.js');
    expect(h.dynamic).toBe(false);
    expect(h.path).toBe('/users');
  });

  it('extracts multiple handlers from one file', () => {
    const src = `
      http.get('/a', () => {});
      http.post('/b', () => {});
      http.delete('/c', () => {});
    `;
    const handlers = extractHandlersFromSource(src, 'test.js');
    expect(handlers).toHaveLength(3);
  });

  it('ignores non-http member expressions (e.g. graphql.query)', () => {
    const src = `
      graphql.query('GetUser', () => {});
      http.get('/users', () => {});
    `;
    const handlers = extractHandlersFromSource(src, 'test.js');
    expect(handlers).toHaveLength(1);
    expect(handlers[0].method).toBe('get');
  });

  it('ignores unknown method names on http object', () => {
    const src = `http.connect('/path', () => {});`;
    const handlers = extractHandlersFromSource(src, 'test.js');
    expect(handlers).toHaveLength(0);
  });

  it('throws on malformed JavaScript', () => {
    const src = `function (( broken `;
    expect(() => extractHandlersFromSource(src, 'broken.js')).toThrow('Failed to parse handler file');
  });

  it('records the file path in each handler', () => {
    const src = `http.get('/test', () => {});`;
    const [h] = extractHandlersFromSource(src, '/absolute/path/handlers.js');
    expect(h.file).toBe('/absolute/path/handlers.js');
  });

  it('handles full URL paths', () => {
    const src = `http.get('https://api.example.com/users', () => {});`;
    const [h] = extractHandlersFromSource(src, 'test.js');
    expect(h.path).toBe('https://api.example.com/users');
    expect(h.dynamic).toBe(false);
  });

  it('handles TypeScript source files', () => {
    const src = `
      import { http, HttpResponse } from 'msw';
      const handlers: RequestHandler[] = [
        http.get('/users', (): Response => HttpResponse.json([]),),
      ];
    `;
    const handlers = extractHandlersFromSource(src, 'handlers.ts');
    expect(handlers).toHaveLength(1);
  });
});

// ── parseHandlerFile ──────────────────────────────────────────────────────────

describe('parseHandlerFile', () => {
  it('parses the example handlers file', () => {
    const handlers = parseHandlerFile(join(EXAMPLES_DIR, 'handlers.js'));
    expect(handlers.length).toBeGreaterThan(0);
  });

  it('throws on a missing file', () => {
    expect(() => parseHandlerFile('/no/such/file.js')).toThrow('not found');
  });

  it('throws on a malformed JS file', () => {
    const dir = tmpDir();
    const fp = writeHandler(dir, 'bad.js', '((( syntax error ');
    expect(() => parseHandlerFile(fp)).toThrow('Failed to parse handler file');
  });
});

// ── parseHandlerDirectory ─────────────────────────────────────────────────────

describe('parseHandlerDirectory', () => {
  it('discovers handlers in a flat directory', () => {
    const dir = tmpDir();
    writeHandler(dir, 'users.js', `http.get('/users', () => {});`);
    writeHandler(dir, 'products.js', `http.get('/products', () => {});`);

    const handlers = parseHandlerDirectory(dir);
    expect(handlers).toHaveLength(2);
  });

  it('recursively discovers handlers in nested directories', () => {
    const dir = tmpDir();
    const sub = join(dir, 'sub');
    mkdirSync(sub);
    writeHandler(dir, 'root.js', `http.get('/root', () => {});`);
    writeHandler(sub, 'nested.js', `http.post('/nested', () => {});`);

    const handlers = parseHandlerDirectory(dir);
    expect(handlers).toHaveLength(2);
    expect(handlers.map(h => h.method)).toEqual(expect.arrayContaining(['get', 'post']));
  });

  it('skips non-JS files', () => {
    const dir = tmpDir();
    writeHandler(dir, 'handlers.js', `http.get('/a', () => {});`);
    writeFileSync(join(dir, 'README.md'), '# docs');
    writeFileSync(join(dir, 'data.json'), '{}');

    const handlers = parseHandlerDirectory(dir);
    expect(handlers).toHaveLength(1);
  });

  it('throws on a missing directory', () => {
    expect(() => parseHandlerDirectory('/no/such/dir')).toThrow('not found');
  });

  it('throws and reports errors from malformed files', () => {
    const dir = tmpDir();
    writeHandler(dir, 'good.js', `http.get('/good', () => {});`);
    writeHandler(dir, 'bad.js', '((( broken ');
    expect(() => parseHandlerDirectory(dir)).toThrow('Errors encountered');
  });
});

// ── loadHandlers ──────────────────────────────────────────────────────────────

describe('loadHandlers', () => {
  it('loads from a file path', () => {
    const handlers = loadHandlers(join(EXAMPLES_DIR, 'handlers.js'));
    expect(handlers.length).toBeGreaterThan(0);
  });

  it('loads from a directory path', () => {
    const dir = tmpDir();
    writeHandler(dir, 'h.js', `http.get('/x', () => {});`);
    const handlers = loadHandlers(dir);
    expect(handlers).toHaveLength(1);
  });

  it('throws on a missing path', () => {
    expect(() => loadHandlers('/nonexistent')).toThrow('not found');
  });
});
