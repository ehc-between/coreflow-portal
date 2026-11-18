import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ClosureCheck } from '../../../core/deviations/deviation.models';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * "Klar til å lukke?" (audit finding 11): what ISO 10.2 expects before a deviation
 * is closed — a root cause, finished actions, their effect checked — plus the
 * recommended steps (requirements linked, authorities notified). Required items
 * are marked; the closing transition stays blocked by the API until they are done.
 */
@Component({
  selector: 'app-deviation-closure-checklist',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-card border border-border bg-surface p-4"
      aria-labelledby="dev-checklist-title"
      data-testid="closure-checklist"
    >
      <div class="mb-1 flex items-center justify-between gap-2">
        <h2 id="dev-checklist-title" class="font-display text-card font-bold text-fg">
          {{ 'deviations.checklist.title' | transloco }}
        </h2>
        <span class="text-meta font-semibold text-fg-muted">{{
          'deviations.checklist.progress' | transloco: { done: doneCount(), total: items().length }
        }}</span>
      </div>
      <p class="mb-3 text-meta text-fg-muted">
        {{
          (allRequiredDone() ? 'deviations.checklist.ready' : 'deviations.checklist.intro')
            | transloco
        }}
      </p>
      <ul class="flex flex-col gap-2">
        @for (item of items(); track item.key) {
          <li class="flex items-start gap-2 text-ui" [attr.data-check]="item.key">
            <span
              class="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border"
              [class]="
                item.done
                  ? 'border-pass bg-pass text-white'
                  : 'border-border-strong text-transparent'
              "
              aria-hidden="true"
            >
              <app-icon name="check" [size]="11" />
            </span>
            <span class="min-w-0 flex-1" [class]="item.done ? 'text-fg-muted' : 'text-fg'">
              <span class="sr-only">{{
                (item.done ? 'deviations.checklist.doneSr' : 'deviations.checklist.todoSr')
                  | transloco
              }}</span>
              {{ 'deviations.checklist.items.' + item.key | transloco }}
              @if (!item.required) {
                <span class="text-meta text-fg-subtle">
                  · {{ 'deviations.checklist.recommended' | transloco }}</span
                >
              }
            </span>
          </li>
        }
      </ul>
    </section>
  `,
})
export class DeviationClosureChecklist {
  readonly items = input.required<readonly ClosureCheck[]>();

  protected readonly doneCount = computed(() => this.items().filter((i) => i.done).length);
  protected readonly allRequiredDone = computed(() =>
    this.items().every((i) => i.done || !i.required),
  );
}
