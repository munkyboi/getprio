import assert from "node:assert/strict"
import test from "node:test"
import { creditPackContents, creditPackRevisionPayload } from "../../shared/creditPackRevision.ts"

test("legacy credit edits retain the server's positive journey units", () => {
  const pack = { code: "P100", name: "Renamed", state: "enabled", ticketUnits: 100, journeyUnits: 100, priceCents: 9900 }
  const payload = creditPackRevisionPayload(pack)
  assert.equal(payload.journeyUnits, 100)
  assert.deepEqual(payload, pack)
  assert.match(creditPackContents(pack), /100 legacy Queue Email Journeys/)
})

test("migrated ticket-only revisions retain zero without reintroducing email quota", () => {
  const pack = { code: "P100", name: "Tickets", state: "enabled", ticketUnits: 100, journeyUnits: 0, priceCents: 9900 }
  assert.equal(creditPackRevisionPayload(pack).journeyUnits, 0)
  assert.equal(creditPackContents(pack), "100 Queue Tickets")
  const { journeyUnits: _legacy, ...omitted } = pack
  assert.equal(creditPackRevisionPayload(omitted).journeyUnits, 0)
})
