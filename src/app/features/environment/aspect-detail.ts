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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { EnvironmentApi } from './data/environment-api';
import {
  Aspect,
  ENTITY_ASPECT,
  PERM_MANAGE,
  PERM_WRITE,
  ReviewIn,
  ScoringMethod,
} from './data/environment.models';
import { criterionLabel, statusTone } from './data/environment-display';
import { environmentErrorKey } from './data/environment-errors';
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

/** Revision snapshot field -> i18n key (for the revisions tab). */
export const ASPECT_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'environment.fields.code',
  activity: 'environment.fields.activity',
  aspect: 'environment.fields.aspect',
  impact: 'environment.fields.impact',
  impact_type: 'environment.fields.impactType',
  condition: 'environment.fields.condition',
  lifecycle_stages: 'environment.fields.lifecycleStages',
  control_level: 'environment.fields.controlLevel',
  site: 'environment.fields.site',
  scores: 'environment.fields.scores',
  score: 'environment.fields.score',
  significant: 'environment.fields.significant',
  significance_override: 'environment.fields.override',
  override_reason: 'environment.fields.overrideReason',
  legal_requirement: 'environment.fields.legalRequirement',
  operational_controls: 'environment.fields.operationalControls',
  status: 'environment.fields.status',
  owner_user_id: 'environment.fields.owner',
  department_id: 'environment.fields.department',
  review_due_at: 'environment.fields.reviewDue',
  last_reviewed_at: 'environment.fields.lastReviewed',
};

/**
 * An environmental aspect (`/environment/aspects/:id`): what the activity does
 * to the environment, its evaluation under the org's scoring method and why it
 * is (or is not) significant, its operational controls and review; follow-up
 * tasks, related records (e.g. compliance obligations, objectives), activity,
 * comments, attachments and revision history from the shared record kit.
 */
@Component({
  selector: 'app-env-aspect-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
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
            routerLink="/environment/aspects"
            class="mt-4 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'environment.aspects.back' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (aspect(); as a) {
          <app-record-detail-layout
            [entityType]="entityType"
            [entityId]="a.id"
            [tabs]="tabs"
            [canEdit]="canWrite()"
            [fieldLabels]="fieldLabels"
            backLink="/environment/aspects"
            backLabelKey="environment.aspects.back"
          >
            <div header>
              <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
                <span class="font-mono font-semibold">{{ a.code }}</span>
                <span>{{ a.activity }}</span>
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="aspect-heading"
              >
                {{ a.aspect }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="tone(a.status)" data-testid="aspect-status">{{
                  'environment.status.' + a.status | transloco
                }}</app-badge>
                @if (a.significant) {
                  <app-badge tone="warn" data-testid="aspect-significant">
                    <app-icon name="flag" [size]="12" />
                    {{ 'environment.aspect.significant' | transloco }}
                  </app-badge>
                } @else {
                  <app-badge tone="neutral">{{
                    'environment.aspect.notSignificant' | transloco
                  }}</app-badge>
                }
                @if (a.review_overdue) {
                  <app-badge tone="fail">{{
                    'environment.common.reviewIsOverdue' | transloco
                  }}</app-badge>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button [entityType]="entityType" [entityId]="a.id" />
              <app-ask-about [prompt]="'environment.ask.summariseAspect' | transloco" />
              @if (canWrite()) {
                <app-button
                  variant="secondary"
                  size="sm"
                  (click)="reviewing.set(true)"
                  data-testid="aspect-review"
                >
                  <app-icon name="checkcircle" [size]="14" />
                  {{ 'environment.review.action' | transloco }}
                </app-button>
                <a
                  [routerLink]="['/environment/aspects', a.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="aspect-edit"
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
              <app-guide-intro scope="environment" page="aspectDetail" />

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'environment.aspect.sections.identify' | transloco }}
                </h2>
                @if (a.impact) {
                  <p class="mb-4 text-[13.5px] whitespace-pre-line text-fg">{{ a.impact }}</p>
                }
                <dl
                  class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'environment.fields.impactType' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ 'environment.impactTypes.' + a.impact_type | transloco }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'environment.fields.condition' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ 'environment.conditions.' + a.condition | transloco }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'environment.fields.controlLevel' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ 'environment.controlLevels.' + a.control_level | transloco }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'environment.fields.site' | transloco }}</dt>
                    <dd class="text-fg">{{ a.site ?? ('environment.common.none' | transloco) }}</dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="text-fg-subtle">
                      {{ 'environment.fields.lifecycleStages' | transloco }}
                    </dt>
                    <dd class="flex flex-wrap gap-1.5 text-fg">
                      @for (s of a.lifecycle_stages; track s) {
                        <app-badge tone="neutral">{{
                          'environment.stages.' + s | transloco
                        }}</app-badge>
                      } @empty {
                        {{ 'environment.common.none' | transloco }}
                      }
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'environment.aspect.sections.evaluate' | transloco }}
                  </h2>
                  <app-ask-about
                    [prompt]="'environment.ask.explainSignificance' | transloco"
                    field="significant"
                  />
                </div>
                @if (method(); as m) {
                  <table class="w-full text-left text-[13px]" data-testid="aspect-scores">
                    <thead class="text-fg-subtle">
                      <tr>
                        <th scope="col" class="py-1 pr-3 font-semibold">
                          {{ 'environment.aspect.criterion' | transloco }}
                        </th>
                        <th scope="col" class="py-1 text-right font-semibold">
                          {{
                            'environment.aspect.scoreColumn'
                              | transloco: { min: m.scale_min, max: m.scale_max }
                          }}
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                      @for (c of m.criteria; track c.key) {
                        <tr>
                          <td class="py-1.5 pr-3 text-fg">{{ label(c) }}</td>
                          <td class="py-1.5 text-right font-semibold text-fg">
                            {{ a.scores[c.key] ?? '–' }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
                <p class="mt-3 text-[13.5px] text-fg" data-testid="aspect-score">
                  @if (a.score !== null) {
                    {{
                      'environment.aspect.scoreOf'
                        | transloco
                          : {
                              score: (a.score | localNumber: '1.0-2'),
                              max: (method()?.max_score ?? 0 | localNumber: '1.0-2'),
                            }
                    }}
                  } @else {
                    {{ 'environment.aspect.scoreIncomplete' | transloco }}
                  }
                </p>
                @if (a.significance_reasons.length) {
                  <ul class="mt-2 flex flex-col gap-1 text-[12.5px] text-fg-muted">
                    @for (r of a.significance_reasons; track r) {
                      <li class="flex items-center gap-1.5">
                        <app-icon name="check" [size]="13" class="text-accent" />
                        {{ 'environment.reasons.' + r | transloco }}
                      </li>
                    }
                  </ul>
                }
                @if (a.significance_override !== null) {
                  <app-alert tone="info">
                    {{
                      'environment.aspect.overrideNotice'
                        | transloco
                          : {
                              computed:
                                ((a.computed_significant
                                  ? 'environment.aspect.significant'
                                  : 'environment.aspect.notSignificant'
                                ) | transloco),
                              reason: a.override_reason ?? '',
                            }
                    }}
                  </app-alert>
                }
                @if (a.legal_requirement) {
                  <p class="mt-2 text-[12.5px] text-fg-muted">
                    {{ 'environment.aspect.legalNotice' | transloco }}
                  </p>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'environment.fields.operationalControls' | transloco }}
                </h2>
                @if (a.operational_controls) {
                  <p class="text-[13.5px] whitespace-pre-line text-fg">
                    {{ a.operational_controls }}
                  </p>
                } @else {
                  <p class="text-[13px] text-fg-muted">
                    {{
                      (a.significant
                        ? 'environment.aspect.noControlsSignificant'
                        : 'environment.aspect.noControls'
                      ) | transloco
                    }}
                  </p>
                }
              </app-card>
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="entityType"
                [entityId]="a.id"
                [canCreate]="canWrite()"
                [entityLabel]="a.code + ' ' + a.aspect"
              />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 text-[13px] font-semibold text-fg-subtle">
                  {{ 'environment.aspect.ownership' | transloco }}
                </h2>
                <dl class="flex flex-col gap-2 text-[13px]">
                  <div>
                    <dt class="text-fg-subtle">{{ 'environment.fields.owner' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ a.owner_name ?? ('environment.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'environment.fields.reviewDue' | transloco }}</dt>
                    <dd class="text-fg" [class.text-fail]="a.review_overdue">
                      {{
                        a.review_due_at
                          ? (a.review_due_at | localDay)
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
                        a.last_reviewed_at
                          ? (a.last_reviewed_at | localDate)
                          : ('environment.common.never' | transloco)
                      }}
                    </dd>
                  </div>
                </dl>
              </app-card>
              <app-supports-requirements [entityType]="entityType" [entityId]="a.id" />
              <app-why-it-matters scope="environment" page="aspectDetail" />
              <div class="flex flex-col items-start gap-1">
                <app-env-lesson-link lesson="significance" />
                <app-env-lesson-link lesson="aspects-and-impacts" />
              </div>
            </ng-container>
          </app-record-detail-layout>

          <app-env-review-dialog
            [open]="reviewing()"
            [busy]="acting()"
            (confirmed)="review($event)"
            (cancelled)="reviewing.set(false)"
          />
          <app-confirm-dialog
            [open]="deleting()"
            [title]="'environment.aspect.deleteTitle' | transloco"
            [message]="'environment.aspect.deleteMessage' | transloco: { code: a.code }"
            [confirmLabel]="'environment.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
        }
      }
    }
  `,
})
export class AspectDetail {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly entityType = ENTITY_ASPECT;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = ASPECT_FIELD_LABELS;
  protected readonly tone = statusTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.common.loadFailed');
  protected readonly aspect = signal<Aspect | null>(null);
  protected readonly method = signal<ScoringMethod | null>(null);
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly reviewing = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes(PERM_WRITE));
  protected readonly canManage = computed(() => this.permissions().includes(PERM_MANAGE));

  private request = new Subscription();
  private methodRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.methodRequest.unsubscribe();
    });
    providePageContext(() => {
      const a = this.aspect();
      return {
        module: 'environment',
        entityType: ENTITY_ASPECT,
        entityId: this.id(),
        view: 'detail',
        title: a ? `${a.code} ${a.aspect}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected label(c: ScoringMethod['criteria'][number]): string {
    return criterionLabel(c, this.language.active());
  }

  protected review(body: ReviewIn): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.reviewAspect(orgId, this.id(), body).subscribe({
      next: (a) => {
        this.acting.set(false);
        this.reviewing.set(false);
        this.aspect.set(a);
        this.notifications.success('environment.notices.reviewed', { code: a.code });
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const a = this.aspect();
    if (!orgId || !a) {
      return;
    }
    this.acting.set(true);
    this.api.deleteAspect(orgId, a.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deleting.set(false);
        this.notifications.success('environment.notices.deleted', { code: a.code });
        void this.router.navigate(['/environment/aspects']);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    this.methodRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.methodRequest = this.api.scoring(orgId).subscribe({
      next: (m) => this.method.set(m),
      error: () => this.method.set(null),
    });
    this.request = this.api.getAspect(orgId, id).subscribe({
      next: (a) => {
        this.aspect.set(a);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(environmentErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
