import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../shared/ui/button/button';
import { LoadState } from './loadable';

/** Loading and error placeholders of an audit page or panel (with a retry button). */
@Component({
  selector: 'app-audit-load-state',
  imports: [TranslocoPipe, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (state() === 'loading') {
      <p class="py-10 text-center text-[14px] text-fg-muted" role="status" aria-live="polite">
        {{ 'audits.common.loading' | transloco }}
      </p>
    } @else if (state() === 'error') {
      <div class="flex flex-col items-center gap-3 py-10 text-center" role="alert">
        <p class="text-[14px] text-fail">{{ 'audits.common.loadFailed' | transloco }}</p>
        <app-button variant="secondary" size="sm" (click)="retry.emit()">
          {{ 'audits.common.retry' | transloco }}
        </app-button>
      </div>
    }
  `,
})
export class AuditLoadState {
  readonly state = input.required<LoadState>();
  readonly retry = output<void>();
}
