import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, inject, input, output } from '@angular/core';
import { TPipe } from '../core/i18n.service';
import { IconComponent } from './icon';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';
let seq = 0;

/** Accessible dialog: role=dialog, labelled, Escape closes, Tab is trapped, focus is restored. */
@Component({
  selector: 'app-modal',
  imports: [TPipe, IconComponent],
  template: `
    <div class="modal-backdrop" (mousedown)="onBackdrop($event)">
      <div class="modal" [class.sm]="size() === 'sm'" [class.lg]="size() === 'lg'" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId">
        <div class="modal-head">
          <h2 [id]="titleId">{{ title() }}</h2>
          <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /></button>
        </div>
        <div class="modal-body"><ng-content /></div>
        <div class="modal-foot"><ng-content select="[footer]" /></div>
      </div>
    </div>
  `,
})
export class ModalComponent implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly closed = output<void>();

  protected readonly titleId = `modal-title-${++seq}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private previous: Element | null = null;

  ngAfterViewInit(): void {
    this.previous = document.activeElement;
    document.body.classList.add('modal-open');
    const first = this.host.nativeElement.querySelector<HTMLElement>('.modal-body input, .modal-body select, .modal-body textarea');
    (first ?? this.host.nativeElement.querySelector<HTMLElement>('.modal-head button'))?.focus();
  }

  ngOnDestroy(): void {
    document.body.classList.remove('modal-open');
    if (this.previous instanceof HTMLElement) this.previous.focus();
  }

  onBackdrop(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) this.closed.emit();
  }

  @HostListener('keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.closed.emit();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
