import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';

/**
 * "Flere felt (N)" (U31): the fold a full form puts its `advanced` fields in, so
 * the first screen holds only what is required and what an auditor looks for.
 * It starts open when one of the folded fields already has a value.
 *
 *   <app-more-fields [count]="3" [open]="hasAdvancedValue()">…fields…</app-more-fields>
 */
@Component({
  selector: 'app-more-fields',
  imports: [TranslocoPipe],
  viewProviders: [provideSharedScope('forms')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (count() > 0) {
      <details
        class="group rounded-tile border border-border"
        [open]="open()"
        data-testid="more-fields"
      >
        <summary
          class="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <span aria-hidden="true" class="text-fg-muted transition-transform group-open:rotate-90"
            >›</span
          >
          {{ 'forms.more.title' | transloco: { count: count() } }}
          <span class="ml-auto text-meta font-normal text-fg-muted">{{
            'forms.more.hint' | transloco
          }}</span>
        </summary>
        <div class="flex flex-col gap-4 border-t border-border p-3">
          <ng-content />
        </div>
      </details>
    }
  `,
})
export class MoreFields {
  /** Number of folded fields (the fold is hidden when 0). */
  readonly count = input.required<number>();
  readonly open = input(false);
}
