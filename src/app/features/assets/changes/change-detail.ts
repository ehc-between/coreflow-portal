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
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TeachMe } from '../../../shared/guidance/teach-me';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { WorkflowPanel } from '../../../shared/records/workflow-panel';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { levelTone, localizedLabel, stateCategoryTone } from '../data/asset-display';
import { assetErrorMessage } from '../data/asset-errors';
import { ChangeDetail, UpdateChangeRequest } from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { ChangeStep } from './change-step';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> label key (the change request's controlled fields). */
export const CHANGE_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'assets.fields.code',
  title: 'assets.fields.title',
  description: 'assets.fields.description',
  change_type: 'assets.fields.changeType',
  category: 'assets.fields.changeCategory',
  reason: 'assets.fields.reason',
  impact_assessment: 'assets.fields.impactAssessment',
  risk_level: 'assets.fields.riskLevel',
  risk_assessment: 'assets.fields.riskAssessment',
  implementation_plan: 'assets.fields.implementationPlan',
  rollback_plan: 'assets.fields.rollbackPlan',
  planned_start: 'assets.fields.plannedStart',
  planned_end: 'assets.fields.plannedEnd',
  implemented_at: 'assets.fields.implementedAt',
  review_outcome: 'assets.fields.reviewOutcome',
  review_notes: 'assets.fields.reviewNotes',
  owner_user_id: 'assets.fields.owner',
  department_id: 'assets.fields.department',
};

/**
 * A change request (`/assets/changes/:id`): the workflow (state, the steps the
 * caller may take, approvals with segregation of duties), what the next step still
 * needs, the request, the impact and risk assessment with the implementation and
 * rollback plans, the implementation and post-implementation review, the affected
 * assets and the shared record tabs.
 */
@Component({
  selector: 'app-change-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    Alert,
    AskAbout,
    Badge,
    Button,
    Card,
    ChangeStep,
    ConfirmDialog,
    EntityTasks,
    GuideIntro,
    HasPermissionDirective,
    Icon,
    LessonView,
    RecordDetailLayout,
    SupportsRequirements,
    TeachMe,
    WatchButton,
    WhyItMatters,
    WorkflowPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="mx-auto max-w-[1180px] px-4 pt-7 text-[14px] text-fg-muted sm:px-8">
          {{ 'assets.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            routerLink="/assets/changes"
            class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'assets.common.backToChanges' | transloco }}
          </a>
          <app-alert>{{ 'assets.changeDetail.notFound' | transloco }}</app-alert>
        </div>
      }
      @default {
        @if (change(); as c) {
          <app-record-detail-layout
            entityType="change_request"
            [entityId]="c.id"
            [tabs]="tabs"
            [canEdit]="canWrite() && !c.closed"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            backLink="/assets/changes"
            backLabelKey="assets.common.backToChanges"
          >
            <div header>
              <div class="mb-1.5 flex flex-wrap items-center gap-2">
                <span class="font-mono text-[12.5px] text-fg-muted">{{ c.code }}</span>
                <app-badge [tone]="catTone(c.status_category)">{{
                  label(c.status_label)
                }}</app-badge>
                @if (c.change_type !== 'normal') {
                  <app-badge [tone]="c.change_type === 'emergency' ? 'fail' : 'neutral'">
                    {{ 'assets.changeType.' + c.change_type | transloco }}
                  </app-badge>
                }
                @if (c.risk_level) {
                  <app-badge [tone]="riskTone(c.risk_level)">
                    {{
                      'assets.changes.riskBadge'
                        | transloco: { level: ('assets.criticality.' + c.risk_level | transloco) }
                    }}
                  </app-badge>
                }
                @if (c.pending_approval) {
                  <app-badge tone="accent">{{
                    'assets.changes.awaitingApproval' | transloco
                  }}</app-badge>
                }
              </div>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
              >
                {{ c.title }}
              </h1>
              <p class="mt-1 text-[13px] text-fg-muted">
                {{ 'assets.changeCategory.' + c.category | transloco }}
                @if (c.requested_by?.name; as name) {
                  · {{ 'assets.changeDetail.requestedBy' | transloco: { name } }}
                }
              </p>
            </div>

            <ng-container actions>
              <app-watch-button entityType="change_request" [entityId]="c.id" />
              <app-button variant="ghost" size="sm" (click)="askSummary()">
                <app-icon name="spark" [size]="14" />
                {{ 'assets.ai.summariseChange' | transloco }}
              </app-button>
              @if (canWrite() && !c.closed) {
                <a
                  [routerLink]="['/assets/changes', c.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'assets.common.edit' | transloco }}
                </a>
              }
              @if (canManage()) {
                <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'assets.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-5">
              <app-guide-intro scope="assets" page="change" />

              <app-change-step
                [change]="c"
                [canWrite]="canWrite()"
                [busy]="busy()"
                (saved)="saveStep(c, $event)"
              />

              <app-workflow-panel
                entityType="change_request"
                [entityId]="c.id"
                [data]="c.data"
                (transitioned)="reload()"
              />

              @if (c.locked_fields.length && !c.closed) {
                <p
                  class="rounded-tile bg-surface-2 px-3 py-2 text-[12.5px] text-fg-muted"
                  role="note"
                >
                  <app-icon name="lock" [size]="12" />
                  {{ 'assets.changeDetail.locked' | transloco }}
                </p>
              }

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'assets.changeForm.sections.request' | transloco }}
                </h2>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
                  @for (key of requestTexts; track key.field) {
                    <div class="sm:col-span-2">
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'assets.fields.' + key.label | transloco }}
                      </dt>
                      <dd class="text-fg">
                        @if (c[key.field]; as text) {
                          <div
                            class="cf-prose text-[13.5px]"
                            [innerHTML]="text | appMarkdown"
                          ></div>
                        } @else {
                          <span class="text-fg-subtle">{{
                            'assets.common.notGiven' | transloco
                          }}</span>
                        }
                      </dd>
                    </div>
                  }
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.owner' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ c.owner?.name ?? ('assets.common.nobody' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.changeDetail.planned' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (c.planned_start || c.planned_end) {
                        {{ c.planned_start ? (c.planned_start | localDay) : '…' }}
                        –
                        {{ c.planned_end ? (c.planned_end | localDay) : '…' }}
                      } @else {
                        –
                      }
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'assets.changeForm.sections.assessment' | transloco }}
                  </h2>
                  <app-ask-about
                    [prompt]="'assets.ai.prompts.reviewAssessment' | transloco"
                    field="impact_assessment"
                  />
                </div>
                <dl class="grid grid-cols-1 gap-y-3 text-[13.5px]">
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.riskLevel' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        c.risk_level
                          ? ('assets.criticality.' + c.risk_level | transloco)
                          : ('assets.common.notSet' | transloco)
                      }}
                    </dd>
                  </div>
                  @for (key of assessmentTexts; track key.field) {
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'assets.fields.' + key.label | transloco }}
                      </dt>
                      <dd class="text-fg">
                        @if (c[key.field]; as text) {
                          <div
                            class="cf-prose text-[13.5px]"
                            [innerHTML]="text | appMarkdown"
                          ></div>
                        } @else {
                          <span class="text-fg-subtle">{{
                            'assets.common.notGiven' | transloco
                          }}</span>
                        }
                      </dd>
                    </div>
                  }
                </dl>
              </app-card>

              @if (
                c.implemented_at ||
                c.review_outcome ||
                c.status === 'review' ||
                c.status === 'closed'
              ) {
                <app-card>
                  <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                    {{ 'assets.changeForm.sections.implementation' | transloco }}
                  </h2>
                  <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'assets.fields.implementedAt' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{ c.implemented_at ? (c.implemented_at | localDate) : '–' }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'assets.fields.reviewOutcome' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        {{
                          c.review_outcome
                            ? ('assets.reviewOutcome.' + c.review_outcome | transloco)
                            : '–'
                        }}
                      </dd>
                    </div>
                    @if (c.review_notes) {
                      <div class="sm:col-span-2">
                        <dt class="text-[12px] text-fg-muted">
                          {{ 'assets.fields.reviewNotes' | transloco }}
                        </dt>
                        <dd
                          class="cf-prose text-fg"
                          [innerHTML]="c.review_notes | appMarkdown"
                        ></dd>
                      </div>
                    }
                  </dl>
                </app-card>
              }

              <app-card>
                <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                  {{ 'assets.fields.affectedAssets' | transloco }}
                </h2>
                @if (c.affected_assets.length) {
                  <ul class="flex flex-wrap gap-1.5">
                    @for (a of c.affected_assets; track a.id) {
                      <li>
                        <a
                          [routerLink]="['/assets', a.id]"
                          class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] text-fg hover:underline"
                        >
                          <span class="font-mono text-[11.5px] text-fg-muted">{{ a.code }}</span>
                          {{ a.name }}
                        </a>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-[13px] text-fg-subtle">
                    {{ 'assets.changeDetail.noAssets' | transloco }}
                  </p>
                }
                <p class="mt-2 text-[12px] text-fg-subtle">
                  {{ 'assets.changeDetail.assetsHint' | transloco }}
                </p>
              </app-card>

              <app-why-it-matters scope="assets" page="change" />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 font-display text-[14px] font-bold text-fg">
                  {{ 'assets.detail.learn' | transloco }}
                </h2>
                <div class="flex flex-col items-start gap-2">
                  <app-lesson scope="assets" lesson="change-management" />
                  <app-teach-me topic="assets.change" [subject]="c.title" />
                </div>
              </app-card>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="change_request" [entityId]="c.id" />
              </app-card>
            </ng-container>

            <div tasks>
              <app-entity-tasks
                entityType="change_request"
                [entityId]="c.id"
                [canCreate]="canWrite() && !c.closed"
                [entityLabel]="c.code + ' ' + c.title"
              />
            </div>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'assets.changeDetail.deleteTitle' | transloco"
            [message]="
              'assets.changeDetail.deleteMessage' | transloco: { code: c.code, title: c.title }
            "
            [confirmLabel]="'assets.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove(c)"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class ChangeDetailPage {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly panel = viewChild(WorkflowPanel);

  protected readonly tabs = TABS;
  protected readonly fieldLabels = CHANGE_FIELD_LABELS;
  protected readonly riskTone = levelTone;
  protected readonly catTone = stateCategoryTone;
  protected readonly requestTexts = [
    { field: 'description', label: 'description' },
    { field: 'reason', label: 'reason' },
  ] as const;
  protected readonly assessmentTexts = [
    { field: 'impact_assessment', label: 'impactAssessment' },
    { field: 'risk_assessment', label: 'riskAssessment' },
    { field: 'implementation_plan', label: 'implementationPlan' },
    { field: 'rollback_plan', label: 'rollbackPlan' },
  ] as const;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly change = signal<ChangeDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes('assets:write'));
  protected readonly canManage = computed(() => this.permissions().includes('assets:manage'));
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const c = this.change();
      return {
        module: 'assets',
        entityType: 'change_request',
        entityId: this.id(),
        view: 'detail',
        title: c ? `${c.code} ${c.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
  }

  protected label(value: ChangeDetail['status_label']): string {
    return localizedLabel(value, this.language.active());
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  protected askSummary(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.summariseChange'));
  }

  protected saveStep(c: ChangeDetail, patch: UpdateChangeRequest): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.updateChange(orgId, c.id, patch).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.change.set(updated);
        this.panel()?.reload();
        this.notifications.success('assets.changeStep.saved');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const message = assetErrorMessage(err);
        this.notifications.error(message.key, { ...message.params });
      },
    });
  }

  protected remove(c: ChangeDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteChange(orgId, c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('assets.changeDetail.deleted', { code: c.code });
        void this.router.navigate(['/assets/changes']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        const message = assetErrorMessage(err);
        this.notifications.error(message.key, { ...message.params });
      },
    });
  }

  private load(orgId: string | null, id: string, showLoading: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (showLoading) {
      this.state.set('loading');
    }
    this.request = this.api.getChange(orgId, id).subscribe({
      next: (c) => {
        this.change.set(c);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
