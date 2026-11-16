// UI-only mirror of the API's RBAC matrix (backend/src/common/permissions.ts).
// It only decides what to SHOW; the server remains the single authority and re-checks everything.
// TODO: share this file between backend and frontend through a workspace package.
import { Role } from './models';

export type Action = 'v' | 'c' | 'e' | 'd' | 'x' | 'a';

const MATRIX: Record<Role, Record<string, string>> = {
  super_admin: { platform: 'vced', audit: 'v' },
  syndic_admin: {
    residences: 'vced', units: 'vced', residents: 'vced', finance: 'vced', payments: 'vcex', expenses: 'vceda',
    complaints: 'vced', maintenance: 'vced', announcements: 'vced', documents: 'vced', assemblies: 'vced',
    providers: 'vced', reports: 'v', users: 'vced', audit: 'v', settings: 've',
  },
  manager: {
    residences: 've', units: 'vced', residents: 'vced', finance: 'v', payments: 'vc', expenses: 'vce',
    complaints: 'vced', maintenance: 'vced', announcements: 'vced', documents: 'vced', assemblies: 'vced', providers: 'vced', reports: 'v',
  },
  accountant: { residences: 'v', units: 'v', residents: 'v', finance: 'vced', payments: 'vcex', expenses: 'vceda', documents: 'vc', providers: 'v', reports: 'v' },
  owner: { finance: 'v', payments: 'vc', complaints: 'vc', announcements: 'v', documents: 'v', assemblies: 'v' },
  tenant: { complaints: 'vc', announcements: 'v', documents: 'v' },
  provider: { maintenance: 've' },
};

export const can = (role: Role | undefined, module: string, action: Action = 'v'): boolean =>
  !!role && (MATRIX[role]?.[module] ?? '').includes(action);

export const isResident = (role: Role | undefined): boolean => role === 'owner' || role === 'tenant';
