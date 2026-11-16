import { Component, input, output } from '@angular/core';
import { TPipe } from '../core/i18n.service';
import { ModalComponent } from './modal';

@Component({
  selector: 'app-confirm',
  imports: [ModalComponent, TPipe],
  template: `
    <app-modal [title]="title()" size="sm" (closed)="cancelled.emit()">
      <p>{{ message() }}</p>
      <ng-container footer>
        <button type="button" class="btn btn-secondary" (click)="cancelled.emit()">{{ 'common.cancel' | t }}</button>
        <button type="button" class="btn" [class.btn-danger]="danger()" [class.btn-primary]="!danger()" (click)="confirmed.emit()">{{ confirmLabel() || ('common.confirm' | t) }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('');
  readonly danger = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
