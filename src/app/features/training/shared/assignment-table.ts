import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { roleNameKey } from '../../../core/org/roles';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { assignmentBadge, isOpenAssignment } from '../data/training-display';
import { Assignment } from '../data/training.models';

/** A group of assignments under a heading (by course or by person). */
export interface AssignmentGroup {
  readonly key: string;
  readonly label: string;
  readonly items: readonly Assignment[];
}

/** Group a page of assignments by course or person, keeping the page order. */
export function groupAssignments(
  items: readonly Assignment[],
  by: 'course' | 'person' | '',
): AssignmentGroup[] {
  if (!by) {
    return [{ key: '', label: '', items }];
  }
  const groups = new Map<string, { label: string; items: Assignment[] }>();
  for (const a of items) {
    const key = by === 'course' ? a.course.id : a.user.id;
    const label = by === 'course' ? `${a.course.code} · ${a.course.title}` : a.user.name;
    const group = groups.get(key) ?? { label, items: [] };
    group.items.push(a);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, g]) => ({ key, label: g.label, items: g.items }));
}

/**
 * Training assignments as a table on wide screens and stacked cards on phones
 * (course, person, status, why it was assigned, due date). With `selectable`,
 * each open row gets a tick box for bulk actions.
 */
@Component({
  selector: 'app-training-assignment-table',
  imports: [RouterLink, TranslocoPipe, LocalDayPipe, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="hidden overflow-x-auto rounded-card border border-border bg-surface md:block"
      data-testid="assignment-table"
    >
      <table class="w-full text-left text-ui">
        <caption class="sr-only">
          {{
            captionKey() | transloco
          }}
        </caption>
        <thead class="border-b border-border text-meta text-fg-muted">
          <tr>
            @if (selectable()) {
              <th scope="col" class="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-accent"
                  [checked]="allSelected()"
                  [indeterminate]="someSelected()"
                  [attr.aria-label]="'training.assignments.selectPage' | transloco"
                  (change)="toggledAll.emit($any($event.target).checked)"
                />
              </th>
            }
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
          </tr>
        </thead>
        <tbody>
          @for (a of assignments(); track a.id) {
            @let badge = badgeOf(a);
            <tr class="border-b border-border last:border-0 hover:bg-surface-2">
              @if (selectable()) {
                <td class="px-3 py-2.5">
                  @if (canSelect(a)) {
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-accent"
                      [checked]="selected().has(a.id)"
                      [attr.aria-label]="
                        'training.assignments.selectOne'
                          | transloco: { course: a.course.title, person: a.user.name }
                      "
                      (change)="toggled.emit(a.id)"
                    />
                  }
                </td>
              }
              @if (showCourse()) {
                <td class="px-4 py-2.5">
                  <a
                    [routerLink]="['/training/assignments', a.id]"
                    class="font-semibold text-fg hover:text-accent hover:underline"
                  >
                    <span class="font-mono text-meta text-fg-subtle">{{ a.course.code }}</span>
                    {{ a.course.title }}
                  </a>
                </td>
              }
              @if (showUser()) {
                <td class="px-4 py-2.5">
                  @if (showCourse()) {
                    <a
                      [routerLink]="['/training/people', a.user.id]"
                      class="text-fg hover:text-accent hover:underline"
                      >{{ a.user.name }}</a
                    >
                  } @else {
                    <a
                      [routerLink]="['/training/assignments', a.id]"
                      class="font-semibold text-fg hover:text-accent hover:underline"
                      >{{ a.user.name }}</a
                    >
                  }
                </td>
              }
              <td class="px-4 py-2.5">
                <app-status-badge
                  [meaning]="badge.meaning"
                  [value]="badge.value"
                  [labelKey]="badge.labelKey"
                />
              </td>
              <td class="px-4 py-2.5 text-fg-muted">{{ reasonText(a) }}</td>
              <td
                class="px-4 py-2.5 whitespace-nowrap"
                [class.font-semibold]="a.overdue && open(a)"
                [class.text-warn-ink]="a.overdue && open(a)"
                [class.text-fg-muted]="!(a.overdue && open(a))"
              >
                {{ a.due_at ? (a.due_at | localDay) : ('training.common.noDue' | transloco) }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <ul class="flex flex-col gap-2 md:hidden" data-testid="assignment-cards">
      @for (a of assignments(); track a.id) {
        @let badge = badgeOf(a);
        <li class="flex gap-3 rounded-card border border-border bg-surface px-4 py-3">
          @if (selectable() && canSelect(a)) {
            <input
              type="checkbox"
              class="mt-1 h-5 w-5 flex-none accent-accent"
              [checked]="selected().has(a.id)"
              [attr.aria-label]="
                'training.assignments.selectOne'
                  | transloco: { course: a.course.title, person: a.user.name }
              "
              (change)="toggled.emit(a.id)"
            />
          }
          <div class="min-w-0 flex-1">
            <a
              [routerLink]="['/training/assignments', a.id]"
              class="block text-body font-semibold text-fg hover:text-accent"
            >
              @if (showCourse()) {
                <span class="font-mono text-meta text-fg-subtle">{{ a.course.code }}</span>
                {{ a.course.title }}
              } @else {
                {{ a.user.name }}
              }
            </a>
            @if (showCourse() && showUser()) {
              <p class="text-meta text-fg-muted">{{ a.user.name }}</p>
            }
            <div class="mt-1.5 flex flex-wrap items-center gap-2 text-meta">
              <app-status-badge
                [meaning]="badge.meaning"
                [value]="badge.value"
                [labelKey]="badge.labelKey"
              />
              <span
                [class.font-semibold]="a.overdue && open(a)"
                [class.text-warn-ink]="a.overdue && open(a)"
                [class.text-fg-muted]="!(a.overdue && open(a))"
              >
                {{ 'training.fields.due' | transloco }}:
                {{ a.due_at ? (a.due_at | localDay) : ('training.common.noDue' | transloco) }}
              </span>
            </div>
            <p class="mt-1 text-meta text-fg-muted">{{ reasonText(a) }}</p>
          </div>
        </li>
      }
    </ul>
  `,
})
export class AssignmentTable {
  private readonly language = inject(LanguageService);

  readonly assignments = input.required<readonly Assignment[]>();
  readonly showCourse = input(true);
  readonly showUser = input(true);
  readonly captionKey = input('training.assignments.title');
  /** Show tick boxes on open rows the caller may manage. */
  readonly selectable = input(false);
  readonly selected = input<ReadonlySet<string>>(new Set());
  readonly toggled = output<string>();
  readonly toggledAll = output<boolean>();

  protected readonly badgeOf = assignmentBadge;
  protected readonly open = isOpenAssignment;

  private readonly selectableRows = computed(() =>
    this.assignments().filter((a) => this.canSelect(a)),
  );
  protected readonly allSelected = computed(() => {
    const rows = this.selectableRows();
    return rows.length > 0 && rows.every((a) => this.selected().has(a.id));
  });
  protected readonly someSelected = computed(
    () => !this.allSelected() && this.selectableRows().some((a) => this.selected().has(a.id)),
  );

  protected canSelect(a: Assignment): boolean {
    return a.can_manage && isOpenAssignment(a);
  }

  /** "Regel: Avdeling Drift" / "Tildelt av Kari Nordmann" / "Ny revisjon av dokumentet". */
  protected reasonText(a: Assignment): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    if (a.reason === 'rule' && a.rule) {
      const kind = t(`training.ruleTarget.${a.rule.target_type}`);
      const value =
        a.rule.target_type === 'role' && a.rule.target_value
          ? t(roleNameKey(a.rule.target_value))
          : a.rule.target_label;
      return t('training.reasonText.rule', { target: value ? `${kind}: ${value}` : kind });
    }
    if (a.reason === 'manual' && a.assigned_by) {
      return t('training.reasonText.manualBy', { name: a.assigned_by.name });
    }
    return t(`training.reason.${a.reason}`);
  }
}
