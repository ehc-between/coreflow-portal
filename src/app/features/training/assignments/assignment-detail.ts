import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
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
import { AskPanelService } from '../../ask/ask-panel.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip, EntityChipRef } from '../../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
} from '../../../shared/kit/record-sections';
import {
  LocalDatePipe,
  LocalDayPipe,
  formatLocalDate,
  formatLocalDay,
} from '../../../shared/locale/locale-pipes';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
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
import { assignmentMissing, assignmentStatusSentence } from '../data/training-anatomy';
import { Assignment } from '../data/training.models';

const TABS: readonly RecordTab[] = ['details', 'tasks', 'related', 'activity', 'comments'];

/** Whether a reminder was sent within the last 20 hours (the backend refuses another). */
export function remindedRecently(a: Pick<Assignment, 'reminded_at'>, now = new Date()): boolean {
  const days = daysUntil(a.reminded_at ?? null, now);
  return days !== null && days > -20 / 24;
}

/**
 * `/training/assignments/:id`: one person's assignment to a course, on the
 * detail-page anatomy (docs/ux-guide.md §2.7). "Hovedinformasjon" says where it
 * stands (status sentence), who, which course (linked), the due date (changed in
 * place) and why it was assigned; the Details tab shows the progress; the
 * "Oppfølging" card lists what to do (remind, set a due date), the requirements,
 * the connections and when / by whom it was assigned.
 */
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
    ConfirmDialog,
    EntityChip,
    EntityTasks,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    StatusBadge,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (assignment(); as a) {
      @let badge = badgeOf(a);
      @let sentence = statusSentence();
      <app-record-detail-layout
        [anatomy]="true"
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
        [missing]="missing()"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono">{{ a.course.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'training.assignmentDetail.type' | transloco }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            [meaning]="badge.meaning"
            [value]="badge.value"
            [labelKey]="badge.labelKey"
          />
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
          <ng-container ngProjectAs="[overflow]">
            <button appMenuItem overflow type="button" (click)="openDue()">
              {{ 'training.assignmentDetail.changeDue' | transloco }}
            </button>
            <button
              appMenuItem
              overflow
              type="button"
              [danger]="true"
              (click)="cancelOpen.set(true)"
            >
              {{ 'training.assignmentDetail.cancel' | transloco }}
            </button>
          </ng-container>
        }

        @if (open(a) && a.can_manage) {
          <button appMenuItem ask type="button" (click)="askAi()">
            <app-icon name="spark" [size]="15" />
            {{ 'training.ask.dueDate' | transloco }}
          </button>
        }

        <app-module-nav nav [items]="access.navItems()" labelKey="training.nav.label" />
        <app-help-strip help scope="training" page="assignment" />

        <app-record-lead record-lead>
          <app-record-status-line status [tone]="sentence.tone">
            {{ sentence.key | transloco: sentence.params }}
          </app-record-status-line>
          <app-field-item size="lead" labelKey="training.assignmentDetail.lead.person">
            <a
              [routerLink]="['/training/people', a.user.id]"
              class="inline-flex items-center gap-2 font-semibold text-fg hover:text-accent hover:underline"
              data-testid="assignment-person"
            >
              <app-icon name="people" [size]="16" class="text-fg-muted" />
              {{ a.user.name }}
            </a>
          </app-field-item>
          <app-field-item size="lead" labelKey="training.assignmentDetail.lead.course">
            <app-entity-chip [ref]="courseRef()" data-testid="assignment-course" />
          </app-field-item>
          <app-field-item
            size="lead"
            labelKey="training.fields.due"
            [keepEmpty]="true"
            emptyKey="training.common.noDue"
          >
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
            }
            @if (open(a) && a.can_manage && !dueOpen()) {
              <button
                type="button"
                class="ml-2 text-meta font-semibold text-accent hover:underline"
                (click)="openDue()"
                data-testid="assignment-change-due"
              >
                {{ 'training.assignmentDetail.changeDueShort' | transloco }}
              </button>
            }
          </app-field-item>
          <app-field-item size="lead" labelKey="training.assignmentDetail.lead.why">
            <span data-testid="assignment-rule">{{ whyText() }}</span>
            @if (a.rule && !a.rule.deleted) {
              <a
                [routerLink]="['/training/courses', a.course.id]"
                fragment="course-rules"
                class="ml-1 text-meta font-semibold text-accent hover:underline"
                >{{ 'training.assignmentDetail.openRules' | transloco }}</a
              >
            }
          </app-field-item>
        </app-record-lead>

        <div class="flex flex-col gap-6">
          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }

          @if (dueOpen() && open(a) && a.can_manage) {
            <form
              id="assignment-due-form"
              class="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4"
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
              <app-button type="submit" variant="primary" [loading]="busy()">
                {{ 'training.assignmentDetail.saveDue' | transloco }}
              </app-button>
              <app-button type="button" variant="ghost" (click)="dueOpen.set(false)">
                {{ 'training.common.cancel' | transloco }}
              </app-button>
            </form>
          }

          @if (hasProgress()) {
            <app-record-details [columns]="3" titleKey="training.assignmentDetail.progressTitle">
              @if (a.started_at) {
                <app-field-item
                  labelKey="training.fields.started"
                  [value]="a.started_at | localDate"
                />
              }
              @if (a.attempts) {
                <app-field-item
                  labelKey="training.assignmentDetail.attempts"
                  [value]="a.attempts"
                />
              }
              @if (a.last_score !== null) {
                <app-field-item
                  labelKey="training.fields.lastScore"
                  [value]="'training.stats.pct' | transloco: { value: a.last_score }"
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
              @if (a.reminded_at) {
                <app-field-item
                  labelKey="training.fields.remindedAt"
                  [value]="a.reminded_at | localDate"
                />
              }
            </app-record-details>
          } @else {
            <p class="text-ui text-fg-muted" data-testid="assignment-no-progress">
              {{ 'training.assignmentDetail.noProgress' | transloco: { person: a.user.name } }}
            </p>
          }
        </div>

        <app-entity-tasks
          tasks
          entityType="training_assignment"
          [entityId]="a.id"
          [canCreate]="access.canWriteTasks() && a.can_manage"
          [entityLabel]="a.course.code + ' · ' + a.user.name"
        />

        <app-record-meta follow-up-meta>
          <app-field-item
            layout="inline"
            labelKey="training.fields.assignedAt"
            [value]="a.created_at | localDate: 'mediumDate'"
          />
          <app-field-item
            layout="inline"
            labelKey="training.fields.assignedBy"
            [value]="a.assigned_by?.name"
          />
        </app-record-meta>

        <div aside-learn>
          <app-why-it-matters scope="training" page="assignment" />
        </div>
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
  private readonly injector = inject(Injector);
  private readonly ask = inject(AskPanelService);
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
  /** The due-date editor is open. */
  protected readonly dueOpen = signal(false);
  protected dueDate = '';

  protected readonly statusSentence = computed(() => {
    const a = this.assignment();
    const locale = this.language.locale();
    return a
      ? assignmentStatusSentence(a, {
          day: (v) => formatLocalDay(v, 'mediumDate', locale),
          date: (v) => formatLocalDate(v, 'mediumDate', locale),
        })
      : { key: '', tone: 'neutral' as const };
  });

  /** The course as a linked chip (type · code · title · status). */
  protected readonly courseRef = computed<EntityChipRef>(() => {
    const c = this.assignment()?.course;
    return {
      entity_type: 'course',
      entity_id: c?.id ?? '',
      code: c?.code,
      title: c?.title ?? '',
      url: c ? `/training/courses/${c.id}` : null,
      status: c?.status,
    };
  });

  /** Why it was assigned: the rule ("Avdeling: Drift"), a person, or the event that did. */
  protected readonly whyText = computed(() => {
    const a = this.assignment();
    if (!a) {
      return '';
    }
    if (a.rule) {
      return this.language.translate(
        a.rule.deleted
          ? 'training.assignmentDetail.ruleDeleted'
          : 'training.assignmentDetail.ruleText',
        { target: this.ruleTarget(), days: a.rule.due_days },
      );
    }
    if (a.reason === 'manual' && a.assigned_by) {
      return this.language.translate('training.reasonText.manualBy', { name: a.assigned_by.name });
    }
    return this.language.translate(`training.reasonLong.${a.reason}`);
  });

  protected readonly hasProgress = computed(() => {
    const a = this.assignment();
    return (
      !!a && !!(a.started_at || a.attempts || a.completed_at || a.cancelled_at || a.reminded_at)
    );
  });

  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const a = this.assignment();
    if (!a) {
      return [];
    }
    return assignmentMissing(a, {
      remind: !this.isMine(a) && !remindedRecently(a) ? () => this.remind() : null,
      setDue: () => this.openDue(),
    });
  });

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

  protected openDue(): void {
    this.dueDate = toDateInput(this.assignment()?.due_at ?? null);
    this.dueOpen.set(true);
    afterNextRender(() => document.getElementById('assignment-due')?.focus(), {
      injector: this.injector,
    });
  }

  protected askAi(): void {
    this.ask.askAbout(this.language.translate('training.ask.dueDate'));
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
        this.dueOpen.set(false);
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
