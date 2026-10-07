export const RESOURCE_REFERENCE_VERSION = "synthetic-resource-reference-v1";

function servicePlan(ticket, duration) {
  return { id: ticket.id, ready: ticket.ready, needs: [...ticket.needs], duration };
}

function observedProgress(ticket, events, now) {
  let interruptedAt = null;
  let pausedMinutes = 0;
  for (const event of events.filter((entry) => entry.ticket === ticket.id && entry.minute <= now)) {
    if (event.type === "service_interrupted") interruptedAt = event.minute;
    if (event.type === "service_resumed" && interruptedAt !== null) {
      pausedMinutes += event.minute - interruptedAt;
      interruptedAt = null;
    }
  }
  return { interrupted: interruptedAt !== null, workingMinutes: now - ticket.called - pausedMinutes };
}

// Projection inputs contain only issued plans and progress events at/before now.
// Never copy actual duration, actual finish, future arrivals or cancellation deadlines.
export function resourceSnapshot(tickets, events, now, settings, paused, targetId) {
  const active = tickets.filter((ticket) => ticket.state === "active").map((ticket) => {
    const progress = observedProgress(ticket, events, now);
    return { ...servicePlan(ticket, settings.duration), ...progress };
  });
  return { now, capacity: [...settings.capacity], paused, targetId, active,
    waiting: tickets.filter((ticket) => ticket.state === "waiting").map((ticket) => servicePlan(ticket, settings.duration)) };
}

function allocate(waiting, active, capacity, now, targetId) {
  const used = capacity.map((_, pool) => active.reduce((sum, entry) => sum + entry.needs[pool], 0));
  for (const ticket of waiting.filter((entry) => entry.ready <= now && !entry.started)) {
    if (ticket.needs.some((units, pool) => used[pool] + units > capacity[pool])) break;
    if (ticket.id === targetId) return true;
    ticket.started = true;
    active.push({ needs: ticket.needs, finish: now + ticket.duration });
    ticket.needs.forEach((units, pool) => { used[pool] += units; });
  }
  return false;
}

export function predictResourceReference(snapshot) {
  const fallback = (reason) => ({ predictorVersion: RESOURCE_REFERENCE_VERSION, usedFallback: true,
    fallbackReason: reason, estimatedWaitMinutes: null });
  if (snapshot.paused) return fallback("dispatch_paused");
  if (snapshot.active.some((entry) => entry.interrupted)) return fallback("active_interruption");
  const waiting = snapshot.waiting.map((entry) => ({ ...entry }));
  let active = snapshot.active.map((entry) => ({ needs: entry.needs,
    finish: snapshot.now + Math.max(1, entry.duration - entry.workingMinutes) }));
  let now = snapshot.now;
  const maximumSteps = waiting.length * 2 + active.length + 1;
  for (let step = 0; step <= maximumSteps; step++) {
    active = active.filter((entry) => entry.finish > now);
    if (allocate(waiting, active, snapshot.capacity, now, snapshot.targetId)) {
      return { predictorVersion: RESOURCE_REFERENCE_VERSION, usedFallback: false, fallbackReason: null,
        estimatedWaitMinutes: now - snapshot.now };
    }
    const future = [...active.map((entry) => entry.finish),
      ...waiting.filter((entry) => !entry.started && entry.ready > now).map((entry) => entry.ready)];
    now = future.reduce((minimum, time) => Math.min(minimum, time), Infinity);
    if (!Number.isFinite(now)) return fallback("unresolved_capacity");
  }
  return fallback("projection_limit");
}
