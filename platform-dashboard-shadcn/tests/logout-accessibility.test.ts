import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
const footerStart = source.indexOf('<SidebarFooter className="p-3">')
const footerEnd = source.indexOf("</SidebarFooter>", footerStart)
const footer = source.slice(footerStart, footerEnd)

test("the Account card is a popup menu containing profile and sign-out actions", () => {
  assert.ok(footerStart >= 0)
  assert.ok(footerEnd > footerStart)
  assert.match(footer, /<DropdownMenuTrigger render=\{<SidebarMenuButton size="lg" aria-label="Open account menu" \/>\}>/)
  assert.equal((footer.match(/<DropdownMenuGroup>/g) || []).length, 3)
  assert.match(footer, /<DropdownMenuItem onClick=\{\(\) => onRouteChange\("My account"\)\}>My account<\/DropdownMenuItem>/)
  assert.match(footer, /<DropdownMenuItem variant="destructive" onClick=\{\(\) => setSignOutOpen\(true\)\}><LogOut \/>Sign out<\/DropdownMenuItem>/)
  assert.doesNotMatch(footer, /<SidebarMenuButton[^>]*tooltip="Sign out"/)
})

test("sign-out requires explicit confirmation and can be canceled", () => {
  const sidebarStart = source.indexOf("function PlatformSidebar(")
  const sidebarEnd = source.indexOf("type MetricTone", sidebarStart)
  const sidebar = source.slice(sidebarStart, sidebarEnd)
  assert.match(sidebar, /<Dialog open=\{signOutOpen\} onOpenChange=\{setSignOutOpen\}>/)
  assert.match(sidebar, /<DialogTitle>Sign out of GetPrio Platform\?<\/DialogTitle>/)
  assert.match(sidebar, /<Button variant="outline" onClick=\{\(\) => setSignOutOpen\(false\)\}>Cancel<\/Button>/)
  assert.match(sidebar, /<Button variant="destructive" onClick=\{\(\) => \{ setSignOutOpen\(false\); onLogout\(\) \}\}>Sign out<\/Button>/)
})
