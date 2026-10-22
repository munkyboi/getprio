const EventEmitter = require("events");

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

function eventName(tenantSlug) {
  return `queue:${tenantSlug}`;
}

function subscribe(tenantSlug, handler, options = {}) {
  const name = eventName(tenantSlug);
  const locationId = options.locationId ? String(options.locationId) : null;
  const listener = (payload, eventOptions = {}) => {
    const eventLocationId = eventOptions.locationId ? String(eventOptions.locationId) : null;
    if (locationId && eventLocationId && locationId !== eventLocationId) {
      return;
    }
    handler(payload);
  };
  emitter.on(name, listener);

  return () => {
    emitter.off(name, listener);
  };
}

function publish(tenantSlug, payload, options = {}) {
  emitter.emit(eventName(tenantSlug), payload, options);
}

module.exports = {
  subscribe,
  publish
};
