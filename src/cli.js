#!/usr/bin/env node
// src/cli.js
// Command-line interface for msw-contract-audit.

import { program } from 'commander';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSpec } from './parser/openapi.js';
import { loadHandlers } from './parser/msw.js';
import { compare } from './analyzer/compare.js';
import { renderTerminal } from './reporter/terminal.js';
import { renderJson } from './reporter/json.js';

// Read version from package.json at runtime (avoids hard-coding).
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf8')
);

program
  .name('msw-contract-audit')
  .description(
    'Audit MSW v2 HTTP handlers against an OpenAPI 3.x specification.\n' +
    'Detects missing mocks and extra handlers before your frontend tests run.'
  )
  .version(pkg.version, '-v, --version')
  .requiredOption(
    '-s, --spec <path>',
    'Path to the OpenAPI specification file (.yaml, .yml, or .json)'
  )
  .requiredOption(
    '-H, --handlers <path>',
    'Path to an MSW handler file or a directory containing handler files'
  )
  .option(
    '-f, --format <format>',
    'Output format: "terminal" (default) or "json"',
    'terminal'
  )
  .option(
    '--verbose',
    'Also list matched operations in the terminal report',
    false
  )
  .option(
    '--no-fail-on-extra',
    'Do not exit with code 1 when extra handlers are found (missing handlers always fail)',
    false
  )
  .action(runAudit);

program.parse(process.argv);

// ─────────────────────────────────────────────────────────────────────────────

async function runAudit(opts) {
  const { spec, handlers, format, verbose, failOnExtra } = opts;

  // Validate format option early.
  if (format !== 'terminal' && format !== 'json') {
    process.stderr.write(
      `Error: unsupported format "${format}". Choose "terminal" or "json".\n`
    );
    process.exit(2);
  }

  // ── Load spec ─────────────────────────────────────────────────────────────
  let specOperations;
  try {
    specOperations = loadSpec(spec);
  } catch (err) {
    process.stderr.write(`Error loading spec: ${err.message}\n`);
    process.exit(2);
  }

  // ── Load handlers ─────────────────────────────────────────────────────────
  let mswHandlers;
  try {
    mswHandlers = loadHandlers(handlers);
  } catch (err) {
    process.stderr.write(`Error loading handlers: ${err.message}\n`);
    process.exit(2);
  }

  // ── Compare ───────────────────────────────────────────────────────────────
  const result = compare(specOperations, mswHandlers);

  // ── Report ────────────────────────────────────────────────────────────────
  const reportOpts = { specFile: spec, verbose };

  if (format === 'json') {
    renderJson(result, reportOpts);
  } else {
    renderTerminal(result, reportOpts);
  }

  // ── Exit code ─────────────────────────────────────────────────────────────
  // Exit 0 = pass, Exit 1 = audit failure (CI-compatible).
  const hasMissing = result.missing.length > 0;
  const hasExtra   = result.extra.length > 0 && failOnExtra !== false;

  if (hasMissing || hasExtra) {
    process.exit(1);
  }

  process.exit(0);
}
