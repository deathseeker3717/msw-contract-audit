// src/reporter/terminal.js
// Renders audit results to the terminal with ANSI colour codes.

/** ANSI helpers — only applied when stdout is a TTY. */
const isTTY = process.stdout.isTTY;

const c = {
  reset:  (s) => isTTY ? `\x1b[0m${s}\x1b[0m`  : s,
  bold:   (s) => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
  red:    (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  green:  (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  yellow: (s) => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  cyan:   (s) => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
  dim:    (s) => isTTY ? `\x1b[2m${s}\x1b[0m`  : s,
};

/**
 * @typedef {import('../analyzer/compare.js').AuditResult} AuditResult
 */

/**
 * Renders an audit result to the terminal.
 *
 * @param {AuditResult} result
 * @param {object}      [opts]
 * @param {string}      [opts.specFile]  - Path shown in the header.
 * @param {boolean}     [opts.verbose]   - If true, also list matched operations.
 */
export function renderTerminal(result, opts = {}) {
  const { specFile = 'spec', verbose = false } = opts;
  const { specOperations, handlers, matched, missing, extra, coverage, warnings } = result;

  const lines = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(c.bold('MSW CONTRACT AUDIT'));
  lines.push(c.dim('─'.repeat(50)));
  lines.push('');
  lines.push(`${c.dim('Specification:')} ${specFile}`);
  lines.push('');

  // ── Summary table ─────────────────────────────────────────────────────────
  lines.push(`${c.bold('Operations:')}     ${specOperations.length}`);
  lines.push(`${c.bold('Handlers found:')} ${handlers.filter(h => !h.dynamic).length}`);

  const matchedStr = matched.length > 0 ? c.green(String(matched.length)) : '0';
  const missingStr = missing.length > 0 ? c.red(String(missing.length))   : c.green('0');
  const extraStr   = extra.length   > 0 ? c.yellow(String(extra.length))  : '0';

  lines.push(`${c.bold('Matched:')}        ${matchedStr}`);
  lines.push(`${c.bold('Missing:')}        ${missingStr}`);
  lines.push(`${c.bold('Extra:')}          ${extraStr}`);
  lines.push('');

  // ── Warnings ──────────────────────────────────────────────────────────────
  if (warnings.length > 0) {
    lines.push(c.yellow(c.bold('WARNINGS')));
    for (const w of warnings) {
      lines.push(`  ${c.yellow('⚠')} ${w}`);
    }
    lines.push('');
  }

  // ── Verbose: matched ──────────────────────────────────────────────────────
  if (verbose && matched.length > 0) {
    lines.push(c.green(c.bold('MATCHED HANDLERS')));
    for (const op of matched) {
      lines.push(`  ${c.green('✓')} ${op.method.toUpperCase()} ${op.path}`);
    }
    lines.push('');
  }

  // ── Missing handlers ──────────────────────────────────────────────────────
  if (missing.length > 0) {
    lines.push(c.red(c.bold('MISSING HANDLERS')));
    for (const op of missing) {
      lines.push(`  ${c.red('✗')} ${op.method.toUpperCase()} ${op.path}`);
    }
    lines.push('');
  }

  // ── Extra handlers ────────────────────────────────────────────────────────
  if (extra.length > 0) {
    lines.push(c.yellow(c.bold('EXTRA HANDLERS')));
    for (const h of extra) {
      lines.push(`  ${c.yellow('+')} ${h.method.toUpperCase()} ${h.rawPath}  ${c.dim(`(${h.file})`)}`);
    }
    lines.push('');
  }

  // ── Coverage ──────────────────────────────────────────────────────────────
  const covColor = coverage >= 80 ? c.green : coverage >= 50 ? c.yellow : c.red;
  lines.push(`${c.bold('Coverage:')} ${covColor(`${coverage}%`)}`);
  lines.push('');

  // ── Final verdict ─────────────────────────────────────────────────────────
  if (missing.length === 0 && extra.length === 0) {
    lines.push(c.green(c.bold('✓ Audit passed: all spec operations are covered.')));
  } else if (missing.length > 0) {
    lines.push(c.red(c.bold('✗ Audit failed: missing handlers detected.')));
  } else {
    lines.push(c.yellow(c.bold('⚠ Audit passed with warnings: extra handlers found.')));
  }
  lines.push('');

  process.stdout.write(lines.join('\n'));
}
