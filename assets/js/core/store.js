// Demo persistence layer backed by localStorage.
//
// This is a stand-in for the future NestJS + PostgreSQL API: pages only call
// db.all / get / insert / update / remove, so the repository can be swapped
// for HTTP calls later without touching page code.
// NOTHING here is secure: data lives in the visitor's browser, in clear text.
import { buildSeed, SEED_VERSION } from '../data/seed.js';
import { uid } from './dom.js';

const KEY = 'syndicma.db';
const NO_AUDIT = new Set(['audit', 'notifications']);

let state = null;
let memoryOnly = false;
let actor = () => null;

function persist() {
  if (memoryOnly) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    memoryOnly = true;
    console.warn('[store] localStorage unavailable, falling back to memory', err);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.__v === SEED_VERSION) state = parsed;
    }
  } catch (err) {
    memoryOnly = true;
    console.warn('[store] cannot read localStorage', err);
  }
  if (!state) {
    state = buildSeed();
    persist();
  }
}

function describe(row) {
  if (!row) return '';
  if (row.firstName || row.lastName) return `${row.firstName || ''} ${row.lastName || ''}`.trim();
  return row.name || row.title || row.label || row.receiptNo || row.number || row.id;
}

function audit(action, entity, entityId, summary) {
  const user = actor();
  state.audit.push({
    id: uid('aud'),
    at: new Date().toISOString(),
    userId: user ? user.id : null,
    userName: user ? user.name : '—',
    role: user ? user.role : null,
    orgId: user ? user.orgId : null,
    action,
    entity,
    entityId,
    summary: summary || '',
  });
}

load();

export const db = {
  all: (collection) => state[collection] || [],

  get: (collection, id) => (state[collection] || []).find((x) => x.id === id) || null,

  insert(collection, obj, opts = {}) {
    const row = { id: uid(collection.slice(0, 3)), createdAt: new Date().toISOString(), ...obj };
    state[collection].push(row);
    if (!opts.silent && !NO_AUDIT.has(collection)) {
      audit(opts.action || 'create', collection, row.id, opts.summary || describe(row));
    }
    persist();
    return row;
  },

  update(collection, id, patch, opts = {}) {
    const row = this.get(collection, id);
    if (!row) return null;
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    if (!opts.silent && !NO_AUDIT.has(collection)) {
      audit(opts.action || 'update', collection, id, opts.summary || describe(row));
    }
    persist();
    return row;
  },

  remove(collection, id, opts = {}) {
    const list = state[collection];
    const index = list.findIndex((x) => x.id === id);
    if (index < 0) return false;
    const [row] = list.splice(index, 1);
    if (!opts.silent && !NO_AUDIT.has(collection)) {
      audit('delete', collection, id, opts.summary || describe(row));
    }
    persist();
    return true;
  },

  /** Sequential document numbers, e.g. REC-2026-0042. Never reused. */
  nextNumber(counter, prefix) {
    state.counters[counter] = (state.counters[counter] || 0) + 1;
    const year = new Date().getFullYear();
    return `${prefix}-${year}-${String(state.counters[counter]).padStart(4, '0')}`;
  },

  audit(action, entity, entityId, summary) {
    audit(action, entity, entityId, summary);
    persist();
  },

  reset() {
    state = buildSeed();
    persist();
  },

  exportJson: () => JSON.stringify(state, null, 2),
  isMemoryOnly: () => memoryOnly,
  setActor(fn) {
    actor = fn;
  },
};
