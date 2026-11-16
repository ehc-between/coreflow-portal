import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../button/button';
import { Icon } from '../icon/icon';

/**
 * A view could not load: what happened, in neutral words, and a "Prøv igjen" button.
 *
 *   @if (error()) { <app-error-state (retry)="load()" /> }
 */
@Component({
  selector: 'app-error-state',
  imports: [TranslocoPipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      role="alert"
      data-testid="error-state"
      class="flex flex-col items-center rounded-card border border-border bg-surface px-6 py-10 text-center"
    >
      <span
        class="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-warn-soft text-warn-ink"
        aria-hidden="true"
        ><app-icon name="alert" [size]="20"
      /></span>
      <p class="text-card font-semibold text-fg">{{ titleKey() | transloco }}</p>
      <p class="mt-1 max-w-[52ch] text-ui text-fg-muted">{{ bodyKey() | transloco }}</p>
      <div class="mt-4">
        <app-button variant="secondary" data-testid="error-retry" (click)="retry.emit()">
          {{ 'ui.error.retry' | transloco }}
        </app-button>
      </div>
    </div>
  `,
})
export class ErrorState {
  readonly titleKey = input('ui.error.title');
  readonly bodyKey = input('ui.error.body');

  readonly retry = output<void>();
}
