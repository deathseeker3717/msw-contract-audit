// tests/openapi.test.js
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { parseSpecFile, extractOperations, loadSpec } from '../src/parser/openapi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, '../examples');

// ── Helpers ──────────────────────────────────────────────────────────────────

function tmpFile(name, content) {
  const dir = join(tmpdir(), 'msw-audit-test-' + process.pid);
  mkdirSync(dir, { recursive: true });
  const fp = join(dir, name);
  writeFileSync(fp, content, 'utf8');
  return fp;
}

// ── parseSpecFile ─────────────────────────────────────────────────────────────

describe('parseSpecFile', () => {
  it('parses a valid YAML spec', () => {
    const doc = parseSpecFile(join(EXAMPLES_DIR, 'openapi.yaml'));
    expect(doc).toMatchObject({ openapi: '3.0.3' });
    expect(doc.paths).toBeDefined();
  });

  it('parses a valid JSON spec', () => {
    const fp = tmpFile('spec.json', JSON.stringify({
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/ping': { get: { responses: { '200': { description: 'OK' } } } },
      },
    }));
    const doc = parseSpecFile(fp);
    expect(doc.openapi).toBe('3.0.3');
  });

  it('throws on a missing file', () => {
    expect(() => parseSpecFile('/nonexistent/spec.yaml')).toThrow('not found');
  });

  it('throws on an invalid YAML file', () => {
    const fp = tmpFile('bad.yaml', ': invalid: yaml: [\n');
    expect(() => parseSpecFile(fp)).toThrow('Failed to parse YAML');
  });

  it('throws on an invalid JSON file', () => {
    const fp = tmpFile('bad.json', '{ not valid json ');
    expect(() => parseSpecFile(fp)).toThrow('Failed to parse JSON');
  });

  it('throws on an unsupported extension', () => {
    const fp = tmpFile('spec.toml', 'openapi = "3.0.3"');
    expect(() => parseSpecFile(fp)).toThrow('Unsupported spec file extension');
  });
});

// ── extractOperations ─────────────────────────────────────────────────────────

describe('extractOperations', () => {
  it('extracts all HTTP methods from a path item', () => {
    const doc = {
      openapi: '3.0.3',
      paths: {
        '/items': {
          get: { responses: { '200': { description: 'OK' } } },
          post: { responses: { '201': { description: 'Created' } } },
          delete: { responses: { '204': { description: 'No Content' } } },
        },
      },
    };
    const ops = extractOperations(doc);
    expect(ops).toHaveLength(3);
    expect(ops.map(o => o.method)).toEqual(expect.arrayContaining(['get', 'post', 'delete']));
  });

  it('extracts operationId and summary when present', () => {
    const doc = {
      openapi: '3.0.3',
      paths: {
        '/users': {
          get: { operationId: 'listUsers', summary: 'List users', responses: {} },
        },
      },
    };
    const [op] = extractOperations(doc);
    expect(op.operationId).toBe('listUsers');
    expect(op.summary).toBe('List users');
  });

  it('returns empty array when paths is absent', () => {
    const doc = { openapi: '3.0.3', info: { title: 'T', version: '1' } };
    expect(extractOperations(doc)).toEqual([]);
  });

  it('throws when openapi field is missing', () => {
    expect(() => extractOperations({ paths: {} })).toThrow('missing "openapi" version field');
  });

  it('throws when openapi version is not 3.x', () => {
    expect(() => extractOperations({ openapi: '2.0' })).toThrow('Unsupported OpenAPI version');
  });

  it('throws when document is not an object', () => {
    expect(() => extractOperations(null)).toThrow('Invalid OpenAPI document');
    expect(() => extractOperations('string')).toThrow('Invalid OpenAPI document');
  });

  it('handles path parameters in paths correctly', () => {
    const doc = {
      openapi: '3.0.3',
      paths: {
        '/users/{id}': {
          get: { responses: {} },
          delete: { responses: {} },
        },
        '/users/{id}/posts/{postId}': {
          get: { responses: {} },
        },
      },
    };
    const ops = extractOperations(doc);
    expect(ops).toHaveLength(3);
    expect(ops.map(o => o.path)).toContain('/users/{id}');
    expect(ops.map(o => o.path)).toContain('/users/{id}/posts/{postId}');
  });

  it('ignores non-HTTP-method keys on path items', () => {
    const doc = {
      openapi: '3.0.3',
      paths: {
        '/test': {
          get: { responses: {} },
          summary: 'some summary',
          parameters: [],
          'x-custom': true,
        },
      },
    };
    const ops = extractOperations(doc);
    expect(ops).toHaveLength(1);
    expect(ops[0].method).toBe('get');
  });
});

// ── loadSpec (integration) ────────────────────────────────────────────────────

describe('loadSpec (integration)', () => {
  it('loads the example spec and returns 5 operations', () => {
    const ops = loadSpec(join(EXAMPLES_DIR, 'openapi.yaml'));
    expect(ops).toHaveLength(5);
  });

  it('all operations have method and path', () => {
    const ops = loadSpec(join(EXAMPLES_DIR, 'openapi.yaml'));
    for (const op of ops) {
      expect(op.method).toBeTruthy();
      expect(op.path).toBeTruthy();
    }
  });
});
