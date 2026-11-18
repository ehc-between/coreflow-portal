import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { HealthItem, ProcessHealth } from '../data/process.models';

/**
 * "Er prosessen komplett?": the nine building blocks of a well-described
 * process (owner, purpose, scope, map, approved description, a KPI with data,
 * a linked risk, a confirmed requirement, a review on time) as a checklist,
 * with "6 av 9 på plass" and a button on every missing item that goes to where
 * it is fixed. Editors see the fix buttons; readers see the checklist only.
 */
@Component({
  selector: 'app-process-health-card',
  imports: [TranslocoPipe, Card, Icon, ProgressBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let h = health();
    <app-card data-testid="health-card">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-card font-bold text-fg">{{ 'processes.health.title' | transloco }}</h2>
        <p class="text-ui font-semibold" [class]="complete() ? 'text-pass-ink' : 'text-fg-muted'">
          {{ 'processes.health.summary' | transloco: { done: h.done, total: h.total } }}
        </p>
      </div>
      <p class="mt-0.5 text-meta text-fg-muted">{{ 'processes.health.intro' | transloco }}</p>
      <div class="mt-2">
        <app-progress-bar
          [value]="percent()"
          [color]="complete() ? 'var(--pass)' : 'var(--accent)'"
          [label]="'processes.health.summary' | transloco: { done: h.done, total: h.total }"
        />
      </div>
      <ul class="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        @for (item of h.items; track item.key) {
          <li
            class="flex min-h-8 items-center gap-2 text-ui"
            [attr.data-testid]="'health-' + item.key"
          >
            @if (item.ok) {
              <span
                class="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-pass-soft text-pass-ink"
              >
                <app-icon name="check" [size]="12" />
              </span>
              <span class="text-fg">{{ 'processes.health.items.' + item.key | transloco }}</span>
              <span class="sr-only">{{ 'processes.health.inPlace' | transloco }}</span>
            } @else {
              <span
                class="h-5 w-5 flex-none rounded-full border-2 border-dashed border-border-strong"
                aria-hidden="true"
              ></span>
              <span class="min-w-0 flex-1 text-fg-muted">
                {{ 'processes.health.items.' + item.key | transloco }}
                <span class="sr-only">{{ 'processes.health.missing' | transloco }}</span>
              </span>
              @if (canEdit()) {
                <button
                  type="button"
                  class="flex-none rounded-lg px-1.5 py-1 text-meta font-semibold text-accent hover:bg-surface-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  (click)="fix.emit(item)"
                  [attr.data-testid]="'health-fix-' + item.key"
                >
                  {{ 'processes.health.fix.' + item.key | transloco }}
                </button>
              }
            }
          </li>
        }
      </ul>
    </app-card>
  `,
})
export class HealthCard {
  readonly health = input.required<ProcessHealth>();
  readonly canEdit = input(false);
  readonly fix = output<HealthItem>();

  protected readonly complete = computed(() => this.health().done >= this.health().total);
  protected readonly percent = computed(() => {
    const h = this.health();
    return h.total ? Math.round((h.done / h.total) * 100) : 0;
  });
}
