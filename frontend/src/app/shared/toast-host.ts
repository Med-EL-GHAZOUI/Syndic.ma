import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon';

@Component({
  selector: 'app-toasts',
  imports: [IconComponent],
  template: `
    <div class="toasts" role="region" aria-live="polite" aria-label="Notifications">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="t.type" [attr.role]="t.type === 'error' ? 'alert' : 'status'">
          <app-icon [name]="t.type === 'success' ? 'check' : t.type === 'error' ? 'ban' : 'info'" />
          <p>{{ t.text }}</p>
          <button type="button" aria-label="×" (click)="toast.dismiss(t.id)"><app-icon name="x" /></button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly toast = inject(ToastService);
}
