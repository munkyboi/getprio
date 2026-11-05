import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ticketRepository = require("../backend/src/repositories/tickets");
const { describeTicketServiceTime } = require("../backend/src/services/queueEstimationInputs");
const contextFlags = new Map([
  ["--ticket-number", "ticketNumber"],
  ["--location-slug", "locationSlug"],
  ["--date", "date"]
]);

export function parseTicketContextOptions(args) {
  const reportArgs = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = contextFlags.get(args[index]);
    if (!key) {
      reportArgs.push(args[index]);
      continue;
    }
    if (options[key] !== undefined) throw new Error(`Duplicate option ${args[index]}.`);
    const value = args[++index];
    if (!value || value.startsWith("--") || value.length > 200) throw new Error(`Missing or invalid value for ${key}.`);
    options[key] = value.trim();
  }
  if (!Object.keys(options).length) return { reportArgs, ticketContext: null };
  validateTicketContext(options);
  return { reportArgs, ticketContext: options };
}

function validateTicketContext(options) {
  if (!options.ticketNumber || !options.locationSlug || !options.date) {
    throw new Error("Ticket context requires --ticket-number, --location-slug and --date YYYY-MM-DD together.");
  }
  const parsedDate = new Date(`${options.date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(options.date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== options.date) {
    throw new Error("Ticket context date must be a valid YYYY-MM-DD business date.");
  }
}

export async function readTicketContext(client, vendorId, options) {
  const location = await client.query(`
    SELECT store_locations.id, tenants.average_service_minutes
    FROM store_locations INNER JOIN tenants ON tenants.id = store_locations.tenant_id
    WHERE store_locations.tenant_id = $1 AND store_locations.slug = $2
  `, [Number(vendorId), options.locationSlug]);
  if (!location.rows[0]) throw new Error("Location was not found for the selected vendor.");
  const result = await client.query(`
    SELECT lookup_code FROM tickets
    WHERE tenant_id = $1 AND location_id = $2 AND date_key = $3 AND ticket_number = $4
    LIMIT 2
  `, [Number(vendorId), location.rows[0].id, options.date.replaceAll("-", ""), options.ticketNumber.toUpperCase()]);
  if (result.rows.length !== 1) throw new Error("Ticket context requires exactly one matching ticket in the selected vendor, location and date.");
  const ticket = await ticketRepository.findTicketByTenantAndLookupCode(vendorId, result.rows[0].lookup_code, { client });
  return {
    ticketNumber: ticket.ticketNumber,
    businessDate: options.date,
    locationSlug: options.locationSlug,
    status: ticket.status,
    priorityBand: ticket.servicePriorityBand,
    bookingReference: ticket.linkedBookingReference,
    serviceTime: describeTicketServiceTime(ticket, location.rows[0].average_service_minutes),
    note: "Read-only stored booking linkage and schedule context. Schedule duration is not proof of resource occupancy; baseline estimates remain unchanged."
  };
}
