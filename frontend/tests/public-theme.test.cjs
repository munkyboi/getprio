const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), vm = require('node:vm');
const { buildSync } = require('esbuild');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function render(saved, systemDark) {
  const entry = buildSync({ stdin: { contents: 'export { PublicThemeProvider, usePublicTheme } from "./surfaces/PublicTheme"; export { default as Toggle } from "./marketing/ThemeToggle"; export { TooltipProvider } from "./vendor/components/ui/tooltip";', resolveDir: path.resolve(__dirname, '../src'), loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty' }, alias: {'@vendor':path.resolve(__dirname,'../src/vendor')}, jsx: 'automatic' });
  const module = { exports: {} };
  vm.runInNewContext(entry.outputFiles[0].text, { module, exports: module.exports, require, window: { localStorage: { getItem: key => key === 'getprio.public.auth.theme' ? saved : null }, matchMedia: () => ({ matches: systemDark }) } });
  const { PublicThemeProvider, usePublicTheme, Toggle, TooltipProvider } = module.exports;
  function Probe() { const state = usePublicTheme(); return React.createElement('section', { 'data-theme': state.theme }, React.createElement(Toggle)); }
  return renderToStaticMarkup(React.createElement(PublicThemeProvider, null, React.createElement(TooltipProvider, null, React.createElement(Probe))));
}
test('public shell theme and icon toggle share the retained explicit preference', () => {
  const dark = render('dark', false);
  assert.match(dark, /data-theme="dark"/);
  assert.match(dark, /aria-label="Switch to light mode"/);
  assert.match(dark, /tabler-icon-sun/);
  assert.doesNotMatch(dark, />Light theme<|>Dark theme</);
  const light = render('light', true);
  assert.match(light, /data-theme="light"/);
  assert.match(light, /aria-label="Switch to dark mode"/);
  assert.match(light, /tabler-icon-moon/);
});
test('all public pages can inherit system scheme without a stored preference', () => {
  assert.match(render(null, true), /data-theme="dark"/);
  assert.match(render(null, false), /data-theme="light"/);
});
