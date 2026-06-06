const CANONICAL_STATUSES = Object.freeze([
  "waiting",
  "called",
  "served",
  "skipped",
  "cancelled",
  "unserved"
]);

const VALID_TRANSITIONS = Object.freeze({
  waiting: new Set(["called", "cancelled", "skipped", "unserved"]),
  called: new Set(["served", "skipped", "cancelled", "unserved"]),
  skipped: new Set(["waiting"]),
  unserved: new Set(["waiting"]),
  served: new Set(),
  cancelled: new Set()
});

const TIMESTAMP_COLUMN_BY_STATUS = Object.freeze({
  called: "calledAt",
  served: "servedAt",
  skipped: "skippedAt",
  cancelled: "cancelledAt",
  unserved: "unservedAt"
});

function isCanonicalStatus(status) {
  return CANONICAL_STATUSES.includes(String(status || ""));
}

function isTerminalStatus(status) {
  return status === "served" || status === "cancelled";
}

function isValidTransition(fromStatus, toStatus) {
  if (!isCanonicalStatus(fromStatus) || !isCanonicalStatus(toStatus)) {
    return false;
  }

  return VALID_TRANSITIONS[fromStatus]?.has(toStatus) || false;
}

function assertValidTransition(fromStatus, toStatus) {
  if (isValidTransition(fromStatus, toStatus)) {
    return;
  }

  const error = new Error(`Invalid ticket transition: ${fromStatus} -> ${toStatus}.`);
  error.statusCode = 400;
  throw error;
}

function buildLifecycleTimestampPatch(toStatus, now = new Date()) {
  const patch = {};
  const timestampColumn = TIMESTAMP_COLUMN_BY_STATUS[toStatus];
  if (timestampColumn) {
    patch[timestampColumn] = now;
  }

  return patch;
}

function assertSupportedCurrentTicketResolution(status) {
  if (["served", "skipped", "cancelled", "unserved"].includes(String(status || ""))) {
    return;
  }

  const error = new Error("Unsupported ticket status update.");
  error.statusCode = 400;
  throw error;
}

module.exports = {
  CANONICAL_STATUSES,
  TIMESTAMP_COLUMN_BY_STATUS,
  assertSupportedCurrentTicketResolution,
  assertValidTransition,
  buildLifecycleTimestampPatch,
  isCanonicalStatus,
  isTerminalStatus,
  isValidTransition
};
