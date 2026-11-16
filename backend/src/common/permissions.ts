// RBAC matrix — mirrors the Phase 1 prototype (assets/js/core/permissions.js).
// v view, c create, e edit, d delete, x validate/reverse payments, a approve expenses.
export type Role = 'super_admin' | 'syndic_admin' | 'manager' | 'accountant' | 'owner' | 'tenant' | 'provider';
export type Action = 'v' | 'c' | 'e' | 'd' | 'x' | 'a';

export const ROLES: Role[] = ['super_admin', 'syndic_admin', 'manager', 'accountant', 'owner', 'tenant', 'provider'];

export const MATRIX: Record<Role, Record<string, string>> = {
  super_admin: { platform: 'vced', audit: 'v' },
  syndic_admin: {
    residences: 'vced', units: 'vced', residents: 'vced', finance: 'vced', payments: 'vcex', expenses: 'vceda',
    complaints: 'vced', maintenance: 'vced', announcements: 'vced', documents: 'vced', assemblies: 'vced',
    providers: 'vced', reports: 'v', users: 'vced', audit: 'v', settings: 've', reconciliation: 'vcex',
  },
  manager: {
    residences: 've', units: 'vced', residents: 'vced', finance: 'v', payments: 'vc', expenses: 'vce',
    complaints: 'vced', maintenance: 'vced', announcements: 'vced', documents: 'vced', assemblies: 'vced',
    providers: 'vced', reports: 'v',
  },
  accountant: {
    residences: 'v', units: 'v', residents: 'v', finance: 'vced', payments: 'vcex', expenses: 'vceda',
    documents: 'vc', providers: 'v', reports: 'v', reconciliation: 'vcex',
  },
  owner: { finance: 'v', payments: 'vc', complaints: 'vc', announcements: 'v', documents: 'v', assemblies: 'v' },
  tenant: { complaints: 'vc', announcements: 'v', documents: 'v' },
  provider: { maintenance: 've' },
};

export const can = (role: Role, module: string, action: Action): boolean => (MATRIX[role]?.[module] || '').includes(action);

export const STAFF_ROLES: Role[] = ['syndic_admin', 'manager', 'accountant'];
export const RESIDENT_ROLES: Role[] = ['owner', 'tenant'];
