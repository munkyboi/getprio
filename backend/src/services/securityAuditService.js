const repository = require("../repositories/securityAudit");

function sanitizeText(value, max = 500) {
  return [...String(value || "")]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function record(event, options = {}) {
  return repository.appendEvent({
    ...event,
    action: sanitizeText(event.action, 120),
    resourceType: sanitizeText(event.resourceType, 120),
    resourceId: sanitizeText(event.resourceId, 200),
    reason: sanitizeText(event.reason, 500),
    metadata: event.metadata || {}
  }, options);
}

module.exports = { record, sanitizeText };
