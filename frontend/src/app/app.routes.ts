import { Routes } from '@angular/router';
import { authGuard, guestGuard, moduleGuard } from './core/guards';

// Route-level lazy loading keeps the initial bundle small. `data.module` feeds moduleGuard
// (UI convenience only — the API enforces permissions on every call).
export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login').then((m) => m.LoginPage) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard').then((m) => m.DashboardPage) },
      { path: 'residences', canActivate: [moduleGuard], data: { module: 'residences' }, loadComponent: () => import('./pages/residences').then((m) => m.ResidencesPage) },
      { path: 'units', canActivate: [moduleGuard], data: { module: 'units' }, loadComponent: () => import('./pages/units').then((m) => m.UnitsPage) },
      { path: 'finance', canActivate: [moduleGuard], data: { module: 'finance' }, loadComponent: () => import('./pages/finance').then((m) => m.FinancePage) },
      { path: 'payments', canActivate: [moduleGuard], data: { module: 'payments' }, loadComponent: () => import('./pages/payments').then((m) => m.PaymentsPage) },
      { path: 'expenses', canActivate: [moduleGuard], data: { module: 'expenses' }, loadComponent: () => import('./pages/expenses').then((m) => m.ExpensesPage) },
      { path: 'complaints', canActivate: [moduleGuard], data: { module: 'complaints' }, loadComponent: () => import('./pages/complaints').then((m) => m.ComplaintsPage) },
      { path: 'announcements', canActivate: [moduleGuard], data: { module: 'announcements' }, loadComponent: () => import('./pages/announcements').then((m) => m.AnnouncementsPage) },
      { path: 'users', canActivate: [moduleGuard], data: { module: 'users' }, loadComponent: () => import('./pages/users').then((m) => m.UsersPage) },
      { path: 'audit', canActivate: [moduleGuard], data: { module: 'audit' }, loadComponent: () => import('./pages/audit').then((m) => m.AuditPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings').then((m) => m.SettingsPage) },
      { path: 'forbidden', loadComponent: () => import('./pages/forbidden').then((m) => m.ForbiddenPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
