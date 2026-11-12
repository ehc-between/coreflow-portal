import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ClauseChips } from '../../../shared/guidance/clause-chips';
import { Badge } from '../../../shared/ui/badge/badge';
import { Obligation } from '../data/ai-governance.models';
import { obligationTaskTone } from '../data/ai-governance-display';

/** The obligations of a classification, with their article, clause chip and task (if any). */
@Component({
  selector: 'app-ai-obligation-list',
  imports: [RouterLink, TranslocoPipe, ClauseChips, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (obligations().length === 0) {
      <p class="text-[13px] text-fg-muted">{{ 'aiGovernance.obligations.none' | transloco }}</p>
    } @else {
      <ul class="divide-y divide-border" data-testid="obligation-list">
        @for (o of obligations(); track o.key) {
          <li class="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-[13.5px] font-semibold text-fg">{{ o.title }}</p>
              <p class="mt-0.5 text-[12px] text-fg-subtle">{{ o.article }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <app-clause-chips [clauses]="[o.ref]" />
              @if (showTasks()) {
                @if (o.task_id) {
                  <a
                    [routerLink]="['/tasks', o.task_id]"
                    class="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline"
                  >
                    <app-badge [tone]="tone(o.task_status)">{{
                      'aiGovernance.taskStatus.' + (o.task_status || 'open') | transloco
                    }}</app-badge>
                    <span class="sr-only">{{
                      'aiGovernance.obligations.openTask' | transloco
                    }}</span>
                  </a>
                } @else {
                  <span class="text-[12px] text-fg-subtle">{{
                    'aiGovernance.obligations.noTask' | transloco
                  }}</span>
                }
              }
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class AiObligationList {
  readonly obligations = input<readonly Obligation[]>([]);
  readonly showTasks = input(true);

  protected readonly tone = obligationTaskTone;
}
