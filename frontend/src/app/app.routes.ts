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
      { path: 'forbidden', loadComponent: () => import('./pages/forbidden').then((m) => m.ForbiddenPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
