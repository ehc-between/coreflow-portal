import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { GuidanceService } from '../../../core/guidance/guidance.service';

/**
 * One line that explains a register's status words that look alike (simplify U39):
 * "Løst betyr … Lukket betyr …". Beginners only; it sits under the list filters.
 *
 *   <app-status-legend filters [text]="'feedback.statusPair' | transloco" />
 *
 * Inside `<app-record-list-page>` give it the `filters` attribute: it takes a full row
 * at the end of the filter bar.
 */
@Component({
  selector: 'app-status-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'order-last basis-full', '[class.hidden]': '!beginner() || !text()' },
  template: `
    @if (beginner() && text()) {
      <p data-testid="status-legend" class="flex items-start gap-1.5 text-meta text-fg-muted">
        <span
          class="mt-px flex h-4 w-4 flex-none items-center justify-center rounded-full border border-current text-micro leading-none font-bold"
          aria-hidden="true"
          >i</span
        >
        <span>{{ text() }}</span>
      </p>
    }
  `,
})
export class StatusLegend {
  protected readonly beginner = inject(GuidanceService).isBeginner;

  /** The translated explanation. */
  readonly text = input<string | null | undefined>('');
}
