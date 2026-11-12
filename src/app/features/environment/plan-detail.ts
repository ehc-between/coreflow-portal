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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, map } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { RuleSummary } from '../../shared/tasks/rule-summary';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { EnvironmentApi } from './data/environment-api';
import {
  Drill,
  DrillCreate,
  ENTITY_PLAN,
  EmergencyPlan,
  PERM_MANAGE,
  PERM_RECORD,
  PERM_WRITE,
  ReviewIn,
} from './data/environment.models';
import { outcomeTone, statusTone } from './data/environment-display';
import { environmentErrorKey } from './data/environment-errors';
import { EnvDrillDialog } from './drill-dialog';
import { EnvLessonLink } from './lesson-link';
import { EnvReviewDialog } from './review-dialog';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

export const PLAN_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'environment.fields.code',
  title: 'environment.fields.title',
  scenario: 'environment.fields.scenario',
  potential_impact: 'environment.fields.potentialImpact',
  response_procedure: 'environment.fields.responseProcedure',
  resources: 'environment.fields.resources',
  contacts: 'environment.fields.contacts',
  site: 'environment.fields.site',
  status: 'environment.fields.status',
  owner_user_id: 'environment.fields.owner',
  department_id: 'environment.fields.department',
  drill_rrule: 'environment.fields.drillSchedule',
  review_due_at: 'environment.fields.reviewDue',
  last_reviewed_at: 'environment.fields.lastReviewed',
};

/**
 * An emergency preparedness and response plan
 * (`/environment/emergency-plans/:id`): the scenario, its potential impact, the
 * response procedure, resources and contacts; the drill schedule and the record
 * of drills held (`?drill=<id>` highlights one); drill tasks in the Tasks tab and
 * the shared record kit for related records, activity, comments and revisions.
 */
@Component({
  selector: 'app-env-plan-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    RuleSummary,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    EnvDrillDialog,
    EnvLessonLink,
    EnvReviewDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
          {{ 'environment.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          <a
            routerLink="/environment/emergency-plans"
            class="mt-4 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'environment.plans.back' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (plan(); as p) {
          <app-record-detail-layout
            [entityType]="entityType"
            [entityId]="p.id"
            [tabs]="tabs"
            [canEdit]="canWrite()"
            [fieldLabels]="fieldLabels"
            backLink="/environment/emergency-plans"
            backLabelKey="environment.plans.back"
          >
            <div header>
              <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
                <span class="font-mono font-semibold">{{ p.code }}</span>
                @if (p.site) {
                  <span>{{ p.site }}</span>
                }
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="plan-heading"
              >
                {{ p.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="tone(p.status)" data-testid="plan-status">{{
                  'environment.status.' + p.status | transloco
                }}</app-badge>
                @if (p.drill_overdue) {
                  <app-badge tone="fail" data-testid="plan-drill-overdue">
                    <app-icon name="alert" [size]="12" />
                    {{ 'environment.plan.drillOverdue' | transloco }}
                  </app-badge>
                }
                @if (p.review_overdue) {
                  <app-badge tone="fail">{{
                    'environment.common.reviewIsOverdue' | transloco
                  }}</app-badge>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button [entityType]="entityType" [entityId]="p.id" />
              <app-ask-about [prompt]="'environment.ask.summarisePlan' | transloco" />
              @if (canRecord()) {
                <app-button size="sm" (click)="recording.set(true)" data-testid="record-drill">
                  <app-icon name="plus" [size]="14" />
                  {{ 'environment.drill.record' | transloco }}
                </app-button>
              }
              @if (canWrite()) {
                <app-button
                  variant="secondary"
                  size="sm"
                  (click)="reviewing.set(true)"
                  data-testid="plan-review"
                >
                  <app-icon name="checkcircle" [size]="14" />
                  {{ 'environment.review.action' | transloco }}
                </app-button>
                <a
                  [routerLink]="['/environment/emergency-plans', p.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="plan-edit"
                >
                  {{ 'environment.common.edit' | transloco }}
                </a>
              }
              @if (canManage()) {
                <app-button variant="ghost" size="sm" (click)="deleting.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'environment.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-6">
              <app-guide-intro scope="environment" page="planDetail" />

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'environment.plan.sections.scenario' | transloco }}
                </h2>
                <dl class="flex flex-col gap-3 text-[13.5px]">
                  <div>
                    <dt class="text-[13px] text-fg-subtle">
                      {{ 'environment.fields.scenario' | transloco }}
                    </dt>
                    <dd class="whitespace-pre-line text-fg">
                      {{ p.scenario ?? ('environment.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[13px] text-fg-subtle">
                      {{ 'environment.fields.potentialImpact' | transloco }}
                    </dt>
                    <dd class="whitespace-pre-line text-fg">
                      {{ p.potential_impact ?? ('environment.common.none' | transloco) }}
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'environment.fields.responseProcedure' | transloco }}
                </h2>
                @if (p.response_procedure) {
                  <p class="text-[13.5px] whitespace-pre-line text-fg" data-testid="plan-procedure">
                    {{ p.response_procedure }}
                  </p>
                } @else {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'environment.plan.noProcedure' | transloco }}
                  </p>
                }
                @if (p.resources) {
                  <h3 class="mt-4 mb-1 text-[13px] font-semibold text-fg-subtle">
                    {{ 'environment.fields.resources' | transloco }}
                  </h3>
                  <p class="text-[13.5px] whitespace-pre-line text-fg">{{ p.resources }}</p>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'environment.fields.contacts' | transloco }}
                </h2>
                @if (p.contacts.length) {
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-[13px]" data-testid="plan-contacts">
                      <thead class="text-fg-subtle">
                        <tr>
                          <th scope="col" class="py-1 pr-3 font-semibold">
                            {{ 'environment.fields.contactName' | transloco }}
                          </th>
                          <th scope="col" class="py-1 pr-3 font-semibold">
                            {{ 'environment.fields.contactRole' | transloco }}
                          </th>
                          <th scope="col" class="py-1 pr-3 font-semibold">
                            {{ 'environment.fields.contactPhone' | transloco }}
                          </th>
                          <th scope="col" class="py-1 font-semibold">
                            {{ 'environment.fields.contactEmail' | transloco }}
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-border text-fg">
                        @for (c of p.contacts; track $index) {
                          <tr>
                            <td class="py-1.5 pr-3 font-semibold">{{ c.name }}</td>
                            <td class="py-1.5 pr-3">{{ c.role ?? '' }}</td>
                            <td class="py-1.5 pr-3">
                              @if (c.phone) {
                                <a [href]="'tel:' + c.phone" class="text-accent hover:underline">{{
                                  c.phone
                                }}</a>
                              }
                            </td>
                            <td class="py-1.5">
                              @if (c.email) {
                                <a
                                  [href]="'mailto:' + c.email"
                                  class="break-all text-accent hover:underline"
                                  >{{ c.email }}</a
                                >
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'environment.plan.noContacts' | transloco }}
                  </p>
                }
              </app-card>

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'environment.drill.listTitle' | transloco }}
                  </h2>
                  <app-ask-about
                    [prompt]="'environment.ask.drillLessons' | transloco"
                    field="drills"
                  />
                </div>
                @switch (drillsState()) {
                  @case ('loading') {
                    <p class="text-[13px] text-fg-muted" role="status">
                      {{ 'environment.common.loading' | transloco }}
                    </p>
                  }
                  @case ('error') {
                    <p class="text-[13px] text-fail" role="alert">
                      {{ 'environment.common.loadFailed' | transloco }}
                    </p>
                  }
                  @default {
                    @if (drills().length) {
                      <ul class="flex flex-col gap-3" data-testid="drill-rows">
                        @for (d of drills(); track d.id) {
                          <li
                            [id]="'drill-' + d.id"
                            class="rounded-tile border p-3"
                            [class.border-accent]="d.id === highlightDrill()"
                            [class.bg-accent-soft]="d.id === highlightDrill()"
                            [class.border-border]="d.id !== highlightDrill()"
                          >
                            <div class="flex flex-wrap items-center justify-between gap-2">
                              <div class="flex flex-wrap items-center gap-2 text-[13px]">
                                <span class="font-semibold text-fg">{{
                                  d.held_at | localDate: 'medium'
                                }}</span>
                                <span class="text-fg-subtle">{{
                                  'environment.drillKinds.' + d.kind | transloco
                                }}</span>
                                <app-badge [tone]="outcome(d.outcome)">{{
                                  'environment.outcomes.' + d.outcome | transloco
                                }}</app-badge>
                                @if (d.plan_revision_needed) {
                                  <app-badge tone="warn">{{
                                    'environment.drill.revisionNeeded' | transloco
                                  }}</app-badge>
                                }
                              </div>
                              @if (canManage()) {
                                <app-button
                                  variant="ghost"
                                  size="sm"
                                  [attr.aria-label]="'environment.drill.delete' | transloco"
                                  (click)="deletingDrill.set(d)"
                                >
                                  <app-icon name="trash" [size]="14" />
                                </app-button>
                              }
                            </div>
                            <p class="mt-1 text-[12px] text-fg-subtle">
                              @if (d.participants !== null) {
                                {{
                                  'environment.drill.participants'
                                    | transloco: { count: d.participants }
                                }}
                                ·
                              }
                              {{
                                'environment.drill.recordedBy'
                                  | transloco
                                    : {
                                        name:
                                          d.recorded_by_name ??
                                          ('environment.common.unknown' | transloco),
                                      }
                              }}
                            </p>
                            @if (d.findings) {
                              <p class="mt-2 text-[13px] whitespace-pre-line text-fg">
                                <span class="font-semibold"
                                  >{{ 'environment.fields.findings' | transloco }}:</span
                                >
                                {{ d.findings }}
                              </p>
                            }
                            @if (d.lessons_learned) {
                              <p class="mt-1 text-[13px] whitespace-pre-line text-fg">
                                <span class="font-semibold"
                                  >{{ 'environment.fields.lessonsLearned' | transloco }}:</span
                                >
                                {{ d.lessons_learned }}
                              </p>
                            }
                          </li>
                        }
                      </ul>
                    } @else {
                      <p class="text-[13px] text-fg-muted" data-testid="no-drills">
                        {{ 'environment.drill.none' | transloco }}
                      </p>
                    }
                  }
                }
              </app-card>
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="entityType"
                [entityId]="p.id"
                [canCreate]="canWrite()"
                [entityLabel]="p.code + ' ' + p.title"
              />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 text-[13px] font-semibold text-fg-subtle">
                  {{ 'environment.plan.sections.drills' | transloco }}
                </h2>
                <dl class="flex flex-col gap-2 text-[13px]" data-testid="plan-drill-summary">
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'environment.fields.drillSchedule' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (p.drill_rrule) {
                        <app-rule-summary [rrule]="p.drill_rrule" />
                      } @else {
                        {{ 'environment.plan.noSchedule' | transloco }}
                      }
                    </dd>
                  </div>
                  @if (p.next_drill_due_at) {
                    <div>
                      <dt class="text-fg-subtle">{{ 'environment.plan.nextDrill' | transloco }}</dt>
                      <dd class="text-fg">{{ p.next_drill_due_at | localDay }}</dd>
                    </div>
                  }
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'environment.plan.lastDrillLabel' | transloco }}
                    </dt>
                    <dd class="text-fg" [class.text-fail]="p.drill_overdue">
                      {{
                        p.last_drill_at
                          ? (p.last_drill_at | localDay)
                          : ('environment.common.never' | transloco)
                      }}
                    </dd>
                  </div>
                </dl>
              </app-card>
              <app-card>
                <dl class="flex flex-col gap-2 text-[13px]">
                  <div>
                    <dt class="text-fg-subtle">{{ 'environment.fields.owner' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ p.owner_name ?? ('environment.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'environment.fields.reviewDue' | transloco }}</dt>
                    <dd class="text-fg" [class.text-fail]="p.review_overdue">
                      {{
                        p.review_due_at
                          ? (p.review_due_at | localDay)
                          : ('environment.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'environment.fields.lastReviewed' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        p.last_reviewed_at
                          ? (p.last_reviewed_at | localDate)
                          : ('environment.common.never' | transloco)
                      }}
                    </dd>
                  </div>
                </dl>
              </app-card>
              <app-supports-requirements [entityType]="entityType" [entityId]="p.id" />
              <app-why-it-matters scope="environment" page="planDetail" />
              <app-env-lesson-link lesson="emergency-preparedness" />
            </ng-container>
          </app-record-detail-layout>

          <app-env-drill-dialog
            [open]="recording()"
            [busy]="acting()"
            [planTitle]="p.code + ' ' + p.title"
            (saved)="recordDrill($event)"
            (cancelled)="recording.set(false)"
          />
          <app-env-review-dialog
            [open]="reviewing()"
            [busy]="acting()"
            (confirmed)="review($event)"
            (cancelled)="reviewing.set(false)"
          />
          <app-confirm-dialog
            [open]="deleting()"
            [title]="'environment.plan.deleteTitle' | transloco"
            [message]="'environment.plan.deleteMessage' | transloco: { code: p.code }"
            [confirmLabel]="'environment.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
          <app-confirm-dialog
            [open]="!!deletingDrill()"
            [title]="'environment.drill.deleteTitle' | transloco"
            [message]="'environment.drill.deleteMessage' | transloco"
            [confirmLabel]="'environment.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="removeDrill()"
            (cancelled)="deletingDrill.set(null)"
          />
        }
      }
    }
  `,
})
export class PlanDetail {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly id = input.required<string>();

  protected readonly entityType = ENTITY_PLAN;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = PLAN_FIELD_LABELS;
  protected readonly tone = statusTone;
  protected readonly outcome = outcomeTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.common.loadFailed');
  protected readonly plan = signal<EmergencyPlan | null>(null);
  protected readonly drills = signal<readonly Drill[]>([]);
  protected readonly drillsState = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly reviewing = signal(false);
  protected readonly recording = signal(false);
  protected readonly deletingDrill = signal<Drill | null>(null);

  /** `?drill=<id>` (the backend's link to one drill) highlights it. */
  protected readonly highlightDrill = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('drill'))),
    { initialValue: null },
  );

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes(PERM_WRITE));
  protected readonly canManage = computed(() => this.permissions().includes(PERM_MANAGE));
  protected readonly canRecord = computed(() => this.permissions().includes(PERM_RECORD));

  private request = new Subscription();
  private drillsRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.drillsRequest.unsubscribe();
    });
    providePageContext(() => {
      const p = this.plan();
      return {
        module: 'environment',
        entityType: ENTITY_PLAN,
        entityId: this.id(),
        view: 'detail',
        title: p ? `${p.code} ${p.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.load(orgId, id, true);
        this.loadDrills(orgId, id);
      });
    });
  }

  protected recordDrill(body: DrillCreate): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.recordDrill(orgId, this.id(), body).subscribe({
      next: () => {
        this.acting.set(false);
        this.recording.set(false);
        this.notifications.success('environment.notices.drillRecorded');
        this.refresh();
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  protected review(body: ReviewIn): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.reviewPlan(orgId, this.id(), body).subscribe({
      next: (p) => {
        this.acting.set(false);
        this.reviewing.set(false);
        this.plan.set(p);
        this.notifications.success('environment.notices.reviewed', { code: p.code });
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  protected removeDrill(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const drill = this.deletingDrill();
    if (!orgId || !drill) {
      return;
    }
    this.acting.set(true);
    this.api.deleteDrill(orgId, this.id(), drill.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deletingDrill.set(null);
        this.notifications.success('environment.notices.drillDeleted');
        this.refresh();
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.plan();
    if (!orgId || !p) {
      return;
    }
    this.acting.set(true);
    this.api.deletePlan(orgId, p.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deleting.set(false);
        this.notifications.success('environment.notices.deleted', { code: p.code });
        void this.router.navigate(['/environment/emergency-plans']);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  private refresh(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.load(orgId, this.id(), false);
    this.loadDrills(orgId, this.id());
  }

  private load(orgId: string | null, id: string, initial: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (initial) {
      this.state.set('loading');
    }
    this.request = this.api.getPlan(orgId, id).subscribe({
      next: (p) => {
        this.plan.set(p);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        if (initial) {
          this.errorKey.set(environmentErrorKey(error));
          this.state.set('error');
        } else {
          this.notifications.error(environmentErrorKey(error));
        }
      },
    });
  }

  private loadDrills(orgId: string | null, id: string): void {
    this.drillsRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.drillsState.set('loading');
    this.drillsRequest = this.api.listDrills(orgId, id).subscribe({
      next: (page) => {
        this.drills.set(page.items);
        this.drillsState.set('ready');
      },
      error: () => this.drillsState.set('error'),
    });
  }
}
