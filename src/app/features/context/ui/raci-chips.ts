import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RACI_ROLES, Raci, RaciAssignment } from '../data/context.models';
import { RaciLetter } from './raci-letter';

export interface RaciGroup {
  readonly raci: Raci;
  readonly assignments: readonly RaciAssignment[];
}

/** Assignments grouped R, A, C, I (empty groups kept so gaps are visible). */
export function raciGroups(assignments: readonly RaciAssignment[]): RaciGroup[] {
  return RACI_ROLES.map((raci) => ({
    raci,
    assignments: assignments.filter((a) => a.raci === raci),
  }));
}

/** Read-only RACI assignments of one responsibility, grouped by letter. */
@Component({
  selector: 'app-context-raci-chips',
  imports: [TranslocoPipe, RaciLetter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      @for (group of groups(); track group.raci) {
        <div class="rounded-tile border border-border p-2.5">
          <dt class="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-fg">
            <app-context-raci-letter [raci]="group.raci" />
            {{ 'context.raci.roles.' + group.raci | transloco }}
          </dt>
          <dd class="text-[13px] text-fg-muted">
            @for (a of group.assignments; track a.type + a.value; let last = $last) {
              <span class="text-fg">
                @if (a.type === 'role') {
                  {{ 'roles.' + a.value + '.name' | transloco }}
                } @else {
                  {{ a.name || a.value }}
                }
              </span>
              <span class="text-[11.5px] text-fg-subtle">
                ({{ 'context.assigneeTypes.' + a.type | transloco }})</span
              >{{ last ? '' : ', ' }}
            } @empty {
              <span class="text-fg-subtle">{{ 'context.raci.nobody' | transloco }}</span>
            }
          </dd>
        </div>
      }
    </dl>
  `,
})
export class RaciChips {
  readonly assignments = input.required<readonly RaciAssignment[]>();

  protected readonly groups = computed(() => raciGroups(this.assignments()));
}
