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
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { Term } from '../../../shared/guidance/term';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContinuityApi } from '../data/continuity-api';
import { badge } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import {
  BiaDetail,
  DependencyOut,
  IMPACT_CATEGORIES,
  IMPACT_INTERVALS,
} from '../data/continuity.models';
import { CONTINUITY_NAV, ContinuityLearnMore, recordCrumbs } from '../shared/continuity-page';
import { ContinuityControlledPanel, ControlledActionRequest } from '../shared/controlled-panel';
import { ContinuityDuration } from '../shared/duration';
import { confirmedRequirementRefs } from '../shared/page-requirements';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> label key (the BIA's controlled fields). */
export const BIA_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'continuity.fields.code',
  status: 'continuity.fields.status',
  version: 'continuity.fields.version',
  last_reviewed_on: 'continuity.fields.lastReviewed',
  next_review_on: 'continuity.fields.nextReview',
  title: 'continuity.fields.title',
  description: 'continuity.fields.description',
  process_id: 'continuity.fields.process',
  owner_user_id: 'continuity.fields.owner',
  department_id: 'continuity.fields.department',
  criticality: 'continuity.fields.criticality',
  impacts: 'continuity.fields.impacts',
  impact_timeline: 'continuity.fields.impactTimeline',
  impact_notes: 'continuity.fields.impactNotes',
  mtpd_minutes: 'continuity.fields.mtpd',
  rto_minutes: 'continuity.fields.rto',
  rpo_minutes: 'continuity.fields.rpo',
  mbco: 'continuity.fields.mbco',
  peak_periods: 'continuity.fields.peakPeriods',
  workarounds: 'continuity.fields.workarounds',
  dependencies: 'continuity.fields.dependencies',
  review_interval_months: 'continuity.fields.reviewInterval',
};

/**
 * A business impact analysis (`/continuity/bias/:id`): the approval card, the
 * process it analyses, how bad an outage gets per area and over time, the recovery
 * targets, the dependencies (linked to the ICT services, suppliers, assets, people
 * and records they rely on, with the readiness of each ICT service), the plans that
 * cover it, and the shared record tabs. Requirements it documents and its
 * connections sit in the aside.
 */
@Component({
  selector: 'app-bia-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    MarkdownPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ContinuityControlledPanel,
    ContinuityDuration,
    ContinuityLearnMore,
    EntityChip,
    EntityTasks,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    RecordDetailLayout,
    StatusBadge,
    Term,
    WatchButton,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8"><app-loading-state [rows]="6" /></div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            routerLink="/continuity/bias"
            class="mb-3 inline-flex items-center gap-1 text-ui font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'continuity.bias.back' | transloco }}
          </a>
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        </div>
      }
      @default {
        @if (bia(); as b) {
          <app-record-detail-layout
            entityType="bia"
            [entityId]="b.id"
            [title]="b.title"
            [breadcrumbs]="crumbs()"
            [tabs]="tabs"
            [canEdit]="b.can_edit"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            [requirementsPanel]="true"
            backLink="/continuity/bias"
            backLabelKey="continuity.bias.back"
          >
            <ng-container meta>
              <span class="font-mono">{{ b.code }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                [meaning]="statusBadge(b).meaning"
                [value]="statusBadge(b).value"
                [labelKey]="'continuity.status.' + b.status"
              />
              @if (b.criticality) {
                <app-status-badge
                  meaning="severity"
                  [value]="b.criticality"
                  [labelKey]="'continuity.criticality.' + b.criticality"
                />
              }
              @if (b.plans.length === 0 && b.status !== 'retired') {
                <app-status-badge
                  meaning="lifecycle"
                  value="due"
                  labelKey="continuity.bias.uncovered"
                />
              }
            </ng-container>

            <app-watch-button secondary entityType="bia" [entityId]="b.id" />
            @if (b.can_edit) {
              <app-button primary (click)="edit(b)">
                {{ 'continuity.common.edit' | transloco }}
              </app-button>
            }
            <button appMenuItem overflow (click)="askSummary()">
              {{ 'continuity.ai.summarise' | transloco }}
            </button>
            @if (b.allowed_actions.includes('retire')) {
              <button appMenuItem overflow (click)="panel()?.open('retire')">
                {{ 'continuity.actions.retire' | transloco }}
              </button>
            }
            @if (b.can_delete) {
              <button appMenuItem overflow [danger]="true" (click)="confirmDelete.set(true)">
                {{ 'continuity.common.delete' | transloco }}
              </button>
            }

            <app-module-nav nav labelKey="continuity.nav.label" [items]="nav" />
            <app-help-strip
              help
              scope="continuity"
              page="biaDetail"
              lesson="running-a-bia"
              [subject]="b.title"
            />

            <div class="flex flex-col gap-5">
              <app-continuity-controlled-panel
                [record]="b"
                [busy]="busy()"
                [error]="actionError()"
                (acted)="act(b, $event)"
              />

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.form.sections.activity' | transloco }}
                </h2>
                <app-field-list>
                  <app-field-item labelKey="continuity.fields.process">
                    @if (b.process; as process) {
                      <app-entity-chip [ref]="process" [showType]="false" [statusText]="true" />
                    } @else {
                      <span class="text-fg-subtle">{{
                        'continuity.bias.noProcess' | transloco
                      }}</span>
                    }
                  </app-field-item>
                  <app-field-item labelKey="continuity.fields.owner" [value]="b.owner?.name" />
                  @if (b.description) {
                    <app-field-item labelKey="continuity.fields.description" [wide]="true">
                      <div
                        class="cf-prose text-body leading-relaxed"
                        [innerHTML]="b.description | appMarkdown"
                      ></div>
                    </app-field-item>
                  }
                </app-field-list>
              </app-card>

              <app-card>
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'continuity.form.sections.impacts' | transloco }}
                </h2>
                <p class="mb-3 text-meta text-fg-muted">
                  {{ 'continuity.bias.impactsIntro' | transloco }}
                </p>
                <ul
                  class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
                  data-testid="impacts"
                >
                  @for (c of impactCategories; track c) {
                    <li
                      class="flex items-center justify-between gap-2 rounded-tile border border-border px-3 py-2"
                    >
                      <span class="text-ui text-fg">{{
                        'continuity.impacts.' + c | transloco
                      }}</span>
                      @if (b.impacts[c] !== null && b.impacts[c] !== undefined) {
                        <app-status-badge
                          [meaning]="impactBadge(b.impacts[c]).meaning"
                          [value]="impactBadge(b.impacts[c]).value"
                          [labelKey]="'continuity.impactLevel.' + b.impacts[c]"
                        />
                      } @else {
                        <span class="text-meta text-fg-subtle">{{
                          'continuity.common.notSet' | transloco
                        }}</span>
                      }
                    </li>
                  }
                </ul>
                @if (b.impact_notes) {
                  <p class="mt-3 text-ui whitespace-pre-line text-fg-muted">{{ b.impact_notes }}</p>
                }

                <h3 class="mt-5 mb-1 text-card font-semibold text-fg">
                  {{ 'continuity.fields.impactTimeline' | transloco }}
                </h3>
                @if (hasTimeline(b)) {
                  <ol class="grid grid-cols-5 gap-1.5" data-testid="impact-timeline">
                    @for (i of intervals; track i) {
                      <li
                        class="flex flex-col items-center gap-1 rounded-tile border border-border px-1 py-2 text-center"
                      >
                        <span class="text-meta font-semibold text-fg-muted">{{
                          'continuity.intervals.' + i | transloco
                        }}</span>
                        @if (timelineValue(b, i); as v) {
                          <app-status-badge
                            [meaning]="impactBadge(v).meaning"
                            [value]="impactBadge(v).value"
                            [labelKey]="'continuity.impactShort.' + v"
                          />
                        } @else if (timelineValue(b, i) === 0) {
                          <app-status-badge
                            meaning="severity"
                            value="none"
                            labelKey="continuity.impactShort.0"
                          />
                        } @else {
                          <span class="text-meta text-fg-subtle">—</span>
                        }
                      </li>
                    }
                  </ol>
                  @if (b.suggested_mtpd_minutes) {
                    <p class="mt-2 text-meta text-fg-muted" data-testid="suggested-mtpd">
                      {{ 'continuity.bias.suggestedMtpd' | transloco }}
                      <span class="font-semibold text-fg"
                        ><app-continuity-duration [minutes]="b.suggested_mtpd_minutes"
                      /></span>
                      @if (b.mtpd_minutes !== null && b.mtpd_minutes > b.suggested_mtpd_minutes) {
                        ·
                        <span class="text-warn-ink">{{
                          'continuity.bias.mtpdLonger' | transloco
                        }}</span>
                      }
                    </p>
                  }
                } @else {
                  <p class="text-meta text-fg-muted">
                    {{ 'continuity.bias.noTimeline' | transloco }}
                  </p>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.form.sections.targets' | transloco }}
                </h2>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-body sm:grid-cols-3">
                  <div>
                    <dt class="text-meta text-fg-muted">
                      <app-term key="mtpd" scope="continuity">{{
                        'continuity.fields.mtpd' | transloco
                      }}</app-term>
                    </dt>
                    <dd class="text-card font-semibold text-fg">
                      <app-continuity-duration [minutes]="b.mtpd_minutes" />
                    </dd>
                  </div>
                  <div>
                    <dt class="text-meta text-fg-muted">
                      <app-term key="rto" scope="continuity">{{
                        'continuity.fields.rto' | transloco
                      }}</app-term>
                    </dt>
                    <dd class="text-card font-semibold text-fg">
                      <app-continuity-duration [minutes]="b.rto_minutes" />
                    </dd>
                  </div>
                  <div>
                    <dt class="text-meta text-fg-muted">
                      <app-term key="rpo" scope="continuity">{{
                        'continuity.fields.rpo' | transloco
                      }}</app-term>
                    </dt>
                    <dd class="text-card font-semibold text-fg">
                      <app-continuity-duration [minutes]="b.rpo_minutes" />
                    </dd>
                  </div>
                  @for (field of textFields; track field.key) {
                    @if (b[field.key]; as text) {
                      <div class="sm:col-span-3">
                        <dt class="text-meta text-fg-muted">{{ field.label | transloco }}</dt>
                        <dd class="whitespace-pre-line text-fg">{{ text }}</dd>
                      </div>
                    }
                  }
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.form.sections.dependencies' | transloco }}
                </h2>
                @if (b.dependencies.length === 0) {
                  <p class="text-ui text-fg-muted">
                    {{ 'continuity.form.noDependencies' | transloco }}
                  </p>
                } @else {
                  <ul class="flex flex-col gap-2" data-testid="dependencies">
                    @for (dep of b.dependencies; track $index) {
                      <li class="rounded-tile border border-border px-3 py-2 text-ui">
                        <span class="flex flex-wrap items-center gap-2">
                          <app-badge>{{
                            'continuity.dependencyKind.' + dep.kind | transloco
                          }}</app-badge>
                          @if (dep.ict_system_id) {
                            <a
                              [routerLink]="['/continuity/ict-systems', dep.ict_system_id]"
                              class="font-semibold text-accent hover:underline"
                            >
                              <span class="font-mono text-meta">{{ dep.ict_system_code }}</span>
                              {{ dep.name }}
                            </a>
                            @if (dep.ict_readiness) {
                              <app-status-badge
                                [meaning]="readinessBadge(dep).meaning"
                                [value]="readinessBadge(dep).value"
                                [labelKey]="'continuity.readiness.' + dep.ict_readiness"
                              />
                            }
                          } @else if (dep.entity) {
                            <app-entity-chip [ref]="dep.entity" [statusText]="true" />
                          } @else {
                            <span class="font-semibold text-fg">{{ dep.name }}</span>
                            @if (dep.entity_id) {
                              <span class="text-meta text-fg-subtle">{{
                                'continuity.bias.linkHidden' | transloco
                              }}</span>
                            }
                          }
                        </span>
                        @if (dep.ict_issues?.length) {
                          <span class="mt-1 block text-meta text-warn-ink">
                            {{ issueText(dep) }}
                          </span>
                        }
                        @if (dep.notes) {
                          <span class="mt-1 block text-fg-muted">{{ dep.notes }}</span>
                        }
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.bias.coveringPlans' | transloco }}
                </h2>
                @if (b.plans.length === 0) {
                  <p class="text-ui text-fg-muted">{{ 'continuity.bias.noPlans' | transloco }}</p>
                  @if (canWrite() && b.status !== 'retired') {
                    <div class="mt-3">
                      <app-button size="sm" (click)="createPlan(b)" data-testid="create-plan">
                        <app-icon name="plus" [size]="14" />
                        {{ 'continuity.bias.createPlan' | transloco }}
                      </app-button>
                    </div>
                  }
                } @else {
                  <ul class="flex flex-col gap-1.5">
                    @for (p of b.plans; track p.id) {
                      <li class="flex flex-wrap items-center gap-2 text-ui">
                        <a
                          [routerLink]="['/continuity/plans', p.id]"
                          class="text-fg hover:underline"
                        >
                          <span class="font-mono text-meta text-fg-muted">{{ p.code }}</span>
                          {{ p.title }}
                        </a>
                        @if (p.status) {
                          <app-status-badge
                            meaning="lifecycle"
                            [value]="p.status"
                            [labelKey]="'continuity.status.' + p.status"
                          />
                        }
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-why-it-matters scope="continuity" page="biaDetail" />
            </div>

            <app-continuity-learn-more
              aside-learn
              [lessons]="['recovery-targets', 'writing-a-plan']"
            />

            <div tasks>
              <app-entity-tasks
                entityType="bia"
                [entityId]="b.id"
                [canCreate]="b.can_edit"
                [entityLabel]="b.code + ' ' + b.title"
              />
            </div>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'continuity.bias.deleteTitle' | transloco"
            [message]="
              'continuity.common.deleteMessage' | transloco: { code: b.code, title: b.title }
            "
            [confirmLabel]="'continuity.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove(b)"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class BiaDetailPage {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly flows = inject(CreateFlowService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly panel = viewChild(ContinuityControlledPanel);

  protected readonly nav = CONTINUITY_NAV;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = BIA_FIELD_LABELS;
  protected readonly impactCategories = IMPACT_CATEGORIES;
  protected readonly intervals = IMPACT_INTERVALS;
  protected readonly statusBadge = (b: BiaDetail) => badge.controlled(b.status);
  protected readonly impactBadge = badge.impact;
  protected readonly readinessBadge = (d: DependencyOut) =>
    badge.readiness(d.ict_readiness ?? null);
  protected readonly textFields = [
    { key: 'mbco', label: 'continuity.fields.mbco' },
    { key: 'peak_periods', label: 'continuity.fields.peakPeriods' },
    { key: 'workarounds', label: 'continuity.fields.workarounds' },
  ] as const;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly bia = signal<BiaDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));
  protected readonly canWrite = computed(() => this.permissions().includes('continuity:write'));
  protected readonly crumbs = computed(() => recordCrumbs('bias', this.bia()?.code ?? ''));

  /** Requirements the record documents, for the assistant's page context. */
  private readonly requirements = confirmedRequirementRefs('bia', () => this.id());

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const b = this.bia();
      return {
        module: 'continuity',
        entityType: 'bia',
        entityId: this.id(),
        view: 'detail',
        requirements: this.requirements(),
        title: b ? `${b.code} ${b.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected hasTimeline(b: BiaDetail): boolean {
    return IMPACT_INTERVALS.some((i) => typeof b.impact_timeline?.[i] === 'number');
  }

  protected timelineValue(
    b: BiaDetail,
    interval: (typeof IMPACT_INTERVALS)[number],
  ): number | null {
    const v = b.impact_timeline?.[interval];
    return typeof v === 'number' ? v : null;
  }

  /** "RTO too long · Never tested" for an ICT dependency. */
  protected issueText(dep: DependencyOut): string {
    return (dep.ict_issues ?? [])
      .map((issue) => this.language.translate('continuity.readinessIssue.' + issue))
      .join(' · ');
  }

  protected edit(b: BiaDetail): void {
    void this.router.navigate(['/continuity/bias', b.id, 'edit']);
  }

  protected askSummary(): void {
    this.ask.showWith(this.language.translate('continuity.ai.prompts.summariseBia'));
  }

  /** A plan covering this BIA, prefilled from it (the `bia.to_plan` flow). */
  protected createPlan(b: BiaDetail): void {
    void this.flows.start('bia.to_plan', 'bia', b.id).then((ok) => {
      if (!ok) {
        void this.router.navigate(['/continuity/plans/new'], { queryParams: { bia: b.id } });
      }
    });
  }

  protected act(b: BiaDetail, request: ControlledActionRequest): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    this.api.biaAction(orgId, b.id, request.action, request.note).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.panel()?.close();
        this.bia.set(updated);
        this.notifications.success('continuity.actionDone.' + request.action, { code: b.code });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.panel()?.close();
        this.actionError.set(continuityErrorKey(err));
      },
    });
  }

  protected remove(b: BiaDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteBia(orgId, b.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('continuity.common.deleted', { code: b.code });
        void this.router.navigate(['/continuity/bias']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getBia(orgId, id).subscribe({
      next: (b) => {
        this.bia.set(b);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
