import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { PeopleApi } from '../data/people-api';
import { addMonthsIso, hasPerm, textOrNull, todayIso } from '../data/people-display';
import { peopleErrorKey } from '../data/people-errors';
import { PeopleLookups } from '../data/people-lookups';
import { CourseOption, GapAction, GapActionKind } from '../data/people.models';
import { PeopleField } from './people-field';

/** The gap to act on: one person and one competence. */
export interface GapTarget {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly competenceId: string;
  readonly competenceName: string;
  /** Whether the person has a user account (training and tasks reach users). */
  readonly hasUser: boolean;
  /** The kind to start on. */
  readonly kind?: GapActionKind;
}

/** The kinds offered in the dialog, in this order. */
export const GAP_DIALOG_KINDS: readonly GapActionKind[] = ['training', 'task', 'assessment'];

/** Whether a "close the gap" draft can be saved. */
export function gapDraftValid(kind: GapActionKind, courseId: string, hasUser: boolean): boolean {
  if (kind === 'training') {
    return hasUser && !!courseId;
  }
  return true;
}

/**
 * "Lukk gapet" (HS 7.2 c): plan what closes a competence gap — assign a course in
 * Training, create a task, or plan a new assessment — with an owner and a due date.
 * The action stays open on the gap until a new assessment at the required level
 * marks it as effective (or someone evaluates it).
 */
@Component({
  selector: 'app-people-gap-action-dialog',
  imports: [TranslocoPipe, ConfirmDialog, PeopleField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-confirm-dialog
      [open]="target() !== null"
      [title]="'people.gapActions.title' | transloco"
      [message]="
        'people.gapActions.message'
          | transloco
            : {
                name: target()?.employeeName ?? '',
                competence: target()?.competenceName ?? '',
              }
      "
      [confirmLabel]="'people.gapActions.save.' + kind() | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy()"
      [confirmDisabled]="!valid()"
      initialFocus="#cf-gap-kind-training"
      (confirmed)="save()"
      (cancelled)="closed.emit()"
    >
      @if (target(); as t) {
        <div class="mt-4 flex flex-col gap-3">
          <fieldset>
            <legend class="mb-1.5 text-ui font-semibold text-fg-muted">
              {{ 'people.gapActions.kindLabel' | transloco }}
            </legend>
            <div class="flex flex-col gap-1.5">
              @for (k of kinds; track k) {
                <label
                  class="flex cursor-pointer items-start gap-2 rounded-tile border border-border px-3 py-2 text-ui"
                  [class.border-accent]="kind() === k"
                  [class.bg-accent-soft]="kind() === k"
                >
                  <input
                    type="radio"
                    name="cf-gap-kind"
                    class="mt-0.5 accent-[var(--accent)]"
                    [id]="'cf-gap-kind-' + k"
                    [value]="k"
                    [checked]="kind() === k"
                    (change)="kind.set(k)"
                    [attr.data-testid]="'gap-kind-' + k"
                  />
                  <span>
                    <span class="block font-semibold text-fg">{{
                      'people.gapActions.kinds.' + k | transloco
                    }}</span>
                    <span class="block text-meta text-fg-muted">{{
                      'people.gapActions.kindHints.' + k | transloco
                    }}</span>
                  </span>
                </label>
              }
            </div>
          </fieldset>

          @if (kind() === 'training') {
            @if (!t.hasUser) {
              <p class="rounded-tile bg-warn-soft px-3 py-2 text-meta text-warn-ink" role="note">
                {{ 'people.gapActions.needsUser' | transloco }}
              </p>
            } @else if (!canAssign()) {
              <p class="rounded-tile bg-warn-soft px-3 py-2 text-meta text-warn-ink" role="note">
                {{ 'people.errors.training_assign_required' | transloco }}
              </p>
            } @else {
              <app-people-field
                labelKey="people.gapActions.course"
                inputId="cf-gap-course"
                [required]="true"
                [hintKey]="courses().length ? null : 'people.gapActions.noCourses'"
              >
                <select
                  id="cf-gap-course"
                  (change)="courseId.set($any($event.target).value)"
                  data-testid="gap-course"
                >
                  <option value="" [selected]="!courseId()">
                    {{ 'people.common.choose' | transloco }}
                  </option>
                  @for (c of courses(); track c.id) {
                    <option [value]="c.id" [selected]="courseId() === c.id">
                      {{ c.code }} {{ c.title }}
                    </option>
                  }
                </select>
              </app-people-field>
            }
          } @else {
            <app-people-field labelKey="people.gapActions.assignee" inputId="cf-gap-assignee">
              <select
                id="cf-gap-assignee"
                (change)="assigneeId.set($any($event.target).value)"
                data-testid="gap-assignee"
              >
                @for (u of lookups.users(); track u.id) {
                  <option [value]="u.id" [selected]="assigneeId() === u.id">{{ u.label }}</option>
                }
              </select>
            </app-people-field>
          }

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <app-people-field labelKey="people.fields.dueDate" inputId="cf-gap-due">
              <input
                id="cf-gap-due"
                type="date"
                [value]="dueDate()"
                (change)="dueDate.set($any($event.target).value)"
              />
            </app-people-field>
            <app-people-field labelKey="people.gapActions.owner" inputId="cf-gap-owner">
              <select id="cf-gap-owner" (change)="ownerId.set($any($event.target).value)">
                @for (u of lookups.users(); track u.id) {
                  <option [value]="u.id" [selected]="ownerId() === u.id">{{ u.label }}</option>
                }
              </select>
            </app-people-field>
          </div>
          <app-people-field labelKey="people.gapActions.description" inputId="cf-gap-desc">
            <textarea
              id="cf-gap-desc"
              rows="2"
              maxlength="5000"
              [placeholder]="'people.gapActions.descriptionPlaceholder' | transloco"
              [value]="description()"
              (input)="description.set($any($event.target).value)"
            ></textarea>
          </app-people-field>
          <p class="text-meta text-fg-muted">{{ 'people.gapActions.effectHint' | transloco }}</p>
        </div>
      }
    </app-confirm-dialog>
  `,
})
export class GapActionDialog {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  protected readonly lookups = inject(PeopleLookups);

  readonly target = input<GapTarget | null>(null);
  readonly created = output<GapAction>();
  readonly closed = output<void>();

  protected readonly kinds = GAP_DIALOG_KINDS;
  protected readonly kind = signal<GapActionKind>('training');
  protected readonly courseId = signal('');
  protected readonly assigneeId = signal('');
  protected readonly ownerId = signal('');
  protected readonly dueDate = signal('');
  protected readonly description = signal('');
  protected readonly courses = signal<readonly CourseOption[]>([]);
  protected readonly busy = signal(false);

  protected readonly canAssign = computed(() => {
    const perms = this.selectedOrg.currentOrg()?.permissions;
    return (
      hasPerm(perms, 'training:assign') ||
      hasPerm(perms, 'training:manage') ||
      hasPerm(perms, 'training:report')
    );
  });

  protected readonly valid = computed(() => {
    const t = this.target();
    if (!t) {
      return false;
    }
    if (this.kind() === 'training' && !this.canAssign()) {
      return false;
    }
    return gapDraftValid(this.kind(), this.courseId(), t.hasUser);
  });

  constructor() {
    effect(() => {
      const target = this.target();
      untracked(() => {
        if (!target) {
          return;
        }
        this.lookups.ensureLoaded();
        const me = this.auth.user()?.id ?? '';
        this.kind.set(target.kind ?? (target.hasUser ? 'training' : 'task'));
        this.courseId.set('');
        this.assigneeId.set(me);
        this.ownerId.set(me);
        this.dueDate.set(addMonthsIso(todayIso(), 1));
        this.description.set('');
        this.loadCourses();
      });
    });
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const t = this.target();
    if (!orgId || !t || !this.valid() || this.busy()) {
      return;
    }
    const kind = this.kind();
    this.busy.set(true);
    this.api
      .createGapAction(orgId, {
        employee_id: t.employeeId,
        competence_id: t.competenceId,
        kind,
        description: textOrNull(this.description()),
        due_date: this.dueDate() || null,
        owner_user_id: this.ownerId() || null,
        course_id: kind === 'training' ? this.courseId() || null : null,
        assignee_user_id: kind === 'training' ? null : this.assigneeId() || null,
      })
      .subscribe({
        next: (action) => {
          this.busy.set(false);
          this.notifications.success(`people.notices.gapAction.${kind}`, {
            name: t.employeeName,
          });
          this.created.emit(action);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(peopleErrorKey(error));
        },
      });
  }

  private loadCourses(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.courses().length) {
      return;
    }
    this.api.courses(orgId).subscribe({
      next: (page) => this.courses.set(page.items),
      error: () => this.courses.set([]),
    });
  }
}
