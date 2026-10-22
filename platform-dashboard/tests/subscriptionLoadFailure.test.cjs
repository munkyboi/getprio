const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
test('subscription initial load handles rejection and avoids notifying after unmount', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/main.tsx'), 'utf8');
  const start = source.indexOf('function SubscriptionsPage');
  const page = source.slice(start, start + 4000);
  assert.match(page, /load\(\)\.catch\(/);
  assert.match(page, /if \(!disposed\) notifications\.show/);
  assert.match(page, /title: "Subscriptions unavailable"/);
  assert.match(page, /return \(\) => \{ disposed = true; \}/);
});

test('the actual subscription load effect reports a rejected load and suppresses late failures', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/main.tsx'), 'utf8');
  const page = source.slice(source.indexOf('function SubscriptionsPage'));
  const effect = page.slice(page.indexOf('useEffect('), page.indexOf('function openNewSubscription'));
  const script = ts.transpileModule(effect, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const notices = [];
  let rejectLoad;
  let cleanup;
  const run = () => vm.runInNewContext(script, {
    token:'fixture', Error,
    load:() => new Promise((_, reject) => { rejectLoad = reject; }),
    notifications:{show:notice => notices.push(notice)},
    useEffect:callback => { cleanup = callback(); }
  });
  run(); rejectLoad(new Error('Read model unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notices.length, 1);
  assert.equal(notices[0].message, 'Read model unavailable');
  run(); cleanup(); rejectLoad(new Error('Late failure'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notices.length, 1);
});
