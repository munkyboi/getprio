import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")

test("Users data-deletion UI exposes the asynchronous scan and its report coverage", () => {
  assert.ok(source.includes("Begin account cleanup"))
  assert.ok(source.includes('scan.status === "report_ready" ? "Redo read-only scan"'))
  assert.ok(source.includes('scan.status === "queued"'))
  assert.ok(source.includes('scan.status === "running"'))
  assert.ok(source.includes('className="size-4 shrink-0 animate-spin"'))
  assert.equal((source.match(/<LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" \/>/g) || []).length, 4)
  assert.ok(source.includes('function deletionTaskOperation(request: PlatformAccountDeletionRequest)'))
  assert.ok(source.includes('return "Sending report to user"'))
  assert.ok(source.includes('return "Cleanup queued"'))
  assert.ok(source.includes('return "Deleting related data"'))
  assert.ok(source.includes('return "Read-only scan queued"'))
  assert.ok(source.includes('return "Scanning account data"'))
  assert.match(source, /<TableCell className="whitespace-nowrap text-muted-foreground"><DeletionTaskProgress request=\{request\} \/><\/TableCell>/)
  assert.ok(source.includes('<span role="status" className="inline-flex items-center gap-2 text-foreground"><LoaderCircle'))
  assert.ok(source.includes("scanReport.categories.map"))
  assert.ok(source.includes('category.status.replaceAll("_", " ")'))
  assert.ok(source.includes("Delete related data"))
  assert.ok(source.includes("Send report to user"))
})

test("every data-deletion request row opens the sheet and supports keyboard activation", () => {
  assert.match(source, /const openDeletionRequest = \(request: PlatformAccountDeletionRequest\)/)
  assert.match(source, /aria-label=\{`Open deletion request for \$\{request\.accountName\}`\} tabIndex=\{0\}/)
  assert.match(source, /onClick=\{\(event\) => \{ if \(!\(event\.target instanceof HTMLElement\) \|\| !event\.target\.closest\("button,a,input,select,textarea"\)\) openDeletionRequest\(request\) \}\}/)
  assert.match(source, /event\.key === "Enter" \|\| event\.key === " "\).*openDeletionRequest\(request\)/)
  assert.match(source, /<Sheet open=\{Boolean\(selectedDeletionRequest\)\}/)
  assert.doesNotMatch(source, /<TableCell><Button type="button" variant="ghost" className="h-auto justify-start px-0 py-0 text-left hover:bg-transparent" aria-label=\{`Open deletion request/)
})

test("the cleanup scan UI does not present checklist evidence attestation as the cleanup action", () => {
  assert.ok(!source.includes("Review prerequisite"))
  assert.ok(!source.includes("Record deletion prerequisite"))
  assert.ok(source.includes("read-only background inventory"))
  assert.ok(source.includes("const isCategorySelected = (categoryId: string) => cleanupSelection[categoryId] ?? true"))
  assert.ok(source.includes("The request is not marked completed until the user report is accepted"))
})

test("relational references are reviewed as default-selected individual items", () => {
  assert.ok(source.includes("const isReferenceSelected = (referenceId: string) => cleanupReferenceSelection[referenceId] ?? true"))
  assert.ok(source.includes("formatReferenceRowIdentity(item.rowIdentity)"))
  assert.ok(source.includes("Each checkbox identifies the exact database row by its primary-key column(s)"))
  assert.ok(source.includes("Redo the read-only scan to load the actual row keys"))
  assert.ok(source.includes("const allReferenceRowsIdentified ="))
  assert.ok(source.includes("blockedReferenceSources"))
  assert.ok(source.includes('"Blocks cleanup"'))
  assert.ok(source.includes('"Policy-covered"'))
  assert.ok(!source.includes("Reference item #{item.ordinal}"))
  assert.ok(source.includes("Unchecking one pauses the entire cleanup"))
  assert.ok(source.includes("source.items.every((item) => isReferenceSelected(item.id))"))
})
