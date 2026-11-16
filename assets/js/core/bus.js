// Minimal event bus used to request re-renders without circular imports.
// Events: 'refresh' (re-mount current page), 'shell' (rebuild layout + page).

const listeners = new Map();

export const bus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
  },
  emit(event, payload) {
    (listeners.get(event) || []).forEach((fn) => fn(payload));
  },
};
