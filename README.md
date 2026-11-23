# msw-contract-audit

> CLI and library to audit MSW v2 HTTP handlers against an OpenAPI 3.x specification.  
> Detects missing mocks and extra routes before your frontend tests run.

[![npm version](https://img.shields.io/npm/v/msw-contract-audit)](https://www.npmjs.com/package/msw-contract-audit)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Why?

When you maintain MSW handlers alongside a growing API, things drift silently:

- A new endpoint is added to the spec but nobody writes an MSW handler.
- A route is renamed in the spec but the old handler stays.
- A developer removes an endpoint but the mock lives on.

`msw-contract-audit` reads your OpenAPI spec and your MSW handler files, then tells you exactly what's missing, what's extra, and what your coverage percentage is — in seconds, before tests run.

---

## Installation

```bash
npm install --save-dev msw-contract-audit
```

Or run it directly with npx (no install needed):

```bash
npx msw-contract-audit --spec ./openapi.yaml --handlers ./src/mocks/handlers.js
```

---

## Quick start

Given an OpenAPI spec:

```yaml
# openapi.yaml
openapi: "3.0.3"
paths:
  /users:
    get: { responses: { "200": { description: OK } } }
    post: { responses: { "201": { description: Created } } }
  /users/{id}:
    get: { responses: { "200": { description: OK } } }
    delete: { responses: { "204": { description: No Content } } }
  /products:
    get: { responses: { "200": { description: OK } } }
```

And MSW handlers:

```js
// src/mocks/handlers.js
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/users', () => HttpResponse.json([])),
  http.post('/users', () => HttpResponse.json({}, { status: 201 })),
  http.get('/users/:id', () => HttpResponse.json({})),
  http.post('/legacy-users', () => HttpResponse.json({})), // extra!
];
// Missing: DELETE /users/{id}  and  GET /products
```

Run the audit:

```bash
npx msw-contract-audit --spec openapi.yaml --handlers src/mocks/handlers.js
```

Output:

```
MSW CONTRACT AUDIT
──────────────────────────────────────────────────

Specification: openapi.yaml

Operations:     5
Handlers found: 4
Matched:        3
Missing:        2
Extra:          1

MISSING HANDLERS
  ✗ DELETE /users/{id}
  ✗ GET /products

EXTRA HANDLERS
  + POST /legacy-users  (src/mocks/handlers.js)

Coverage: 60%

✗ Audit failed: missing handlers detected.
```

Exit code is `1` (CI-compatible).

---

## CLI reference

```
Usage: msw-contract-audit [options]

Options:
  -s, --spec <path>        Path to OpenAPI spec (.yaml, .yml, .json)   [required]
  -H, --handlers <path>    Path to handler file or directory            [required]
  -f, --format <format>    Output format: "terminal" (default) or "json"
  --verbose                Also list matched operations
  --no-fail-on-extra       Do not exit 1 when extra handlers are found
  -v, --version            Print version
  -h, --help               Show help
```

### Examples

Audit a single handler file against a YAML spec:

```bash
npx msw-contract-audit --spec ./openapi.yaml --handlers ./src/mocks/handlers.js
```

Audit an entire directory of handlers (recursive):

```bash
npx msw-contract-audit --spec ./openapi.yaml --handlers ./src/mocks
```

Output as JSON (for CI tooling or dashboards):

```bash
npx msw-contract-audit --spec ./openapi.json --handlers ./src/mocks --format json
```

Verbose: also list matched handlers:

```bash
npx msw-contract-audit --spec ./openapi.yaml --handlers ./src/mocks --verbose
```

Do not fail on extra handlers (only fail on missing):

```bash
npx msw-contract-audit --spec ./openapi.yaml --handlers ./src/mocks --no-fail-on-extra
```

---

## JSON output format

When `--format json` is used, the output is a structured JSON object:

```json
{
  "specFile": "openapi.yaml",
  "summary": {
    "operations": 5,
    "handlersFound": 4,
    "dynamicHandlers": 0,
    "matched": 3,
    "missing": 2,
    "extra": 1,
    "coverage": 60
  },
  "matched": [
    { "method": "GET", "path": "/users", "operationId": "listUsers" }
  ],
  "missing": [
    { "method": "DELETE", "path": "/users/{id}", "operationId": "deleteUser" },
    { "method": "GET", "path": "/products", "operationId": "listProducts" }
  ],
  "extra": [
    { "method": "POST", "path": "/legacy-users", "file": "handlers.js" }
  ],
  "warnings": [],
  "passed": false
}
```

---

## Path parameter normalization

The tool treats OpenAPI `{param}` syntax and MSW/Express `:param` syntax as equivalent.

| OpenAPI path | MSW handler path | Match? |
|---|---|---|
| `/users/{id}` | `/users/:id` | ✅ Yes |
| `/users/{userId}/posts/{postId}` | `/users/:userId/posts/:postId` | ✅ Yes |
| `/users/{id}` | `/users/:userId` | ✅ Yes (param name ignored) |
| `/users/{id}` | `/orders/:id` | ❌ No |

Full URLs in handlers are supported:

```js
http.get('https://api.example.com/users/:id', resolver)
// matched as GET /users/{id}
```

---

## Dynamic handlers

Handlers whose path cannot be determined statically are reported as warnings
rather than silently ignored:

```js
// These are dynamic — cannot be matched
http.get(buildUrl('users'), resolver);       // function call
http.get(`/users/${userId}/posts`, resolver); // template literal with expression
http.get(routeMap.users, resolver);          // member expression
```

Output:

```
WARNINGS
  ⚠ Dynamic handler cannot be statically resolved and will not be matched:
    GET <function call> (in src/mocks/handlers.js)
```

---

## Programmatic API

```js
import { loadSpec, loadHandlers, compare, renderTerminal } from 'msw-contract-audit';

const specOperations = loadSpec('./openapi.yaml');
const handlers       = loadHandlers('./src/mocks/handlers.js');
const result         = compare(specOperations, handlers);

renderTerminal(result, { specFile: './openapi.yaml' });

if (result.missing.length > 0) {
  process.exit(1);
}
```

### Available exports

| Export | Description |
|---|---|
| `loadSpec(path)` | Parse OpenAPI file; return `SpecOperation[]` |
| `extractOperations(doc)` | Extract operations from a parsed OpenAPI object |
| `loadHandlers(path)` | Parse file or directory; return `MswHandler[]` |
| `extractHandlersFromSource(source, file)` | Parse a source string |
| `compare(specOps, handlers)` | Compare and return `AuditResult` |
| `normalizeOpenApiPath(path)` | Normalize `{param}` → `:param` |
| `normalizeMswPath(path)` | Normalize MSW path or URL |
| `pathsAreEquivalent(a, b)` | Check if two paths are the same |
| `renderTerminal(result, opts)` | Print colour terminal output |
| `renderJson(result, opts)` | Print JSON output |
| `buildJsonReport(result, opts)` | Build JSON object (no print) |

---

## CI integration

Add to your CI pipeline before running tests:

```yaml
# GitHub Actions example
- name: Audit MSW handlers
  run: npx msw-contract-audit --spec ./openapi.yaml --handlers ./src/mocks
```

The command exits with code `1` if any spec operations are missing a handler.

---

## Supported file types

Handler discovery supports:
- `.js`, `.mjs`, `.cjs`
- `.ts`, `.tsx`
- `.jsx`

---

## Known limitations

1. **Dynamic handler paths are not resolved.** Handlers using variables, function calls, or template literals with expressions cannot be matched statically. They are reported as warnings.
2. **OpenAPI `$ref` resolution is not performed.** Schemas with `$ref` pointers are not followed. All paths must be inlined in the `paths` object.
3. **OpenAPI 2.x (Swagger) is not supported.** Only OpenAPI 3.x specifications.
4. **Response schema validation is out of scope.** The tool checks that handlers *exist* for each operation, not that their responses match the spec schemas.
5. **Handler expressions outside `http.*()` calls are not detected.** Handlers in arrays, spread patterns, or factory functions that don't directly call `http.<method>()` may not be found.

---

## Running locally

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run the CLI against the example project
npm run audit:example

# Output as JSON
npm run audit:example:json

# Verbose output (shows matched operations too)
node src/cli.js --spec examples/openapi.yaml --handlers examples/handlers.js --verbose

# Check what would be published
npm run pack:dry
```

---

## Publishing to npm

> **Do not publish without explicit approval.**

When ready:

1. Ensure tests pass: `npm test`
2. Update `version` in `package.json` following [semver](https://semver.org/)
3. Update `CHANGELOG.md` (create one if needed)
4. Dry-run pack: `npm pack --dry-run` — verify only `src/`, `README.md`, `LICENSE` are included
5. Login to npm: `npm login`
6. Publish: `npm publish --access public`

---

## License

[MIT](LICENSE)
