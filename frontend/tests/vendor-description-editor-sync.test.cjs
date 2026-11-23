require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const editorSource = () => fs.readFileSync(
  path.join(__dirname, '../src/components/CampaignDescriptionEditor.tsx'),
  'utf8'
);

test('external description hydration replaces editor content without emitting an update', () => {
  const source = editorSource();
  assert.match(source, /editor\.commands\.setContent\(nextValue, \{ emitUpdate: false \}\)/);
  assert.match(source, /if \(editor\.getHTML\(\) !== nextValue\)/);
});

test('parent echoes are ignored when the editor already contains the value', () => {
  const source = editorSource();
  assert.match(source, /editor\.getHTML\(\) !== nextValue/);
  assert.match(source, /useEffect\(\(\) => \{/);
  assert.match(source, /\[editor, value\]/);
});

test('normal user edits call onChange while external hydration stays bounded', () => {
  const source = editorSource();
  assert.match(source, /onUpdate: \(\{ editor: updatedEditor \}\) =>/);
  assert.match(source, /onChange\(nextValue\)/);
  assert.match(source, /emitUpdate: false/);
  assert.match(source, /getPlainText\(nextValue\)\.length > maxCharacters/);
});

test('vendor settings bind the editor to the current public profile description', () => {
  const page = fs.readFileSync(path.join(__dirname, '../src/pages/VendorDashboardPage.tsx'), 'utf8');
  assert.match(page, /<CampaignDescriptionEditor/);
  assert.match(page, /maxCharacters=\{1000\}/);
  assert.match(page, /value=\{settings\.publicProfileDescription \|\| ""\}/);
  assert.match(page, /publicProfileDescription: value/);
});
