type Pack = { code: string; name: string; state: string; ticketUnits: number; journeyUnits?: number; priceCents: number }

export function creditPackRevisionPayload(pack: Pack) {
  return { code: pack.code, name: pack.name, state: pack.state, ticketUnits: pack.ticketUnits, journeyUnits: pack.journeyUnits ?? 0, priceCents: pack.priceCents }
}

export function creditPackContents(pack: Pick<Pack, "ticketUnits" | "journeyUnits">): string {
  const tickets = `${pack.ticketUnits.toLocaleString()} Queue Tickets`
  return pack.journeyUnits ? `${tickets} + ${pack.journeyUnits.toLocaleString()} legacy Queue Email Journeys (retirement pending)` : tickets
}
