import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { roleNameKey } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  assignmentBadge,
  daysUntil,
  fromDateInput,
  isOpenAssignment,
  toDateInput,
  trainingErrorCode,
  trainingErrorKey,
} from '../data/training-display';
import { Assignment } from '../data/training.models';

const TABS: readonly RecordTab[] = ['details', 'tasks', 'related', 'activity', 'comments'];

/** Whether a reminder was sent within the last 20 hours (the backend refuses another). */
export function remindedRecently(a: Pick<Assignment, 'reminded_at'>, now = new Date()): boolean {
  const days = daysUntil(a.reminded_at ?? null, now);
  return days !== null && days > -20 / 24;
}

/** `/training/assignments/:id`: one person's assignment to a course. */
@Component({
  selector: 'app-assignment-detail',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    EntityTasks,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    LoadingState,
    MenuItem,
    ModuleNav,
    RecordDetailLayout,
    StatusBadge,
    WatchButton,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (assignment(); as a) {
      @let badge = badgeOf(a);
      <app-record-detail-layout
        entityType="training_assignment"
        [entityId]="a.id"
        [title]="
          'training.assignmentDetail.title'
            | transloco: { course: a.course.title, person: a.user.name }
        "
        [breadcrumbs]="[
          { labelKey: 'modules.names.training', link: '/training' },
          { labelKey: 'training.assignments.title', link: '/training/assignments' },
          { label: a.course.code + ' · ' + a.user.name },
        ]"
        [tabs]="tabs"
        [requirementsPanel]="true"
        [canEdit]="a.can_manage"
        [includeAudit]="access.canSeeAudit()"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono">{{ a.course.code }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            [meaning]="badge.meaning"
            [value]="badge.value"
            [labelKey]="badge.labelKey"
          />
          <span aria-hidden="true">·</span>
          <span>{{ 'training.reason.' + a.reason | transloco }}</span>
          <app-watch-button entityType="training_assignment" [entityId]="a.id" />
        </ng-container>

        @if (open(a) && a.course.kind !== 'external' && isMine(a)) {
          <app-button
            primary
            (click)="router.navigate(['/training/courses', a.course.id, 'learn'])"
          >
            {{ (a.started_at ? 'training.home.continue' : 'training.home.start') | transloco }}
          </app-button>
        } @else if (a.record_id) {
          <app-button primary (click)="router.navigate(['/training/records', a.record_id])">
            {{ 'training.home.viewRecord' | transloco }}
          </app-button>
        }
        @if (open(a) && a.can_manage && !isMine(a)) {
          <app-button
            secondary
            variant="secondary"
            [loading]="reminding()"
            [disabled]="recent(a)"
            [title]="recent(a) ? ('training.assignmentDetail.remindedRecently' | transloco) : ''"
            (click)="remind()"
            data-testid="assignment-remind"
          >
            {{ 'training.assignmentDetail.remind' | transloco }}
          </app-button>
        }
        @if (open(a) && a.can_manage) {
          <button appMenuItem overflow type="button" [danger]="true" (click)="cancelOpen.set(true)">
            {{ 'training.assignmentDetail.cancel' | transloco }}
          </button>
        }

        <app-module-nav nav [items]="access.navItems()" labelKey="training.nav.label" />
        <app-help-strip help scope="training" page="assignment" />

        <div class="flex flex-col gap-6">
          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <app-field-list [columns]="3">
            <app-field-item labelKey="training.fields.course">
              <a
                [routerLink]="['/training/courses', a.course.id]"
                class="font-medium text-accent hover:underline"
              >
                {{ a.course.code }} · {{ a.course.title }}
              </a>
            </app-field-item>
            <app-field-item labelKey="training.fields.person">
              <a
                [routerLink]="['/training/people', a.user.id]"
                class="font-medium text-accent hover:underline"
                >{{ a.user.name }}</a
              >
            </app-field-item>
            <app-field-item labelKey="training.fields.due">
              @if (a.due_at) {
                <span
                  [class.font-semibold]="a.overdue && open(a)"
                  [class.text-warn-ink]="a.overdue && open(a)"
                >
                  {{ a.due_at | localDay }}
                  @if (a.overdue && open(a)) {
                    · {{ 'training.assignmentStatus.overdue' | transloco }}
                  }
                </span>
              } @else {
                <span class="text-fg-subtle">{{ 'training.common.noDue' | transloco }}</span>
              }
            </app-field-item>
            <app-field-item labelKey="training.fields.assignedBy" [value]="assignedByText()" />
            <app-field-item
              labelKey="training.fields.assignedAt"
              [value]="a.created_at | localDate"
            />
            <app-field-item labelKey="training.fields.started">
              @if (a.started_at) {
                {{ a.started_at | localDate }}
              } @else {
                <span class="text-fg-subtle">{{
                  'training.assignmentDetail.notStarted' | transloco
                }}</span>
              }
            </app-field-item>
            <app-field-item labelKey="training.fields.attempts" [value]="a.attempts" />
            <app-field-item labelKey="training.fields.lastScore">
              @if (a.last_score !== null) {
                {{ 'training.stats.pct' | transloco: { value: a.last_score } }}
              } @else {
                <span class="text-fg-subtle">{{
                  'training.assignmentDetail.noAttempts' | transloco
                }}</span>
              }
            </app-field-item>
            @if (a.reminded_at) {
              <app-field-item
                labelKey="training.fields.remindedAt"
                [value]="a.reminded_at | localDate"
              />
            }
            @if (a.completed_at) {
              <app-field-item
                labelKey="training.fields.completed"
                [value]="a.completed_at | localDate"
              />
            }
            @if (a.cancelled_at) {
              <app-field-item
                labelKey="training.fields.cancelled"
                [value]="a.cancelled_at | localDate"
              />
            }
          </app-field-list>

          @if (a.rule; as rule) {
            <div
              class="rounded-tile border border-border bg-surface px-4 py-3 text-ui"
              data-testid="assignment-rule"
            >
              <p class="font-semibold text-fg">
                {{ 'training.assignmentDetail.whyTitle' | transloco }}
              </p>
              <p class="mt-0.5 text-fg-muted">
                {{
                  (rule.deleted
                    ? 'training.assignmentDetail.ruleDeleted'
                    : 'training.assignmentDetail.ruleText'
                  ) | transloco: { target: ruleTarget(), days: rule.due_days }
                }}
                @if (!rule.deleted) {
                  <a
                    [routerLink]="['/training/courses', a.course.id]"
                    class="ml-1 font-semibold text-accent hover:underline"
                    >{{ 'training.assignmentDetail.openRules' | transloco }}</a
                  >
                }
              </p>
            </div>
          }

          @if (open(a) && a.can_manage) {
            <app-card>
              <form
                class="flex flex-wrap items-end gap-3"
                (submit)="$event.preventDefault(); saveDue()"
              >
                <div class="flex flex-col gap-1.5">
                  <label for="assignment-due" class="text-ui font-semibold text-fg-muted">
                    {{ 'training.assignmentDetail.changeDue' | transloco }}
                  </label>
                  <input
                    id="assignment-due"
                    name="due"
                    type="date"
                    class="h-10 w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                    [(ngModel)]="dueDate"
                  />
                </div>
                <app-button type="submit" variant="secondary" [loading]="busy()">
                  {{ 'training.assignmentDetail.saveDue' | transloco }}
                </app-button>
              </form>
            </app-card>
          }
          <app-why-it-matters scope="training" page="assignment" />
        </div>

        <app-entity-tasks
          tasks
          entityType="training_assignment"
          [entityId]="a.id"
          [canCreate]="access.canWriteTasks() && a.can_manage"
          [entityLabel]="a.course.code + ' · ' + a.user.name"
        />
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="cancelOpen()"
        [title]="'training.assignmentDetail.cancelTitle' | transloco"
        [message]="'training.assignmentDetail.cancelMessage' | transloco: { person: a.user.name }"
        [confirmLabel]="'training.assignmentDetail.cancel' | transloco"
        [cancelLabel]="'training.common.back' | transloco"
        [busy]="busy()"
        (confirmed)="cancel()"
        (cancelled)="cancelOpen.set(false)"
      />
    } @else if (notFound()) {
      <div class="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
        <app-error-state
          titleKey="training.errors.notFoundTitle"
          bodyKey="training.errors.notFound"
          (retry)="reload()"
        />
      </div>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
        <app-loading-state [rows]="5" />
      </div>
    }
  `,
})
export class AssignmentDetail {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  protected readonly access = inject(TrainingAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly badgeOf = assignmentBadge;
  protected readonly open = isOpenAssignment;
  protected readonly recent = remindedRecently;
  protected readonly assignment = signal<Assignment | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly reminding = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cancelOpen = signal(false);
  protected dueDate = '';

  /** "Avdeling: Drift" / "Tilgangsrolle i CoreFlow: Revisor" for the rule. */
  protected readonly ruleTarget = computed(() => {
    const rule = this.assignment()?.rule;
    if (!rule) {
      return '';
    }
    const kind = this.language.translate(`training.ruleTarget.${rule.target_type}`);
    const value =
      rule.target_type === 'role' && rule.target_value
        ? this.language.translate(roleNameKey(rule.target_value))
        : rule.target_label;
    return value ? `${kind}: ${value}` : kind;
  });

  /** Who assigned it: a person, or the rule / new-hire / renewal that did. */
  protected readonly assignedByText = computed(() => {
    const a = this.assignment();
    if (!a) {
      return '';
    }
    if (a.assigned_by) {
      return a.assigned_by.name;
    }
    if (a.reason === 'rule' && a.rule) {
      return this.language.translate('training.reasonText.rule', { target: this.ruleTarget() });
    }
    return this.language.translate(`training.reason.${a.reason}`);
  });

  private sub = new Subscription();

  constructor() {
    providePageContext(() => {
      const a = this.assignment();
      return {
        module: TRAINING_MODULE,
        entityType: 'training_assignment',
        entityId: this.id(),
        view: 'detail',
        title: a ? `${a.course.code} ${a.course.title} · ${a.user.name}` : null,
      };
    });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected isMine(a: Assignment): boolean {
    return a.user.id === this.auth.user()?.id;
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected remind(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const a = this.assignment();
    if (!orgId || !a || this.reminding()) {
      return;
    }
    this.reminding.set(true);
    this.error.set(null);
    this.api.remindAssignment(orgId, a.id).subscribe({
      next: (updated) => {
        this.reminding.set(false);
        this.set(updated);
        this.notifications.success('training.assignmentDetail.reminded', { person: a.user.name });
      },
      error: (err: unknown) => {
        this.reminding.set(false);
        this.error.set(
          trainingErrorCode(err) === 'recently_reminded'
            ? 'training.assignmentDetail.remindedRecently'
            : trainingErrorKey(err),
        );
      },
    });
  }

  protected saveDue(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const a = this.assignment();
    if (!orgId || !a) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.updateAssignment(orgId, a.id, fromDateInput(this.dueDate, true)).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.set(updated);
        this.notifications.success('training.assignmentDetail.dueSaved');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  protected cancel(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const a = this.assignment();
    if (!orgId || !a) {
      return;
    }
    this.busy.set(true);
    this.api.cancelAssignment(orgId, a.id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.cancelOpen.set(false);
        this.set(updated);
        this.notifications.success('training.assignmentDetail.cancelled');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.cancelOpen.set(false);
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  private set(a: Assignment): void {
    this.assignment.set(a);
    this.dueDate = toDateInput(a.due_at);
  }

  private load(orgId: string | null, id: string): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    this.notFound.set(false);
    this.sub.add(
      this.api.getAssignment(orgId, id).subscribe({
        next: (a) => this.set(a),
        error: () => {
          this.assignment.set(null);
          this.notFound.set(true);
        },
      }),
    );
  }
}
