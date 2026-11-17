import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { formatDate, formatMoney } from './format';
import { I18nService } from './i18n.service';
import { AppNotification } from './models';

const POLL_MS = 60_000;

/**
 * In-app notifications. The server sends a TYPE and PARAMS; the sentence is built here, in the current language,
 * so switching FR/AR also translates notifications received earlier. Polling is deliberately simple (one cheap
 * count request a minute, paused while the tab is hidden): no websocket to operate yet.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);

  readonly items = signal<AppNotification[]>([]);
  readonly unread = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    effect(() => (this.auth.user()?.orgId ? this.start() : this.stop()));
  }

  private start(): void {
    if (this.timer) return;
    this.refreshCount();
    this.timer = setInterval(() => { if (!document.hidden) this.refreshCount(); }, POLL_MS);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.items.set([]);
    this.unread.set(0);
  }

  refreshCount(): void {
    this.http.get<{ count: number }>('/api/notifications/unread-count').subscribe({ next: (r) => this.unread.set(r.count), error: () => undefined });
  }

  load(): void {
    this.http.get<AppNotification[]>('/api/notifications?limit=30').subscribe({ next: (l) => { this.items.set(l); this.refreshCount(); }, error: () => undefined });
  }

  markRead(n: AppNotification): void {
    if (n.readAt) return;
    this.http.post(`/api/notifications/${n.id}/read`, {}).subscribe({
      next: () => {
        this.items.update((l) => l.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
        this.unread.update((c) => Math.max(0, c - 1));
      },
      error: () => undefined,
    });
  }

  markAllRead(): void {
    this.http.post('/api/notifications/read-all', {}).subscribe({
      next: () => { this.items.update((l) => l.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() }))); this.unread.set(0); },
      error: () => undefined,
    });
  }

  /** Localized sentence. Amounts and dates are formatted for the current language, like everywhere else in the UI. */
  message(n: AppNotification): string {
    const lang = this.i18n.lang();
    const params: Record<string, string | number> = { ...n.params };
    if (typeof params['amount'] === 'number') params['amount'] = formatMoney(params['amount'], lang);
    if (typeof params['date'] === 'string') params['date'] = formatDate(params['date'], lang);
    const key = `notif.${n.type}`;
    const text = this.i18n.t(key, params);
    return text === key ? this.i18n.t('notif.unknown') : text; // a type this client does not know yet
  }
}
