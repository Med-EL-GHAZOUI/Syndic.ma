// In-app notifications (demo). Messages are stored as translation keys so
// they follow the reader's language. Email / SMS / WhatsApp come in Phase 8.
import { db } from './store.js';
import { currentUser } from './auth.js';
import { myResidences } from './permissions.js';

export const STAFF = ['syndic_admin', 'manager', 'accountant'];

export function notify({ orgId, toUserId = null, toRoles = null, residenceId = null, key, params = {}, link = '' }) {
  const user = currentUser();
  db.insert(
    'notifications',
    {
      orgId: orgId || (user && user.orgId),
      toUserId,
      toRoles,
      residenceId,
      key,
      params,
      link,
      byUserId: user ? user.id : null,
      at: new Date().toISOString(),
      readBy: [],
    },
    { silent: true },
  );
}

export function myNotifications() {
  const user = currentUser();
  if (!user) return [];
  const residences = new Set(myResidences().map((r) => r.id));
  return db
    .all('notifications')
    .filter((n) => {
      if (n.orgId !== user.orgId || n.byUserId === user.id) return false;
      const addressed = n.toUserId ? n.toUserId === user.id : (n.toRoles || []).includes(user.role);
      if (!addressed) return false;
      return !n.residenceId || residences.has(n.residenceId) || user.role === 'provider';
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export const unreadCount = () => {
  const user = currentUser();
  return myNotifications().filter((n) => !n.readBy.includes(user.id)).length;
};

export function markAllRead() {
  const user = currentUser();
  for (const n of myNotifications()) {
    if (!n.readBy.includes(user.id)) {
      db.update('notifications', n.id, { readBy: [...n.readBy, user.id] }, { silent: true });
    }
  }
}
