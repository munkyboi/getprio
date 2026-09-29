import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/components/ui/dialog.tsx", import.meta.url), "utf8")

test("shared dialogs keep content scrollable without sticky header/footer overlap", () => {
  const contentClass = source.match(/data-slot="dialog-content"[\s\S]*?className={cn\(([\s\S]*?)\n\s*className\s*\)/)?.[1]
  const headerClass = source.match(/data-slot="dialog-header"[\s\S]*?className={cn\("([^"]+)"/)?.[1]
  const footerClass = source.match(/data-slot="dialog-footer"[\s\S]*?className={cn\(([\s\S]*?)\n\s*className\s*\)/)?.[1]

  assert.ok(contentClass, "dialog content should define the shared popup layout")
  assert.ok(headerClass, "dialog header should define the shared header layout")
  assert.ok(footerClass, "dialog footer should define the shared footer layout")

  assert.match(contentClass, /\bflex\b[\s\S]*\bflex-col\b/)
  assert.match(contentClass, /max-h-\[min\(/)
  assert.match(contentClass, /overflow-y-auto/)
  assert.doesNotMatch(headerClass, /sticky/)
  assert.doesNotMatch(footerClass, /sticky/)
  assert.match(footerClass, /border-t/)
  assert.match(footerClass, /px-4 py-4/)
})
