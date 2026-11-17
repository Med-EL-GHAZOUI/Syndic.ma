import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification } from '../core/models';
import { I18nService, TPipe } from '../core/i18n.service';
import { NotificationsService } from '../core/notifications.service';
import { IconComponent } from './icon';

@Component({
  selector: 'app-notifications-bell',
  imports: [TPipe, IconComponent],
  template: `
    <div class="notif-wrap">
      <button type="button" class="icon-btn notif-btn" (click)="toggle()" [attr.aria-expanded]="open()" aria-controls="notif-panel" [attr.aria-label]="('notif.title' | t) + (svc.unread() ? ' — ' + ('notif.unreadCount' | t: { n: svc.unread() }) : '')">
        <app-icon name="bell" />
        @if (svc.unread() > 0) { <span class="notif-dot" aria-hidden="true">{{ svc.unread() > 99 ? '99+' : svc.unread() }}</span> }
      </button>
      @if (open()) {
        <div class="notif-panel" id="notif-panel" role="region" [attr.aria-label]="'notif.title' | t">
          <div class="notif-head">
            <strong>{{ 'notif.title' | t }}</strong>
            @if (svc.unread() > 0) { <button type="button" class="btn btn-secondary btn-sm" (click)="svc.markAllRead()">{{ 'notif.markRead' | t }}</button> }
          </div>
          <div class="notif-list">
            @for (n of svc.items(); track n.id) {
              <button type="button" class="notif-item" [class.unread]="!n.readAt" (click)="go(n)">
                <span>{{ svc.message(n) }}</span>
                <time [attr.datetime]="n.createdAt">{{ when(n) }}</time>
              </button>
            } @empty { <p class="notif-empty">{{ 'notif.empty' | t }}</p> }
          </div>
        </div>
      }
    </div>
  `,
})
export class NotificationsBell {
  protected readonly svc = inject(NotificationsService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((o) => !o);
    if (this.open()) this.svc.load();
  }

  protected go(n: AppNotification): void {
    this.svc.markRead(n);
    this.open.set(false);
    if (n.link && n.link.startsWith('/')) void this.router.navigateByUrl(n.link);
  }

  protected when(n: AppNotification): string {
    return new Intl.DateTimeFormat(this.i18n.lang() === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(n.createdAt));
  }

  @HostListener('document:click', ['$event']) onDocumentClick(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape') onEscape(): void {
    this.open.set(false);
  }
}
