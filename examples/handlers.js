// examples/handlers.js
// Example MSW v2 handler file used for testing the CLI.
// Intentionally missing: DELETE /users/{id}  and  GET /products
// Intentionally extra:   POST /legacy-users

import { http, HttpResponse } from 'msw';

export const handlers = [
  // Matched: GET /users
  http.get('/users', () => {
    return HttpResponse.json([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  }),

  // Matched: POST /users
  http.post('/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: '3', ...body }, { status: 201 });
  }),

  // Matched: GET /users/:id  (OpenAPI: /users/{id})
  http.get('/users/:id', ({ params }) => {
    return HttpResponse.json({ id: params.id, name: 'Alice' });
  }),

  // Extra handler — not in the spec
  http.post('/legacy-users', () => {
    return HttpResponse.json({ deprecated: true }, { status: 201 });
  }),
];
