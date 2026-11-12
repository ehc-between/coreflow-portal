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
import { AttachmentsApi } from '../../core/attachments/attachments-api';
import { Attachment } from '../../core/attachments/attachment.models';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { RuleSummary } from '../../shared/tasks/rule-summary';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { ObligationsApi } from './data/obligations-api';
import { ENTITY_TYPE, Obligation } from './data/obligation.models';
import {
  complianceKey,
  complianceTone,
  daysUntil,
  frameworkKey,
  obligationStatusKey,
  obligationStatusTone,
  obligationTypeKey,
  resultKey,
  safeUrl,
} from './data/obligation-display';
import { obligationErrorKey } from './data/obligation-errors';
import { ObligationLessonLink } from './lesson-link';
import { ObligationActions } from './obligation-actions';
import { ObligationChanges } from './obligation-changes';
import { ObligationEvaluations } from './obligation-evaluations';

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
export const OBLIGATION_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'obligations.fields.code',
  title: 'obligations.fields.title',
  obligation_type: 'obligations.fields.obligationType',
  status: 'obligations.fields.status',
  compliance_status: 'obligations.fields.complianceStatus',
  description: 'obligations.fields.description',
  applicability: 'obligations.fields.applicability',
  requirements: 'obligations.fields.requirements',
  frameworks: 'obligations.fields.frameworks',
  jurisdiction: 'obligations.fields.jurisdiction',
  issuer: 'obligations.fields.issuer',
  reference: 'obligations.fields.reference',
  source_url: 'obligations.fields.sourceUrl',
  owner_user_id: 'obligations.fields.owner',
  department_id: 'obligations.fields.department',
  valid_from: 'obligations.fields.validFrom',
  valid_until: 'obligations.fields.validUntil',
  evaluation_rrule: 'obligations.fields.evaluationRrule',
  evaluation_start: 'obligations.fields.evaluationStart',
  evaluation_lead_days: 'obligations.fields.evaluationLeadDays',
};

/** Days before `valid_until` from which the validity end is highlighted. */
export const EXPIRY_WARNING_DAYS = 60;

/**
 * An obligation (`/obligations/:id`): what it requires and how it applies, the
 * periodic compliance evaluations with their evidence, change monitoring notes and
 * an AI summary; evaluation and follow-up tasks in the Tasks tab; related records,
 * activity, comments, attachments and revision history from the shared record kit.
 */
@Component({
  selector: 'app-obligation-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    MarkdownPipe,
    WatchButton,
    AiAssistButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    RuleSummary,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    ObligationActions,
    ObligationChanges,
    ObligationEvaluations,
    ObligationLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
          {{ 'obligations.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          <a
            routerLink="/obligations"
            class="mt-4 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'obligations.common.backToList' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (obligation(); as o) {
          <app-record-detail-layout
            [entityType]="entityType"
            [entityId]="o.id"
            [tabs]="tabs"
            [canEdit]="o.can_edit"
            [fieldLabels]="fieldLabels"
            backLink="/obligations"
            backLabelKey="obligations.common.backToList"
          >
            <div header>
              <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
                <span class="font-mono font-semibold">{{ o.code }}</span>
                <span>{{ typeKey(o.obligation_type) | transloco }}</span>
                @if (o.jurisdiction) {
                  <span>{{ o.jurisdiction }}</span>
                }
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="obligation-heading"
              >
                {{ o.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="statusTone(o.status)" data-testid="obligation-status">{{
                  statusKey(o.status) | transloco
                }}</app-badge>
                <app-badge
                  [tone]="complianceTone(o.compliance_status)"
                  data-testid="obligation-compliance"
                  >{{ complianceKey(o.compliance_status) | transloco }}</app-badge
                >
                @for (f of o.frameworks; track f) {
                  <app-badge tone="neutral">{{ frameworkKey(f) | transloco }}</app-badge>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button [entityType]="entityType" [entityId]="o.id" />
              <app-ask-about [prompt]="'obligations.ask.explain' | transloco" />
              @if (o.can_edit) {
                <a
                  [routerLink]="['/obligations', o.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="obligation-edit"
                >
                  {{ 'obligations.common.edit' | transloco }}
                </a>
              }
              @if (o.can_delete) {
                <app-button variant="ghost" size="sm" (click)="deleting.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'obligations.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-6">
              <app-guide-intro scope="obligations" page="detail" />

              @if (o.status === 'retired') {
                <app-alert tone="info">{{
                  'obligations.detail.retiredNotice' | transloco
                }}</app-alert>
              } @else if (o.status === 'draft') {
                <app-alert tone="info">{{
                  'obligations.detail.draftNotice' | transloco
                }}</app-alert>
              }

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'obligations.detail.summary' | transloco }}
                </h2>
                @if (o.description) {
                  <p class="mb-4 text-[13.5px] whitespace-pre-line text-fg">{{ o.description }}</p>
                }
                <dl
                  class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div>
                    <dt class="text-fg-subtle">{{ 'obligations.fields.owner' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ o.owner?.name ?? ('obligations.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'obligations.fields.issuer' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ o.issuer ?? ('obligations.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'obligations.fields.reference' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ o.reference ?? ('obligations.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'obligations.fields.validFrom' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        o.valid_from
                          ? (o.valid_from | localDay)
                          : ('obligations.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'obligations.fields.validUntil' | transloco }}
                    </dt>
                    <dd
                      class="text-fg"
                      [class.text-fail]="expiringSoon()"
                      data-testid="valid-until"
                    >
                      {{
                        o.valid_until
                          ? (o.valid_until | localDay)
                          : ('obligations.detail.noEnd' | transloco)
                      }}
                      @if (validDays() !== null) {
                        <span class="text-fg-subtle">
                          ({{ daysLabel() | transloco: { days: absDays() } }})
                        </span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'obligations.fields.sourceUrl' | transloco }}</dt>
                    <dd class="min-w-0 truncate text-fg">
                      @if (sourceLink(); as url) {
                        <a
                          [href]="url"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="font-semibold text-accent hover:underline"
                        >
                          {{ 'obligations.detail.openSource' | transloco }}
                        </a>
                      } @else {
                        {{ o.source_url ?? ('obligations.common.none' | transloco) }}
                      }
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-2 flex items-center gap-1 font-display text-[15px] font-bold text-fg">
                  {{ 'obligations.fields.applicability' | transloco }}
                  <app-ask-about
                    [prompt]="'obligations.ask.applicability' | transloco"
                    field="applicability"
                  />
                </h2>
                <p class="text-[13.5px] whitespace-pre-line text-fg">
                  {{ o.applicability || ('obligations.detail.noApplicability' | transloco) }}
                </p>
                <h2 class="mt-5 mb-2 font-display text-[15px] font-bold text-fg">
                  {{ 'obligations.fields.requirements' | transloco }}
                </h2>
                @if (o.requirements.length) {
                  <ol
                    class="list-decimal space-y-1.5 pl-5 text-[13.5px] text-fg"
                    data-testid="requirements"
                  >
                    @for (r of o.requirements; track $index) {
                      <li class="whitespace-pre-line">{{ r }}</li>
                    }
                  </ol>
                } @else {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'obligations.detail.noRequirements' | transloco }}
                    @if (o.can_edit) {
                      <a
                        [routerLink]="['/obligations', o.id, 'edit']"
                        class="font-semibold text-accent hover:underline"
                      >
                        {{ 'obligations.detail.addRequirements' | transloco }}
                      </a>
                    }
                  </p>
                }
              </app-card>

              <app-card>
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'obligations.summarise.title' | transloco }}
                  </h2>
                  <app-ai-assist-button
                    assist="obligations.summarise"
                    labelKey="obligations.summarise.run"
                    [entityType]="entityType"
                    [entityId]="o.id"
                    (text)="aiSummary.set($event)"
                    data-testid="summarise"
                  />
                </div>
                @if (aiSummary()) {
                  <div
                    class="prose-sm text-[13.5px] text-fg"
                    aria-live="polite"
                    data-testid="ai-summary"
                    [innerHTML]="aiSummary() | appMarkdown"
                  ></div>
                } @else {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'obligations.summarise.hint' | transloco }}
                  </p>
                }
              </app-card>

              <app-card>
                <app-obligation-evaluations
                  [obligation]="o"
                  [attachments]="attachments()"
                  (changed)="onEvaluated($event)"
                  (actionAdded)="bumpActions()"
                />
              </app-card>

              <app-card>
                <app-obligation-changes
                  [obligationId]="o.id"
                  [canEdit]="o.can_edit"
                  (changed)="reload()"
                />
              </app-card>
            </div>

            <div tasks>
              <app-obligation-actions
                [obligationId]="o.id"
                [canEdit]="o.can_edit && o.status !== 'retired'"
                [refresh]="actionsVersion()"
              />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 text-[13px] font-semibold text-fg-subtle">
                  {{ 'obligations.detail.schedule' | transloco }}
                </h2>
                @if (o.evaluation_rrule) {
                  <p class="text-[13.5px] font-semibold text-fg" data-testid="schedule">
                    <app-rule-summary [rrule]="o.evaluation_rrule" />
                  </p>
                  @if (o.next_evaluation; as next) {
                    <p
                      class="mt-1 text-[13px]"
                      [class.text-fail]="next.overdue"
                      [class.font-semibold]="next.overdue"
                      data-testid="next-evaluation"
                    >
                      @if (next.overdue) {
                        <app-icon name="alert" [size]="13" class="inline" />
                      }
                      {{
                        (next.overdue
                          ? 'obligations.detail.overdueSince'
                          : 'obligations.detail.nextDue'
                        ) | transloco: { date: (next.due_at | localDay) }
                      }}
                    </p>
                  }
                } @else {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'obligations.detail.noSchedule' | transloco }}
                  </p>
                }
                <dl class="mt-3 flex flex-col gap-2 text-[12.5px]">
                  <div class="flex justify-between gap-2">
                    <dt class="text-fg-subtle">
                      {{ 'obligations.detail.lastEvaluated' | transloco }}
                    </dt>
                    <dd class="text-right text-fg">
                      {{
                        o.last_evaluated_at
                          ? (o.last_evaluated_at | localDay)
                          : ('obligations.detail.never' | transloco)
                      }}
                    </dd>
                  </div>
                  @if (o.latest_evaluation; as latest) {
                    <div class="flex justify-between gap-2">
                      <dt class="text-fg-subtle">
                        {{ 'obligations.detail.latestResult' | transloco }}
                      </dt>
                      <dd class="text-right text-fg">{{ resultKey(latest.result) | transloco }}</dd>
                    </div>
                  }
                  <div class="flex justify-between gap-2">
                    <dt class="text-fg-subtle">
                      {{ 'obligations.detail.evaluationCount' | transloco }}
                    </dt>
                    <dd class="text-right text-fg">{{ o.evaluation_count }}</dd>
                  </div>
                  <div class="flex justify-between gap-2">
                    <dt class="text-fg-subtle">
                      {{ 'obligations.detail.openChanges' | transloco }}
                    </dt>
                    <dd class="text-right text-fg" data-testid="open-changes">
                      {{ o.open_changes }}
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-supports-requirements [entityType]="entityType" [entityId]="o.id" />
              <app-why-it-matters scope="obligations" page="detail" />
              <div class="flex flex-col items-start gap-1">
                <app-obligation-lesson-link lesson="evaluating-compliance" />
                <app-obligation-lesson-link lesson="monitoring-changes" />
              </div>
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'obligations.detail.deleteTitle' | transloco"
            [message]="'obligations.detail.deleteMessage' | transloco: { code: o.code }"
            [confirmLabel]="'obligations.common.delete' | transloco"
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
export class ObligationDetail {
  private readonly api = inject(ObligationsApi);
  private readonly attachmentsApi = inject(AttachmentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly id = input.required<string>();

  protected readonly entityType = ENTITY_TYPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = OBLIGATION_FIELD_LABELS;
  protected readonly statusKey = obligationStatusKey;
  protected readonly statusTone = obligationStatusTone;
  protected readonly typeKey = obligationTypeKey;
  protected readonly complianceKey = complianceKey;
  protected readonly complianceTone = complianceTone;
  protected readonly frameworkKey = frameworkKey;
  protected readonly resultKey = resultKey;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('obligations.common.loadFailed');
  protected readonly obligation = signal<Obligation | null>(null);
  protected readonly attachments = signal<readonly Attachment[]>([]);
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly actionsVersion = signal(0);
  protected readonly aiSummary = signal('');

  protected readonly sourceLink = computed(() => safeUrl(this.obligation()?.source_url));
  protected readonly validDays = computed(() => daysUntil(this.obligation()?.valid_until));
  protected readonly absDays = computed(() => Math.abs(this.validDays() ?? 0));
  protected readonly daysLabel = computed(() => {
    const days = this.validDays() ?? 0;
    return days < 0 ? 'obligations.detail.endedAgo' : 'obligations.detail.endsIn';
  });
  protected readonly expiringSoon = computed(() => {
    const days = this.validDays();
    return days !== null && days <= EXPIRY_WARNING_DAYS;
  });

  /** The open tab (`?tab=`), so the file list refreshes when returning to details. */
  private readonly tab = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('tab'))), {
    initialValue: null,
  });

  private request = new Subscription();
  private filesRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.filesRequest.unsubscribe();
    });
    providePageContext(() => {
      const o = this.obligation();
      return {
        module: 'obligations',
        entityType: ENTITY_TYPE,
        entityId: this.id(),
        view: 'detail',
        title: o ? `${o.code} ${o.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.aiSummary.set('');
        this.load(orgId, id, true);
      });
    });
    effect(() => {
      const tab = this.tab();
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (!tab || tab === 'details') {
        untracked(() => this.loadFiles(orgId, id));
      }
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  protected onEvaluated(updated: Obligation | null): void {
    if (updated) {
      this.obligation.set(updated);
    } else {
      this.reload();
    }
    this.bumpActions();
  }

  protected bumpActions(): void {
    this.actionsVersion.update((v) => v + 1);
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const o = this.obligation();
    if (!orgId || !o) {
      return;
    }
    this.acting.set(true);
    this.api.delete(orgId, o.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deleting.set(false);
        this.notifications.success('obligations.notices.deleted', { code: o.code });
        void this.router.navigate(['/obligations']);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string, initial: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (initial) {
      this.state.set('loading');
    }
    this.request = this.api.get(orgId, id).subscribe({
      next: (obligation) => {
        this.obligation.set(obligation);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        if (initial) {
          this.errorKey.set(obligationErrorKey(error));
          this.state.set('error');
        } else {
          this.notifications.error(obligationErrorKey(error));
        }
      },
    });
  }

  private loadFiles(orgId: string | null, id: string): void {
    this.filesRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.filesRequest = this.attachmentsApi.list(orgId, ENTITY_TYPE, id).subscribe({
      next: (items) => this.attachments.set(items),
      error: () => this.attachments.set([]),
    });
  }
}
