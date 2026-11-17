import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { I18nService, TPipe } from '../core/i18n.service';
import { can, isResident } from '../core/permissions';
import { IconComponent } from '../shared/icon';
import { NotificationsBell } from '../shared/notifications-bell';

interface NavItem { module: string; path: string; icon: string; key: string; residentKey?: string }

const NAV: NavItem[] = [
  { module: 'dashboard', path: '/dashboard', icon: 'grid', key: 'nav.dashboard' },
  { module: 'residences', path: '/residences', icon: 'building', key: 'nav.residences' },
  { module: 'units', path: '/units', icon: 'door', key: 'nav.units' },
  { module: 'finance', path: '/finance', icon: 'wallet', key: 'nav.finance', residentKey: 'nav.finance.mine' },
  { module: 'payments', path: '/payments', icon: 'card', key: 'nav.payments', residentKey: 'nav.payments.mine' },
  { module: 'reconciliation', path: '/reconciliation', icon: 'check', key: 'nav.reconciliation' },
  { module: 'expenses', path: '/expenses', icon: 'receipt', key: 'nav.expenses' },
  { module: 'maintenance', path: '/maintenance', icon: 'door', key: 'nav.maintenance', residentKey: 'nav.maintenance.mine' },
  { module: 'documents', path: '/documents', icon: 'receipt', key: 'nav.documents' },
  { module: 'assemblies', path: '/assemblies', icon: 'building', key: 'nav.assemblies' },
  { module: 'reports', path: '/reports', icon: 'grid', key: 'nav.reports' },
  { module: 'platform', path: '/platform', icon: 'building', key: 'nav.platform' },
  { module: 'providers', path: '/providers', icon: 'building', key: 'nav.providers' },
  { module: 'complaints', path: '/complaints', icon: 'info', key: 'nav.complaints', residentKey: 'nav.complaints.mine' },
  { module: 'announcements', path: '/announcements', icon: 'send', key: 'nav.announcements' },
  { module: 'users', path: '/users', icon: 'door', key: 'nav.users' },
  { module: 'audit', path: '/audit', icon: 'lock', key: 'nav.audit' },
  { module: 'dashboard', path: '/settings', icon: 'lock', key: 'nav.settings' },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TPipe, IconComponent, NotificationsBell],
  template: `
    <div class="shell" [class.nav-open]="navOpen()">
      <aside class="sidebar" id="sidebar" [attr.aria-label]="'nav.main' | t">
        <a class="brand" routerLink="/dashboard">
          <span class="brand-mark"><app-icon name="mark" /></span>
          <span>Syndic<small>.ma</small></span>
        </a>
        <nav class="nav">
          <div class="nav-group">
            @for (item of items(); track item.path) {
              <a class="nav-link" [routerLink]="item.path" routerLinkActive #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null" (click)="navOpen.set(false)">
                <app-icon [name]="item.icon" /><span>{{ label(item) | t }}</span>
              </a>
            }
          </div>
        </nav>
        <div class="sidebar-foot"><span class="demo-pill">API</span></div>
      </aside>
      <button type="button" class="scrim" (click)="navOpen.set(false)" [attr.aria-label]="'common.close' | t"></button>

      <div class="main">
        <header class="topbar">
          <button type="button" class="icon-btn menu-toggle" (click)="navOpen.set(!navOpen())" [attr.aria-expanded]="navOpen()" aria-controls="sidebar" [attr.aria-label]="'nav.open' | t"><app-icon name="menu" /></button>
          <span class="spacer"></span>
          @if (auth.user()?.orgId) { <app-notifications-bell /> }
          <div class="lang-switch" role="group" [attr.aria-label]="'shell.language' | t">
            <button type="button" lang="fr" [attr.aria-pressed]="i18n.lang() === 'fr'" (click)="i18n.set('fr')">FR</button>
            <button type="button" lang="ar" [attr.aria-pressed]="i18n.lang() === 'ar'" (click)="i18n.set('ar')">ع</button>
          </div>
          <button type="button" class="icon-btn theme-btn" (click)="toggleTheme()" [attr.aria-label]="(dark() ? 'shell.lightMode' : 'shell.darkMode') | t"><app-icon [name]="dark() ? 'sun' : 'moon'" /></button>
          <div class="user-btn" style="cursor:default">
            <span class="avatar" aria-hidden="true">{{ initials() }}</span>
            <span class="user-meta"><strong>{{ auth.user()?.name }}</strong><span>{{ role() }}</span></span>
          </div>
          <button type="button" class="icon-btn" (click)="auth.logout()" [attr.aria-label]="'shell.logout' | t" [title]="'shell.logout' | t"><app-icon name="logout" /></button>
        </header>
        <main class="view" id="view" tabindex="-1"><router-outlet /></main>
      </div>
    </div>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly navOpen = signal(false);
  protected readonly dark = signal(document.documentElement.dataset['theme'] === 'dark');

  protected readonly items = computed(() => NAV.filter((n) => n.module === 'dashboard' || can(this.auth.user()?.role, n.module)));
  protected readonly initials = computed(() => (this.auth.user()?.name ?? '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase());
  protected readonly role = computed(() => this.i18n.tl('role', this.auth.user()?.role));

  protected label(item: NavItem): string {
    const role = this.auth.user()?.role;
    // residents and providers see "my ..." wording ("Mes charges", "Mes interventions")
    return (isResident(role) || role === 'provider') && item.residentKey ? item.residentKey : item.key;
  }

  protected toggleTheme(): void {
    const next = this.dark() ? 'light' : 'dark';
    document.documentElement.dataset['theme'] = next;
    this.dark.set(next === 'dark');
  }
}
