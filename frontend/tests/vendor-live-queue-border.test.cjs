const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('separated Live Queue toolbar buttons restore the border suppressed by grouped controls', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/vendor/styles.css'), 'utf8');
  assert.match(css, /\.vendor-live-queue \.vendor-queue-primary-actions\s*\{[^}]*gap:\s*8px/);
  assert.match(css, /\.vendor-live-queue \.vendor-queue-primary-actions\s*>\s*\[data-slot="button"\]\s*\{[^}]*border-left-width:\s*1px/);
});
