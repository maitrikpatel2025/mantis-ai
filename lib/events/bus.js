import { EventEmitter } from "events";
const KEY = "__mantis_event_bus";
if (!globalThis[KEY]) {
  globalThis[KEY] = new EventEmitter();
  globalThis[KEY].setMaxListeners(100);
}
function getEventBus() {
  return globalThis[KEY];
}
function emitEvent(type, data) {
  globalThis[KEY].emit("event", { type, data, timestamp: Date.now() });
}
export {
  emitEvent,
  getEventBus
};
