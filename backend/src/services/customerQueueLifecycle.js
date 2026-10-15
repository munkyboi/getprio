const TERMINAL = new Set(['served', 'cancelled', 'unserved', 'expired']);

// Customer projection only. Reservation internals and transient failed Call
// attempts do not establish a durable customer resource-wait reason.
function customerQueueLifecycle(ticket) {
  if (ticket.developerProjectId || ticket.isDeveloperApiTicket) return null;
  let state;
  if (ticket.serviceStartedAt && !ticket.serviceEndedAt) state = 'in_service';
  else if (TERMINAL.has(ticket.status)) state = 'terminal';
  else if (ticket.status === 'skipped') state = 'recovery';
  else if (ticket.status === 'pending_carry_over') state = 'pending_carry_over';
  else if (['waiting', 'called'].includes(ticket.status)) state = ticket.status;
  else return null;
  return { version: 1, state, resourceWait: null };
}

module.exports = { customerQueueLifecycle };
