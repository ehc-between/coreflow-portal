import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DeviationEvent } from '../../../core/deviations/deviation.models';
import { EventText } from '../deviation-events';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Icon } from '../../../shared/ui/icon/icon';

/** One rendered history row. */
export interface HistoryRow {
  readonly event: DeviationEvent;
  readonly text: EventText;
}

const PAGE = 30;

/** Icon of an event kind. */
export function eventIcon(kind: string): string {
  switch (kind) {
    case 'status':
    case 'status_change':
    case 'status_changed':
      return 'flag';
    case 'action':
    case 'action_added':
    case 'action_updated':
      return 'checkcircle';
    case 'comment':
      return 'comment';
    case 'created':
      return 'spark';
    default:
      return 'history';
  }
}

/**
 * "Historikk" (audit findings 5 and 13): the deviation's own case history —
 * registered, edits, status changes with their reasons, actions, analyses and
 * notifications — newest first, localised from each event's kind and details.
 * It is the one history of the case (shown in the Activity tab), so the page no
 * longer has two lists that disagree.
 */
@Component({
  selector: 'app-deviation-case-history',
  imports: [TranslocoPipe, LocalDatePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="dev-history-title">
      <h2 id="dev-history-title" class="mb-3 font-display text-section font-bold text-fg">
        {{ 'deviations.history.title' | transloco }}
      </h2>
      @if (rows().length === 0) {
        <p class="rounded-tile border border-dashed border-border px-4 py-5 text-ui text-fg-muted">
          {{ 'deviations.detail.noEvents' | transloco }}
        </p>
      } @else {
        <ol
          class="relative flex flex-col gap-4 border-l border-border pl-5"
          data-testid="case-history"
        >
          @for (row of visible(); track row.event.id) {
            <li class="relative">
              <span
                class="absolute top-0.5 -left-[29px] flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-surface text-fg-muted"
                aria-hidden="true"
              >
                <app-icon [name]="icon(row.event.kind)" [size]="11" />
              </span>
              <p class="text-ui font-medium text-fg">{{ row.text.summary }}</p>
              @if (row.text.detail) {
                <p class="text-meta whitespace-pre-line text-fg-muted">{{ row.text.detail }}</p>
              }
              <p class="text-meta text-fg-subtle">
                @if (row.event.actor_name) {
                  {{
                    'deviations.events.byline'
                      | transloco
                        : { actor: row.event.actor_name, date: (row.event.created_at | localDate) }
                  }}
                } @else {
                  {{ row.event.created_at | localDate }}
                }
              </p>
            </li>
          }
        </ol>
        @if (rows().length > limit()) {
          <button
            type="button"
            class="mt-4 text-meta font-semibold text-accent hover:underline"
            (click)="limit.set(limit() + page)"
          >
            {{ 'deviations.history.more' | transloco }}
          </button>
        }
      }
    </section>
  `,
})
export class DeviationCaseHistory {
  readonly rows = input.required<readonly HistoryRow[]>();

  protected readonly page = PAGE;
  protected readonly limit = signal(PAGE);
  protected readonly visible = computed(() => this.rows().slice(0, this.limit()));
  protected readonly icon = eventIcon;
}
