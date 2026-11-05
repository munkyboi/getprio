import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sheetSource = readFileSync(new URL("../src/components/ui/sheet.tsx", import.meta.url), "utf8")
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")

test("right-side sheets share the desktop width cap and stay full-width on mobile", () => {
  assert.ok(sheetSource.includes("data-[side=right]:w-full"))
  assert.ok(sheetSource.includes("data-[side=right]:max-w-full"))
  assert.ok(sheetSource.includes("md:data-[side=right]:max-w-[min(50vw,900px)]"))
})

test("right-side sheet instances do not set competing widths", () => {
  const rightSideSheets = appSource.match(/<SheetContent side="right"[^>]*>/g) || []
  assert.ok(rightSideSheets.length > 0)
  for (const sheet of rightSideSheets) {
    assert.doesNotMatch(sheet, /\b(?:w|sm:max-w)-\[/)
  }
})
