import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  assignmentTone,
  fromDateInput,
  toDateInput,
  trainingErrorKey,
} from '../data/training-display';
import { Assignment } from '../data/training.models';
import { TrainingNav } from '../training-nav';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments'];

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
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    RecordDetailLayout,
    WatchButton,
    GuideIntro,
    WhyItMatters,
    TrainingNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-nav />
    @if (assignment(); as a) {
      <app-record-detail-layout
        entityType="training_assignment"
        [entityId]="a.id"
        [tabs]="tabs"
        [canEdit]="a.can_manage"
        [includeAudit]="access.canSeeAudit()"
        backLink="/training/assignments"
        backLabelKey="training.assignments.back"
      >
        <div header>
          <div class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
            <span class="font-mono">{{ a.course.code }}</span>
            <app-badge [tone]="tone(a)">
              {{
                (open(a) && a.overdue
                  ? 'training.assignmentStatus.overdue'
                  : 'training.assignmentStatus.' + a.status
                ) | transloco
              }}
            </app-badge>
            <span>{{ 'training.reason.' + a.reason | transloco }}</span>
          </div>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{
              'training.assignmentDetail.title'
                | transloco: { course: a.course.title, person: a.user.name }
            }}
          </h1>
        </div>

        <ng-container actions>
          <app-watch-button entityType="training_assignment" [entityId]="a.id" />
          @if (open(a) && a.course.kind !== 'external' && isMine(a)) {
            <a [routerLink]="['/training/courses', a.course.id, 'learn']">
              <app-button>{{ 'training.home.start' | transloco }}</app-button>
            </a>
          }
          @if (a.record_id) {
            <a [routerLink]="['/training/records', a.record_id]">
              <app-button variant="secondary">{{
                'training.home.viewRecord' | transloco
              }}</app-button>
            </a>
          }
          @if (open(a) && a.can_manage) {
            <app-button variant="ghost" (click)="cancelOpen.set(true)">
              {{ 'training.assignmentDetail.cancel' | transloco }}
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-5">
          <app-guide-intro scope="training" page="assignment" />
          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.course' | transloco }}</dt>
              <dd>
                <a
                  [routerLink]="['/training/courses', a.course.id]"
                  class="font-medium text-accent hover:underline"
                >
                  {{ a.course.title }}
                </a>
              </dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.person' | transloco }}</dt>
              <dd class="font-medium text-fg">{{ a.user.name }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.due' | transloco }}</dt>
              <dd class="font-medium" [class.text-fail]="a.overdue" [class.text-fg]="!a.overdue">
                {{ a.due_at ? (a.due_at | localDay) : ('training.common.none' | transloco) }}
              </dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.assignedBy' | transloco }}</dt>
              <dd class="font-medium text-fg">
                {{ a.assigned_by?.name ?? ('training.reason.' + a.reason | transloco) }}
              </dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.assignedAt' | transloco }}</dt>
              <dd class="font-medium text-fg">{{ a.created_at | localDate }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.started' | transloco }}</dt>
              <dd class="font-medium text-fg">
                {{
                  a.started_at ? (a.started_at | localDate) : ('training.common.none' | transloco)
                }}
              </dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.attempts' | transloco }}</dt>
              <dd class="font-medium text-fg">{{ a.attempts }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.lastScore' | transloco }}</dt>
              <dd class="font-medium text-fg">
                {{
                  a.last_score !== null
                    ? ('training.stats.pct' | transloco: { value: a.last_score })
                    : ('training.common.none' | transloco)
                }}
              </dd>
            </div>
            @if (a.completed_at) {
              <div>
                <dt class="text-fg-muted">{{ 'training.fields.completed' | transloco }}</dt>
                <dd class="font-medium text-fg">{{ a.completed_at | localDate }}</dd>
              </div>
            }
            @if (a.cancelled_at) {
              <div>
                <dt class="text-fg-muted">{{ 'training.fields.cancelled' | transloco }}</dt>
                <dd class="font-medium text-fg">{{ a.cancelled_at | localDate }}</dd>
              </div>
            }
          </dl>

          @if (open(a) && a.can_manage) {
            <app-card>
              <form
                class="flex flex-wrap items-end gap-3"
                (submit)="$event.preventDefault(); saveDue()"
              >
                <app-form-field
                  [label]="'training.assignmentDetail.changeDue' | transloco"
                  inputId="assignment-due"
                >
                  <input id="assignment-due" name="due" type="date" [(ngModel)]="dueDate" />
                </app-form-field>
                <app-button type="submit" variant="secondary" [loading]="busy()">
                  {{ 'training.common.save' | transloco }}
                </app-button>
              </form>
            </app-card>
          }
        </div>

        <ng-container aside>
          <app-why-it-matters scope="training" page="assignment" />
        </ng-container>
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
        <app-alert>{{ 'training.errors.notFound' | transloco }}</app-alert>
      </div>
    } @else {
      <p
        class="mx-auto max-w-[1180px] px-4 py-10 text-[13.5px] text-fg-muted sm:px-8"
        role="status"
      >
        {{ 'training.common.loading' | transloco }}
      </p>
    }
  `,
})
export class AssignmentDetail {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  protected readonly access = inject(TrainingAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly assignment = signal<Assignment | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cancelOpen = signal(false);
  protected dueDate = '';

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

  protected open(a: Assignment): boolean {
    return a.status === 'assigned' || a.status === 'in_progress';
  }

  protected isMine(a: Assignment): boolean {
    return a.user.id === this.auth.user()?.id;
  }

  protected tone(a: Assignment) {
    return assignmentTone(a.status, a.overdue);
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
