const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('frontend/src/pages/UniversalAuthPage.tsx', 'utf8');
test('business category Select maps current canonical API names to unchanged ID values', () => {
  assert.match(source, /<Select name="categoryId" required defaultValue="" items=\{categories\.map\(category => \(\{ value: category\.id, label: category\.name \}\)\)\}/);
  assert.match(source, /SelectItem key=\{category\.id\} value=\{category\.id\}>\{category\.name\}/);
  assert.match(source, /setCategories\(data\.items\)/);
});
test('public registration still submits original FormData categoryId without name substitution', () => {
  assert.match(source, /Object\.fromEntries\(new FormData\(event\.currentTarget\)\)/);
  assert.match(source, /body: \{ \.\.\.values, surface: app \}/);
});
