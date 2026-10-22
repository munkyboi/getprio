import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const component = readFileSync(resolve(root, "src/components/platform-help-center.tsx"), "utf8")
const dataTable = readFileSync(resolve(root, "src/components/platform-data-table.tsx"), "utf8")
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8")
const api = readFileSync(resolve(root, "src/lib/platform-api.ts"), "utf8")

test("Platform portal exposes audited Help Center authoring and publishing controls", () => {
  assert.match(app, /label: "Help Center"[\s\S]*platform\.help_center\.manage/)
  assert.match(app, /"Help Center \/ Overview": "\/help-center"/)
  assert.match(component, /Save draft/)
  assert.match(component, /Publish/)
  assert.match(component, /audit reason/i)
  assert.match(component, /Revision history/)
  assert.match(component, /Restore item/)
  assert.match(component, /Restore/)
  assert.match(component, /Customer preview/)
  assert.match(component, /verified source references/i)
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/)
  assert.match(api, /\/platform\/help-center\/drafts/)
  assert.match(api, /\/platform\/help-center\/publish/)
  assert.match(api, /\/platform\/help-center\/revisions/)
})

test("Help Center management keeps publishing gated on reviewed content and reports draft-only restore", () => {
  assert.match(component, /unreviewedCount > 0/)
  assert.match(component, /is now live on the public Help Center/)
  assert.match(component, /it is not live until published/)
})

test("Help Center editor lets admins remove an accidental guide from the working draft", () => {
  assert.match(component, /Remove from draft/)
  assert.match(component, /removeHelpCenterDraftItem/)
  assert.match(component, /Save draft/)
})

test("Help Center has dedicated overview, Topics, Guides, and FAQs navigation", () => {
  for (const section of ["Overview", "Topics", "Guides", "FAQs"]) {
    assert.match(app, new RegExp(`Help Center \\/ ${section}`))
    assert.match(component, new RegExp(`"${section.toLowerCase()}"`))
  }
  assert.match(app, /SidebarMenuSubButton/)
})

test("Help Center content lists support filtering, pagination, row editors, and confirmed archive", () => {
  assert.match(component, /PlatformDataTable/)
  assert.match(component, /onRowClick/)
  assert.match(dataTable, /getPaginationRowModel/)
  assert.match(dataTable, /setFilterValue/)
  assert.match(component, /<DialogTitle>Archive/)
  assert.match(component, /const confirmArchive/)
  assert.match(component, /Back to/)
})

test("Help Center overview summarizes review work and links to content lists", () => {
  assert.match(component, /Needs review/)
  assert.match(component, /Active topics/)
  assert.match(component, /Active guides/)
  assert.match(component, /Active FAQs/)
  assert.match(component, /Create new topic/)
  assert.match(component, /Create new guide/)
  assert.match(component, /Create new FAQ/)
})
