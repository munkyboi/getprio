import { createHash } from "node:crypto";

export const SIMULATOR_VERSION = "synthetic-queue-v1";
export const SCENARIOS = Object.freeze({
  sequential: { capacity: [1, 1], arrivalGap: 8, duration: 10 },
  parallel: { capacity: [3, 3], arrivalGap: 4, duration: 15 },
  competing: { capacity: [3, 2], arrivalGap: 6, duration: 15, multiResource: true },
  disrupted: { capacity: [2, 2], arrivalGap: 5, duration: 15, multiResource: true, disruptions: true }
});

function randomGenerator(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function generateTickets(settings, count, random) {
  let arrival = 0;
  return Array.from({ length: count }, (_, index) => {
    arrival += 1 + Math.floor(random() * settings.arrivalGap * 2);
    const booking = settings.disruptions && index % 7 === 0;
    const cancellation = settings.disruptions && index % 11 === 0;
    const interruption = settings.disruptions && index % 9 === 0 ? 10 : 0;
    return { id: index + 1, arrival, ready: arrival + (booking ? 20 : 0),
      cancelAt: cancellation ? arrival + 8 : Infinity,
      cancellationReason: index % 22 === 0 ? "no_show" : "cancelled",
      duration: Math.max(1, Math.round(settings.duration * (0.6 + random() * 0.8))),
      interruption, booking, needs: settings.multiResource ? [index % 5 === 0 ? 2 : 1, 1] : [1, 0],
      channel: ["printed", "mobile", "vendor"][index % 3], state: "not_arrived" };
  });
}

function record(events, ticket, type, minute, extra = {}) {
  events.push({ ticket: ticket.id, type, minute, ...extra });
}

function releaseAndCancel(tickets, active, events, now) {
  for (const ticket of active) {
    if (ticket.finish !== now) continue;
    ticket.state = "completed";
    record(events, ticket, "service_completed", now);
  }
  for (const ticket of tickets) {
    if (ticket.state !== "waiting" || ticket.cancelAt !== now) continue;
    ticket.state = "censored";
    record(events, ticket, ticket.cancellationReason, now);
  }
}

function arrive(tickets, events, now, settings, paused) {
  for (const ticket of tickets) {
    if (ticket.arrival !== now) continue;
    const waiting = tickets.filter((other) => other.state === "waiting").length;
    ticket.features = { position: waiting + 1, averageServiceMinutes: settings.duration,
      priorityBand: ticket.booking ? "checked_in_booking" : "normal", queuePaused: paused };
    ticket.state = "waiting";
    record(events, ticket, "issued", now, { channel: ticket.channel, requirements: ticket.needs,
      earliestCallMinute: ticket.ready, configuredDurationMinutes: settings.duration });
  }
}

function dispatch(tickets, events, now, capacity) {
  const active = tickets.filter((ticket) => ticket.state === "active");
  const used = capacity.map((_, pool) => active.reduce((sum, ticket) => sum + ticket.needs[pool], 0));
  for (const ticket of tickets.filter((entry) => entry.state === "waiting" && entry.ready <= now)) {
    // FIFO among eligible tickets; a resource-blocked head prevents bypass.
    if (ticket.needs.some((units, pool) => used[pool] + units > capacity[pool])) break;
    ticket.state = "active";
    ticket.called = now;
    ticket.finish = now + ticket.duration + ticket.interruption;
    ticket.needs.forEach((units, pool) => { used[pool] += units; });
    record(events, ticket, "called", now);
    record(events, ticket, "service_started", now);
    if (ticket.interruption) {
      const interruptedAt = now + Math.floor(ticket.duration / 2);
      record(events, ticket, "service_interrupted", interruptedAt);
      record(events, ticket, "service_resumed", interruptedAt + ticket.interruption);
    }
  }
}

function nextTime(tickets, pauses, now) {
  const future = pauses.flat().filter((minute) => minute > now);
  for (const ticket of tickets) {
    if (ticket.state === "not_arrived") future.push(ticket.arrival);
    if (ticket.state === "active") future.push(ticket.finish);
    if (ticket.state === "waiting") {
      if (ticket.ready > now) future.push(ticket.ready);
      if (Number.isFinite(ticket.cancelAt) && ticket.cancelAt > now) future.push(ticket.cancelAt);
    }
  }
  if (!future.length) return null;
  return future.reduce((minimum, minute) => Math.min(minimum, minute), Infinity);
}

function simulateScenario(name, count, seed) {
  const settings = SCENARIOS[name];
  const tickets = generateTickets(settings, count, randomGenerator(seed));
  const pauses = settings.disruptions ? [[60, 90], [180, 200]] : [];
  const events = [];
  let now = 0;
  let steps = 0;
  while (now !== null) {
    if (++steps > count * 6 + 20) throw new Error("Simulation event limit exceeded.");
    releaseAndCancel(tickets, tickets.filter((ticket) => ticket.state === "active"), events, now);
    const paused = pauses.some(([from, to]) => now >= from && now < to);
    arrive(tickets, events, now, settings, paused);
    if (!paused) dispatch(tickets, events, now, settings.capacity);
    now = nextTime(tickets, pauses, now);
  }
  if (tickets.some((ticket) => !["completed", "censored"].includes(ticket.state))) throw new Error("Simulation did not drain.");
  events.sort((left, right) => left.minute - right.minute);
  return { tickets, events, settings, pauses };
}

export function generateSyntheticDataset({ seed, ticketsPerScenario, start }) {
  const origin = Date.parse(start);
  const iso = (minute) => new Date(origin + minute * 60000).toISOString();
  const samples = [];
  const scenarios = [];
  let lastMinute = 0;
  for (const [index, name] of Object.keys(SCENARIOS).entries()) {
    const result = simulateScenario(name, ticketsPerScenario, (seed + index) >>> 0);
    const scopeKey = `synthetic:${name}`;
    for (const ticket of result.tickets.filter((entry) => entry.state === "completed")) {
      samples.push({ scopeKey, ticketKey: createHash("sha256").update(`${SIMULATOR_VERSION}:${seed}:${scopeKey}:${ticket.id}`).digest("hex"),
        sampledAt: iso(ticket.arrival), calledAt: iso(ticket.called), actualWaitMinutes: ticket.called - ticket.arrival,
        features: ticket.features });
    }
    lastMinute = Math.max(lastMinute, ...result.tickets.map((ticket) => ticket.finish || ticket.cancelAt));
    scenarios.push({ name, scopeKey, settings: result.settings, pauses: result.pauses,
      issuedTickets: result.tickets.length, calledTickets: result.tickets.filter((ticket) => ticket.state === "completed").length,
      censoredTickets: result.tickets.filter((ticket) => ticket.state === "censored").length, events: result.events });
  }
  const to = iso(lastMinute + 1);
  return { datasetVersion: "wait-time-synthetic-dataset-v1", source: "synthetic", baselineVersion: "baseline-v1",
    provenance: "synthetic-simulation", from: iso(0), to, capturedAt: to, excludedFeatureRows: 0, samples,
    simulation: { simulatorVersion: SIMULATOR_VERSION, seed, ticketsPerScenario, start: iso(0), scenarios,
      clock: "Virtual time; capturedAt is the simulated window end, not an operational capture timestamp.",
      policy: "Atomic resource allocation; FIFO among eligible tickets. Calls coincide with service starts. Pauses block dispatch only. Interruptions retain resources.",
      productionPerformanceEstablished: false }, customerEstimateChanged: false, rolloutApproved: false };
}
