// Role-based permissions and tenant / residence scoping.
//
// Client-side checks only shape the demo UI. Real enforcement must live in
// the backend (guards + tenant-scoped queries) — see docs/PRODUCT.md.
import { db } from './store.js';
import { currentUser } from './auth.js';

// v = view, c = create, e = edit, d = delete,
// x = validate / reverse payments, a = approve expenses
const MATRIX = {
  super_admin: { dashboard: 'v', platform: 'vced', users: 'v', audit: 'v', settings: 'v' },
  syndic_admin: {
    dashboard: 'v', residences: 'vced', units: 'vced', residents: 'vced', finance: 'vced',
    payments: 'vcex', expenses: 'vceda', complaints: 'vced', maintenance: 'vced',
    announcements: 'vced', documents: 'vced', assemblies: 'vced', providers: 'vced',
    reports: 'v', users: 'vced', audit: 'v', settings: 've',
  },
  manager: {
    dashboard: 'v', residences: 've', units: 'vced', residents: 'vced', finance: 'v',
    payments: 'vc', expenses: 'vce', complaints: 'vced', maintenance: 'vced',
    announcements: 'vced', documents: 'vced', assemblies: 'vced', providers: 'vced',
    reports: 'v', settings: 'v',
  },
  accountant: {
    dashboard: 'v', residences: 'v', units: 'v', residents: 'v', finance: 'vced',
    payments: 'vcex', expenses: 'vceda', documents: 'vc', providers: 'v', reports: 'v', settings: 'v',
  },
  owner: {
    dashboard: 'v', finance: 'v', payments: 'vc', complaints: 'vc', announcements: 'v',
    documents: 'v', assemblies: 'v', settings: 'v',
  },
  tenant: { dashboard: 'v', complaints: 'vc', announcements: 'v', documents: 'v', settings: 'v' },
  provider: { dashboard: 'v', maintenance: 've', settings: 'v' },
};

export const ROLES = Object.keys(MATRIX);
export const ORG_ROLES = ROLES.filter((r) => r !== 'super_admin');
export const MODULES = [
  'dashboard', 'residences', 'units', 'residents', 'finance', 'payments', 'expenses', 'complaints',
  'maintenance', 'announcements', 'documents', 'assemblies', 'providers', 'reports', 'users', 'audit',
  'platform', 'settings',
];

export const permissionsOf = (role) => MATRIX[role] || {};

export function can(module, action = 'v') {
  const user = currentUser();
  if (!user) return false;
  return (MATRIX[user.role]?.[module] || '').includes(action);
}

export const isResident = (u = currentUser()) => !!u && (u.role === 'owner' || u.role === 'tenant');
export const isStaff = (u = currentUser()) =>
  !!u && ['syndic_admin', 'manager', 'accountant'].includes(u.role);

/** Residences the current user is allowed to see (tenant + assignment scope). */
export function myResidences() {
  const user = currentUser();
  if (!user || !user.orgId) return [];
  let list = db.all('residences').filter((r) => r.orgId === user.orgId);
  if (user.role === 'manager') list = list.filter((r) => (user.residenceIds || []).includes(r.id));
  if (isResident(user)) {
    const ids = new Set(myResidentRecords().map((r) => r.residenceId));
    list = list.filter((r) => ids.has(r.id));
  }
  return list;
}

const FILTER_KEY = 'syndicma.residence';

export function getResidenceFilter() {
  try {
    return sessionStorage.getItem(FILTER_KEY) || '';
  } catch {
    return '';
  }
}

export function setResidenceFilter(id) {
  try {
    if (id) sessionStorage.setItem(FILTER_KEY, id);
    else sessionStorage.removeItem(FILTER_KEY);
  } catch {
    /* ignore */
  }
}

/** Residence ids currently in scope, honouring the topbar residence filter. */
export function activeResidenceIds() {
  const ids = myResidences().map((r) => r.id);
  const filter = getResidenceFilter();
  return filter && ids.includes(filter) ? [filter] : ids;
}

/** Rows of a residence-owned collection that are in scope. */
export function inScope(collection) {
  const ids = new Set(activeResidenceIds());
  return db.all(collection).filter((row) => ids.has(row.residenceId));
}

/** Rows of an organization-owned collection (providers, users...). */
export function inOrg(collection) {
  const user = currentUser();
  if (!user) return [];
  if (user.role === 'super_admin') return db.all(collection);
  return db.all(collection).filter((row) => row.orgId === user.orgId);
}

/** Resident records (owner/tenant links) attached to the logged-in resident. */
export function myResidentRecords() {
  const user = currentUser();
  if (!user) return [];
  return db.all('residents').filter((r) => r.userId === user.id && r.active);
}

export const myUnitIds = () => myResidentRecords().map((r) => r.unitId);

export const residenceOptions = () => myResidences().map((r) => ({ value: r.id, label: r.name }));
