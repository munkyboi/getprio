const EventEmitter = require("events");

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

function eventName(tenantSlug) {
  return `queue:${tenantSlug}`;
}

function subscribe(tenantSlug, handler) {
  const name = eventName(tenantSlug);
  emitter.on(name, handler);

  return () => {
    emitter.off(name, handler);
  };
}

function publish(tenantSlug, payload) {
  emitter.emit(eventName(tenantSlug), payload);
}

module.exports = {
  subscribe,
  publish
};
