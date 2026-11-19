import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { CompleteGroup } from './field-tier';

/**
 * "Fullfør posten" (U31): the record's checklist of what is still to fill in,
 * grouped by section, each group with one line on why it matters. Only groups
 * with something missing are listed; the card is gone once everything is done.
 * `(fill)` asks the host to open its edit form (hidden when `canEdit` is false).
 *
 *   <app-complete-record [groups]="completeGroups()" [canEdit]="canEdit()"
 *     (fill)="startEdit()" />
 */
@Component({
  selector: 'app-complete-record',
  imports: [TranslocoPipe],
  viewProviders: [provideSharedScope('forms')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open().length > 0) {
      <section
        class="rounded-card border border-border bg-surface p-4"
        aria-labelledby="complete-record-title"
        data-testid="complete-record"
      >
        <div class="mb-1 flex items-center gap-2">
          <h2 id="complete-record-title" class="font-display text-card font-bold text-fg">
            {{ 'forms.complete.title' | transloco }}
          </h2>
          @if (canEdit()) {
            <button
              type="button"
              class="ml-auto min-h-8 rounded-md px-2 text-meta font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              data-testid="complete-record-fill"
              (click)="fill.emit()"
            >
              {{ 'forms.complete.fill' | transloco }} →
            </button>
          }
        </div>
        <p class="mb-2 text-meta text-fg-muted" data-testid="complete-record-progress">
          {{ 'forms.complete.progress' | transloco: { done: done(), total: total() } }}
        </p>
        <div
          class="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin="0"
          [attr.aria-valuemax]="total()"
          [attr.aria-valuenow]="done()"
          [attr.aria-label]="'forms.complete.title' | transloco"
        >
          <div class="h-full bg-accent" [style.width.%]="(done() / total()) * 100"></div>
        </div>
        <ul class="flex flex-col gap-3">
          @for (group of open(); track group.key) {
            <li data-testid="complete-record-group">
              <p class="flex items-baseline gap-2 text-ui font-semibold text-fg">
                {{ group.title ?? (group.titleKey ?? '' | transloco) }}
                <span class="text-micro font-normal text-fg-muted">{{
                  'forms.complete.groupProgress' | transloco: groupCount(group)
                }}</span>
              </p>
              <p class="text-meta text-fg-muted">{{ group.reasonKey | transloco }}</p>
              <ul class="mt-1 flex flex-wrap gap-1.5">
                @for (item of group.items; track item.key) {
                  @if (!item.done) {
                    <li
                      class="rounded-full border border-warn/40 bg-warn-soft/40 px-2.5 py-0.5 text-meta text-fg"
                      data-testid="complete-record-item"
                    >
                      {{ item.label ?? (item.labelKey ?? '' | transloco) }}
                    </li>
                  }
                }
              </ul>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class CompleteRecord {
  readonly groups = input.required<readonly CompleteGroup[]>();
  readonly canEdit = input(false);
  readonly fill = output<void>();

  private readonly items = computed(() => this.groups().flatMap((group) => group.items));
  protected readonly total = computed(() => this.items().length);
  protected readonly done = computed(() => this.items().filter((item) => item.done).length);
  /** Groups with something still missing. */
  protected readonly open = computed(() =>
    this.groups().filter((group) => group.items.some((item) => !item.done)),
  );

  protected groupCount(group: CompleteGroup): { done: number; total: number } {
    return {
      done: group.items.filter((item) => item.done).length,
      total: group.items.length,
    };
  }
}
