import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { assignmentTone } from '../data/training-display';
import { Assignment } from '../data/training.models';

/** Table of training assignments (course, person, status, due date, attempts). */
@Component({
  selector: 'app-training-assignment-table',
  imports: [RouterLink, TranslocoPipe, LocalDayPipe, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-x-auto rounded-card border border-border bg-surface">
      <table class="w-full min-w-[640px] text-left text-[13px]" data-testid="assignment-table">
        <caption class="sr-only">
          {{
            captionKey() | transloco
          }}
        </caption>
        <thead class="border-b border-border text-[12px] text-fg-muted">
          <tr>
            @if (showCourse()) {
              <th scope="col" class="px-4 py-2.5 font-semibold">
                {{ 'training.fields.course' | transloco }}
              </th>
            }
            @if (showUser()) {
              <th scope="col" class="px-4 py-2.5 font-semibold">
                {{ 'training.fields.person' | transloco }}
              </th>
            }
            <th scope="col" class="px-4 py-2.5 font-semibold">
              {{ 'training.fields.status' | transloco }}
            </th>
            <th scope="col" class="px-4 py-2.5 font-semibold">
              {{ 'training.fields.reason' | transloco }}
            </th>
            <th scope="col" class="px-4 py-2.5 font-semibold">
              {{ 'training.fields.due' | transloco }}
            </th>
            <th scope="col" class="px-4 py-2.5 text-right font-semibold">
              {{ 'training.fields.attempts' | transloco }}
            </th>
          </tr>
        </thead>
        <tbody>
          @for (a of assignments(); track a.id) {
            <tr class="border-b border-border last:border-0 hover:bg-surface-2">
              @if (showCourse()) {
                <td class="px-4 py-2.5">
                  <a
                    [routerLink]="['/training/assignments', a.id]"
                    class="font-semibold text-fg hover:text-accent"
                  >
                    <span class="font-mono text-[12px] text-fg-muted">{{ a.course.code }}</span>
                    {{ a.course.title }}
                  </a>
                </td>
              }
              @if (showUser()) {
                <td class="px-4 py-2.5">
                  @if (showCourse()) {
                    {{ a.user.name }}
                  } @else {
                    <a
                      [routerLink]="['/training/assignments', a.id]"
                      class="font-semibold text-fg hover:text-accent"
                      >{{ a.user.name }}</a
                    >
                  }
                </td>
              }
              <td class="px-4 py-2.5">
                <app-badge [tone]="tone(a)">
                  {{
                    (a.overdue && (a.status === 'assigned' || a.status === 'in_progress')
                      ? 'training.assignmentStatus.overdue'
                      : 'training.assignmentStatus.' + a.status
                    ) | transloco
                  }}
                </app-badge>
              </td>
              <td class="px-4 py-2.5 text-fg-muted">
                {{ 'training.reason.' + a.reason | transloco }}
              </td>
              <td
                class="px-4 py-2.5"
                [class.text-fail]="a.overdue"
                [class.text-fg-muted]="!a.overdue"
              >
                {{ a.due_at | localDay }}
              </td>
              <td class="px-4 py-2.5 text-right text-fg-muted">{{ a.attempts }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AssignmentTable {
  readonly assignments = input.required<readonly Assignment[]>();
  readonly showCourse = input(true);
  readonly showUser = input(true);
  readonly captionKey = input('training.assignments.title');

  protected tone(a: Assignment) {
    return assignmentTone(a.status, a.overdue);
  }
}
