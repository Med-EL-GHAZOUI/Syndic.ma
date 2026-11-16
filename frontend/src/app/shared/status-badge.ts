import { Component, computed, input } from '@angular/core';
import { TlPipe } from '../core/i18n.service';

const TONES: Record<string, string> = {
  paid: 'success', partial: 'warning', unpaid: 'neutral', overdue: 'danger', pending: 'warning', recorded: 'success',
  reversed: 'danger', rejected: 'danger', draft: 'neutral', issued: 'info', closed: 'neutral',
};

@Component({
  selector: 'app-badge',
  imports: [TlPipe],
  template: `<span class="badge" [class]="'badge-' + tone()">{{ value() | tl: group() }}</span>`,
})
export class StatusBadge {
  readonly group = input.required<string>();
  readonly value = input.required<string>();
  protected readonly tone = computed(() => TONES[this.value()] ?? 'neutral');
}
