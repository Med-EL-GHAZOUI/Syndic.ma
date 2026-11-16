// SIMULATED authentication for the Phase 1 prototype.
//
// Passwords are compared in clear text against demo seed data and the
// "session" is just a user id in localStorage. This is NOT secure and exists
// only so every role can be explored. Phase 4 replaces it with JWT access
// tokens, refresh-token rotation and server-side password hashing.
import { db } from './store.js';

const KEY = 'syndicma.session';

function readSession() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return memorySession;
  }
}

let memorySession = null;

export function currentUser() {
  const id = readSession() || memorySession;
  if (!id) return null;
  const user = db.get('users', id);
  return user && user.active ? user : null;
}

db.setActor(currentUser);

export function login(email, password) {
  const wanted = String(email || '').trim().toLowerCase();
  const user = db.all('users').find((u) => u.email.toLowerCase() === wanted);
  if (!user || user.password !== password) return { ok: false, error: 'auth.invalid' };
  if (!user.active) return { ok: false, error: 'auth.inactive' };
  if (user.orgId) {
    const org = db.get('organizations', user.orgId);
    if (org && org.status === 'suspended') return { ok: false, error: 'auth.suspended' };
  }
  memorySession = user.id;
  try {
    localStorage.setItem(KEY, user.id);
  } catch {
    /* memory session only */
  }
  db.update('users', user.id, { lastLoginAt: new Date().toISOString() }, { silent: true });
  db.audit('login', 'users', user.id, user.email);
  return { ok: true, user };
}

export function logout() {
  const user = currentUser();
  if (user) db.audit('logout', 'users', user.id, user.email);
  memorySession = null;
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem('syndicma.residence');
  } catch {
    /* ignore */
  }
}
