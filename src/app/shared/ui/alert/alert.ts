import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AlertTone = 'error' | 'success' | 'info';

/**
 * Inline status message (form errors, success notices). Errors use
 * `role="alert"` so they are announced; other tones use `role="status"`.
 */
@Component({
  selector: 'app-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p
      [attr.role]="tone() === 'error' ? 'alert' : 'status'"
      class="rounded-tile border px-3 py-2 text-[13px] font-medium"
      [class]="classes()"
    >
      <ng-content />
    </p>
  `,
})
export class Alert {
  readonly tone = input<AlertTone>('error');

  private readonly toneClasses: Record<AlertTone, string> = {
    error: 'border-fail/30 bg-fail-soft text-fail',
    success: 'border-pass/30 bg-pass-soft text-pass',
    info: 'border-info/30 bg-info-soft text-info',
  };

  protected readonly classes = computed(() => this.toneClasses[this.tone()]);
}
