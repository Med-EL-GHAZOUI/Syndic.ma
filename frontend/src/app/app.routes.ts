import { Routes } from '@angular/router';
import { authGuard, guestGuard, moduleGuard } from './core/guards';

// Route-level lazy loading keeps the initial bundle small. `data.module` feeds moduleGuard
// (UI convenience only — the API enforces permissions on every call).
export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login').then((m) => m.LoginPage) },
  { path: 'forgot-password', canActivate: [guestGuard], loadComponent: () => import('./pages/forgot-password').then((m) => m.ForgotPasswordPage) },
  { path: 'reset-password', canActivate: [guestGuard], loadComponent: () => import('./pages/reset-password').then((m) => m.ResetPasswordPage) },
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
      { path: 'reconciliation', canActivate: [moduleGuard], data: { module: 'reconciliation' }, loadComponent: () => import('./pages/reconciliation').then((m) => m.ReconciliationPage) },
      { path: 'expenses', canActivate: [moduleGuard], data: { module: 'expenses' }, loadComponent: () => import('./pages/expenses').then((m) => m.ExpensesPage) },
      { path: 'complaints', canActivate: [moduleGuard], data: { module: 'complaints' }, loadComponent: () => import('./pages/complaints').then((m) => m.ComplaintsPage) },
      { path: 'announcements', canActivate: [moduleGuard], data: { module: 'announcements' }, loadComponent: () => import('./pages/announcements').then((m) => m.AnnouncementsPage) },
      { path: 'users', canActivate: [moduleGuard], data: { module: 'users' }, loadComponent: () => import('./pages/users').then((m) => m.UsersPage) },
      { path: 'audit', canActivate: [moduleGuard], data: { module: 'audit' }, loadComponent: () => import('./pages/audit').then((m) => m.AuditPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings').then((m) => m.SettingsPage) },
      { path: 'maintenance', canActivate: [moduleGuard], data: { module: 'maintenance' }, loadComponent: () => import('./pages/maintenance').then((m) => m.MaintenancePage) },
      { path: 'documents', canActivate: [moduleGuard], data: { module: 'documents' }, loadComponent: () => import('./pages/documents').then((m) => m.DocumentsPage) },
      { path: 'providers', canActivate: [moduleGuard], data: { module: 'providers' }, loadComponent: () => import('./pages/providers').then((m) => m.ProvidersPage) },
      { path: 'assemblies', canActivate: [moduleGuard], data: { module: 'assemblies' }, loadComponent: () => import('./pages/assemblies').then((m) => m.AssembliesPage) },
      { path: 'reports', canActivate: [moduleGuard], data: { module: 'reports' }, loadComponent: () => import('./pages/reports').then((m) => m.ReportsPage) },
      { path: 'platform', canActivate: [moduleGuard], data: { module: 'platform' }, loadComponent: () => import('./pages/platform').then((m) => m.PlatformPage) },
      { path: 'forbidden', loadComponent: () => import('./pages/forbidden').then((m) => m.ForbiddenPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
