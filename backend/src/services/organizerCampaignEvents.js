const EventEmitter = require("events");

const emitter = new EventEmitter();
emitter.setMaxListeners(200);

function eventName(campaignId) {
  return `organizer-campaign:${String(campaignId)}`;
}

function subscribe(campaignId, handler) {
  const name = eventName(campaignId);
  emitter.on(name, handler);
  return () => emitter.off(name, handler);
}

function publish(campaignId, payload = {}) {
  if (campaignId == null) return;
  emitter.emit(eventName(campaignId), payload);
}

module.exports = {
  publish,
  subscribe
};
