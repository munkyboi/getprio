import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
test('input adornments are passive groups; actions remain native buttons', () => {
  const source = readFileSync(new URL('../src/components/ui/input-group.tsx', import.meta.url), 'utf8')
  const addon = source.slice(source.indexOf('function InputGroupAddon'), source.indexOf('const inputGroupButtonVariants'))
  assert.doesNotMatch(addon, /onClick|tabIndex|role="button"/)
  assert.match(source, /function InputGroupButton[\s\S]*?<Button/)
});
test('sidebar skeleton sizing is deterministic', () => {
  const source = readFileSync(new URL('../src/components/ui/sidebar.tsx', import.meta.url), 'utf8')
  const skeleton = source.slice(source.indexOf('function SidebarMenuSkeleton'), source.indexOf('function SidebarMenuSub'))
  assert.doesNotMatch(skeleton, /Math\.random/)
  assert.match(skeleton, /const width = "70%"/)
});
