import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; type: 'success' | 'error' | 'info'; text: string }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, type: Toast['type'] = 'success', ms = 4500): void {
    const id = ++this.seq;
    this.toasts.update((l) => [...l, { id, type, text }]);
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number): void {
    this.toasts.update((l) => l.filter((t) => t.id !== id));
  }

  /** Surfaces the API's validation/business message (it is already user-oriented). */
  error(err: unknown, fallback: string): void {
    const body = err instanceof HttpErrorResponse ? (err.error as { message?: string | string[] } | null) : null;
    const msg = Array.isArray(body?.message) ? body.message.join(' · ') : body?.message;
    this.show(msg || fallback, 'error', 7000);
  }
}
