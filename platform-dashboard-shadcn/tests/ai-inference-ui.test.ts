import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { readFileSync } from 'node:fs'
import { buildSync } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const compiled = buildSync({
  entryPoints: [fileURLToPath(new URL('../src/components/platform-ai-inference.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/server', 'react-dom/client'],
  tsconfig: fileURLToPath(new URL('../tsconfig.app.json', import.meta.url)),
  define: { 'import.meta.env': JSON.stringify({ DEV: true }) }
}).outputFiles[0].text
const module = { exports: {} as { PlatformAiInference: Parameters<typeof createElement>[0] } }
runInNewContext(compiled, { module, exports: module.exports, require,
  window: { location: { hostname: 'localhost' } }, process, console, setTimeout, clearTimeout, URL, URLSearchParams })
const render = (props: Record<string, boolean>) => renderToStaticMarkup(createElement(module.exports.PlatformAiInference,
  { live: true, canRead: true, canManage: true, ...props }))
test('unauthorized UI renders denial without policy controls', () => {
  const html = render({ canRead: false })
  assert.match(html, /Access denied/)
  assert.doesNotMatch(html, /Review policy|Disable globally/)
})
test('fixture mode cannot expose live policy mutations', () => {
  const html = render({ live: false })
  assert.match(html, /Live policy required/)
  assert.doesNotMatch(html, /Review policy|Disable globally/)
})
test('loading announces status before any policy becomes actionable', () => {
  const html = render({})
  assert.match(html, /role="status"[^>]*>Loading inference policy/)
  assert.doesNotMatch(html, /Review policy|Disable globally/)
})
test('resource controls are available independently while AI policy is loading', () => {
  const html = render({canReadResources:true})
  assert.match(html,/Loading inference policy/)
  assert.match(html,/Load resource report|Find locations/)
})
test('AI sidebar route uses the dedicated read capability', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /label: "AI Inference".*capability: "platform\.ai_inference\.read"/)
  assert.match(app, /"AI Inference": "\/ai-inference"/)
  assert.match(app, /<PlatformAiInference[^>]*onSessionExpired=\{handleAccountSessionExpired\}/)
})
