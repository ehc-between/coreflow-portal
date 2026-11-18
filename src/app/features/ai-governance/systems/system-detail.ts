import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeIn } from '../../../core/tasks/task.models';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { Term } from '../../../shared/guidance/term';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import { AiSystem, AssessmentSummary, Obligation } from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  AI_SYSTEM_ENTITY,
  assessmentStatusKey,
  assessmentStatusValue,
  kindKey,
  riskExplainKey,
  riskKey,
  riskValue,
  roleKey,
  statusKey,
  systemStatusValue,
  transparencyKey,
} from '../data/ai-governance-display';
import { AI_GOV_ROOT } from '../ui/ai-gov-page';
import { downloadBlob } from '../ui/download';
import { AiObligationList } from '../ui/obligation-list';
import { AiSystemIncidents } from './system-incidents';
import { AiSystemMonitoring } from './system-monitoring';
import { AiSystemReviewSchedule } from './system-review-schedule';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot fields -> labels (for the revisions tab). */
export const SYSTEM_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'aiGovernance.fields.name',
  description: 'aiGovernance.fields.description',
  intended_purpose: 'aiGovernance.fields.intendedPurpose',
  ai_act_role: 'aiGovernance.fields.role',
  status: 'aiGovernance.fields.status',
  provider_name: 'aiGovernance.fields.provider',
  supplier_id: 'aiGovernance.fields.supplier',
  processing_activity_id: 'aiGovernance.fields.processingActivity',
  models: 'aiGovernance.fields.models',
  data_categories: 'aiGovernance.fields.dataCategories',
  uses_personal_data: 'aiGovernance.fields.usesPersonalData',
  owner_user_id: 'aiGovernance.fields.owner',
  overseer_user_ids: 'aiGovernance.fields.overseers',
  department_id: 'aiGovernance.fields.department',
  next_review_at: 'aiGovernance.fields.nextReview',
  risk_class: 'aiGovernance.fields.riskClass',
  documentation: 'aiGovernance.fields.documentation',
  obligations: 'aiGovernance.fields.obligations',
  obligation_state: 'aiGovernance.fields.obligations',
  monitoring_metrics: 'aiGovernance.fields.monitoringMetrics',
};

/**
 * `/ai-governance/systems/:id`: one AI system and everything connected to it.
 * What it is and where it comes from (supplier, processing activity, DPIAs,
 * owner and the people who oversee it), its AI Act classification explained
 * for the org's role, the obligations as a to-do list (status, evidence, task),
 * the provider's duties when the org only deploys it, assessments (FRIA only
 * offered where it can apply), documentation progress, risks, monitoring and
 * incidents. The aside shows the requirements it documents, its connections
 * and the review plan; "Lag ny fra denne" creates an AI incident, AI risk,
 * DPIA, assessment or task with the system filled in.
 */
@Component({
  selector: 'app-ai-system-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AiAssistButton,
    Term,
    EntityChip,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    SupportsRequirements,
    EntityTasks,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ProgressBar,
    StatusBadge,
    AiObligationList,
    AiSystemIncidents,
    AiSystemMonitoring,
    AiSystemReviewSchedule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loadError()) {
      <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
        <app-error-state (retry)="reload.update((n) => n + 1)" />
        <a
          routerLink="/ai-governance/systems"
          class="mt-3 inline-block text-ui font-semibold text-accent hover:underline"
        >
          {{ 'aiGovernance.systems.backToList' | transloco }}
        </a>
      </div>
    } @else if (system(); as s) {
      <app-record-detail-layout
        entityType="ai_system"
        [entityId]="s.id"
        [title]="s.name"
        [breadcrumbs]="[
          root,
          { labelKey: 'aiGovernance.systems.title', link: '/ai-governance/systems' },
          { label: s.code },
        ]"
        settingsLink="/settings/modules/ai-governance"
        [tabs]="tabs"
        [canEdit]="store.canWrite()"
        [includeAudit]="store.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/ai-governance/systems"
        backLabelKey="aiGovernance.systems.backToList"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="system-code">{{ s.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ roleKey(s.ai_act_role) | transloco }}</span>
          <app-status-badge
            meaning="severity"
            [value]="riskValue(s.risk_class)"
            [labelKey]="riskKey(s.risk_class)"
            data-testid="system-risk"
          />
          <app-status-badge
            meaning="lifecycle"
            [value]="statusValue(s.status)"
            [labelKey]="statusKey(s.status)"
          />
          @if (s.fria_required) {
            <app-badge tone="warn" data-testid="system-fria-required">{{
              'aiGovernance.systemDetail.friaRequired' | transloco
            }}</app-badge>
          }
          @if (s.gpai) {
            <app-badge tone="neutral">{{ 'aiGovernance.result.gpai' | transloco }}</app-badge>
          }
          @if (s.is_builtin) {
            <app-badge tone="neutral">{{ 'aiGovernance.systems.builtin' | transloco }}</app-badge>
          }
          <app-watch-button entityType="ai_system" [entityId]="s.id" />
        </ng-container>

        @if (store.canWrite()) {
          <app-button
            primary
            size="sm"
            [loading]="classifying()"
            (click)="classify(s)"
            data-testid="system-classify"
          >
            {{
              (s.risk_class === 'unclassified'
                ? 'aiGovernance.systemDetail.classify'
                : 'aiGovernance.systemDetail.reclassify'
              ) | transloco
            }}
          </app-button>
        }
        @if (store.canWrite()) {
          <a
            secondary
            [routerLink]="['/ai-governance/systems', s.id, 'edit']"
            class="inline-flex h-8 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2"
            data-testid="system-edit"
          >
            {{ 'aiGovernance.common.edit' | transloco }}
          </a>
        }
        <button appMenuItem overflow (click)="askAbout(s)">
          {{ 'aiGovernance.ai.askAboutSystem' | transloco }}
        </button>
        <button appMenuItem overflow (click)="exportFile(s)">
          {{ 'aiGovernance.docs.export' | transloco }}
        </button>
        @if (store.canManage()) {
          <button appMenuItem overflow [danger]="true" (click)="confirmDelete.set(true)">
            {{ 'aiGovernance.common.delete' | transloco }}
          </button>
        }

        <div class="flex flex-col gap-5">
          <app-card data-testid="system-about">
            <h2 class="mb-3 font-display text-section font-bold text-fg">
              {{ 'aiGovernance.systemDetail.about' | transloco }}
            </h2>
            <app-field-list>
              <app-field-item
                labelKey="aiGovernance.fields.intendedPurpose"
                [value]="s.intended_purpose"
                [wide]="true"
                [multiline]="true"
              />
              @if (s.description && s.description !== s.intended_purpose) {
                <app-field-item
                  labelKey="aiGovernance.fields.description"
                  [value]="s.description"
                  [wide]="true"
                  [multiline]="true"
                />
              }
              <app-field-item labelKey="aiGovernance.fields.supplier">
                @if (s.supplier; as sup) {
                  <app-entity-chip [ref]="sup" data-testid="system-supplier" />
                } @else if (s.provider_name) {
                  <span>{{ s.provider_name }}</span>
                } @else {
                  <span class="text-fg-muted">{{ 'aiGovernance.common.notSet' | transloco }}</span>
                }
              </app-field-item>
              <app-field-item
                labelKey="aiGovernance.fields.models"
                [value]="s.models.length ? s.models.join(', ') : null"
              />
              <app-field-item
                labelKey="aiGovernance.fields.dataCategories"
                [value]="s.data_categories.length ? s.data_categories.join(', ') : null"
              />
              <app-field-item labelKey="aiGovernance.fields.usesPersonalData">
                <div class="flex flex-col gap-1.5">
                  <span>{{
                    (s.uses_personal_data ? 'aiGovernance.common.yes' : 'aiGovernance.common.no')
                      | transloco
                  }}</span>
                  @if (s.processing_activity; as ropa) {
                    <app-entity-chip [ref]="ropa" data-testid="system-ropa" />
                  } @else if (s.uses_personal_data) {
                    <span class="text-meta text-warn-ink">{{
                      'aiGovernance.systemDetail.noRopa' | transloco
                    }}</span>
                  }
                </div>
              </app-field-item>
              @if (s.uses_personal_data || s.dpias?.length) {
                <app-field-item labelKey="aiGovernance.fields.dpia" [wide]="true">
                  <div class="flex flex-wrap items-center gap-2" data-testid="system-dpias">
                    @for (d of s.dpias ?? []; track d.entity_id) {
                      <app-entity-chip [ref]="d" [statusText]="true" />
                    } @empty {
                      <span class="text-fg-muted">
                        {{
                          (s.dpia_recommended
                            ? 'aiGovernance.systemDetail.dpiaRecommended'
                            : 'aiGovernance.systemDetail.noDpia'
                          ) | transloco
                        }}
                      </span>
                      @if (store.canWrite()) {
                        <app-button
                          size="sm"
                          variant="secondary"
                          [loading]="flows.starting() === 'ai_system.to_dpia'"
                          (click)="startFlow('ai_system.to_dpia', s)"
                        >
                          {{ 'aiGovernance.systemDetail.createDpia' | transloco }}
                        </app-button>
                      }
                    }
                  </div>
                </app-field-item>
              }
              <app-field-item
                labelKey="aiGovernance.fields.owner"
                [value]="s.owner?.name"
                empty="none"
              />
              <app-field-item
                labelKey="aiGovernance.fields.department"
                [value]="departmentName()"
              />
              <app-field-item labelKey="aiGovernance.fields.overseers" [wide]="true">
                @if (s.overseers?.length) {
                  <ul class="flex flex-wrap gap-1.5" data-testid="system-overseers">
                    @for (o of s.overseers; track o.id) {
                      <li
                        class="inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-ui"
                        [class]="
                          o.literacy_valid
                            ? 'border-border text-fg'
                            : 'border-warn/40 bg-warn-soft text-fg'
                        "
                      >
                        {{ o.name }}
                        @if (!o.literacy_valid) {
                          <span class="text-meta text-warn-ink"
                            >· {{ 'aiGovernance.systemDetail.literacyMissing' | transloco }}</span
                          >
                        }
                      </li>
                    }
                  </ul>
                } @else {
                  <span class="text-fg-muted">{{
                    'aiGovernance.systemDetail.noOverseers' | transloco
                  }}</span>
                }
              </app-field-item>
              <app-field-item
                labelKey="aiGovernance.fields.nextReview"
                [value]="s.next_review_at ? (s.next_review_at | localDay) : null"
              />
            </app-field-list>
          </app-card>

          <app-card data-testid="system-classification">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-section font-bold text-fg">
                {{ 'aiGovernance.systemDetail.classification' | transloco }}
              </h2>
              @if (s.classification; as c) {
                <a
                  [routerLink]="['/ai-governance/assessments', c.id]"
                  class="inline-flex min-h-6 items-center gap-1.5 text-ui font-semibold text-accent hover:underline"
                >
                  <span class="font-mono text-meta">{{ c.code }}</span>
                  <app-status-badge
                    meaning="lifecycle"
                    [value]="assessmentValue(c.status)"
                    [labelKey]="assessmentStatusKey(c.status)"
                  />
                </a>
              }
            </div>
            @if (s.risk_class === 'unclassified') {
              <p class="text-body text-fg-muted">
                {{ 'aiGovernance.systemDetail.unclassifiedHint' | transloco }}
              </p>
            } @else {
              <p class="text-body text-fg">
                {{ explainKey(s) | transloco }}
              </p>
              @if (s.transparency.length) {
                <p class="mt-2 text-ui text-fg-muted">
                  {{ 'aiGovernance.systemDetail.transparency' | transloco }}:
                  @for (t of s.transparency; track t; let last = $last) {
                    {{ transparencyKey(t) | transloco }}{{ last ? '' : ', ' }}
                  }
                </p>
              }
              @if (s.classified_at) {
                <p class="mt-2 text-meta text-fg-subtle">
                  {{
                    'aiGovernance.systemDetail.classifiedOn'
                      | transloco: { date: (s.classified_at | localDate) }
                  }}
                </p>
              }
              @if (s.fria_applicable) {
                <p
                  class="mt-3 rounded-tile px-3 py-2 text-ui"
                  [class]="s.fria_required ? 'bg-warn-soft text-fg' : 'bg-surface-2 text-fg-muted'"
                  data-testid="system-fria"
                >
                  <app-term scope="ai-governance" key="fria">FRIA</app-term>:
                  {{
                    (s.fria_required
                      ? hasFria()
                        ? 'aiGovernance.systemDetail.friaDone'
                        : 'aiGovernance.systemDetail.friaRequiredBody'
                      : 'aiGovernance.systemDetail.friaVoluntary'
                    ) | transloco
                  }}
                </p>
              }
            }
          </app-card>

          @if (s.risk_class !== 'unclassified') {
            <app-card data-testid="system-obligations">
              <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 class="font-display text-section font-bold text-fg">
                  {{ 'aiGovernance.systemDetail.obligations' | transloco }}
                </h2>
                @if (s.obligations.length) {
                  <app-ai-assist-button
                    assist="ai_governance.explain_obligations"
                    labelKey="aiGovernance.ai.explainObligations"
                    [input]="{ ai_system_id: s.id }"
                    entityType="ai_system"
                    [entityId]="s.id"
                    (text)="explanation.set($event)"
                  />
                }
              </div>
              @if (obligationTotals(); as t) {
                @if (t.total > 0) {
                  <div class="mb-2 flex items-center gap-3">
                    <span class="min-w-0 flex-1">
                      <app-progress-bar
                        [value]="t.total ? (t.met / t.total) * 100 : 0"
                        [label]="'aiGovernance.systemDetail.obligationsMet' | transloco: t"
                      />
                    </span>
                    <span class="text-ui font-semibold text-fg" data-testid="obligations-met">{{
                      'aiGovernance.systemDetail.obligationsMet' | transloco: t
                    }}</span>
                  </div>
                }
              }
              @if (explanation()) {
                <div class="my-3 rounded-tile border border-border bg-surface-2 p-3">
                  <div class="mb-1 flex items-center justify-between gap-2">
                    <h3 class="text-ui font-bold text-fg">
                      {{ 'aiGovernance.ai.explanationTitle' | transloco }}
                    </h3>
                    <button
                      type="button"
                      class="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-subtle hover:text-fg"
                      [attr.aria-label]="'aiGovernance.common.close' | transloco"
                      (click)="explanation.set('')"
                    >
                      <app-icon name="x" [size]="14" />
                    </button>
                  </div>
                  <div
                    class="cf-prose text-ui leading-relaxed text-fg"
                    [innerHTML]="explanation() | appMarkdown"
                  ></div>
                  <p class="mt-2 text-meta text-fg-subtle">
                    {{ 'aiGovernance.ai.reviewNotice' | transloco }}
                  </p>
                </div>
              }
              <app-ai-obligation-list
                [obligations]="obligations()"
                [systemId]="s.id"
                [canWrite]="store.canWrite()"
                (changed)="obligations.set($event)"
              />
              @if (s.provider_obligations?.length) {
                <div
                  class="mt-4 border-t border-border pt-4"
                  data-testid="system-provider-obligations"
                >
                  <h3 class="text-card font-semibold text-fg">
                    {{ 'aiGovernance.result.providerObligations' | transloco }}
                  </h3>
                  <p class="mb-1 text-meta text-fg-muted">
                    {{
                      (s.is_builtin
                        ? 'aiGovernance.systemDetail.providerBuiltin'
                        : 'aiGovernance.result.providerObligationsHint'
                      ) | transloco
                    }}
                  </p>
                  <app-ai-obligation-list
                    [obligations]="s.provider_obligations!"
                    [tracked]="false"
                  />
                </div>
              }
            </app-card>
          }

          <app-card data-testid="system-assessments">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-section font-bold text-fg">
                {{ 'aiGovernance.systemDetail.assessments' | transloco }}
              </h2>
              @if (store.canWrite()) {
                <div class="flex flex-wrap gap-2">
                  <a
                    routerLink="/ai-governance/assessments/new"
                    [queryParams]="{ system: s.id, kind: 'impact' }"
                    class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
                  >
                    {{ 'aiGovernance.systemDetail.newImpact' | transloco }}
                  </a>
                  @if (s.fria_applicable) {
                    <a
                      routerLink="/ai-governance/assessments/new"
                      [queryParams]="{ system: s.id, kind: 'fria' }"
                      class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
                      data-testid="system-new-fria"
                    >
                      {{ 'aiGovernance.systemDetail.newFria' | transloco }}
                    </a>
                  }
                </div>
              }
            </div>
            @if (assessments().length === 0) {
              <p class="text-ui text-fg-muted">
                {{ 'aiGovernance.systemDetail.noAssessments' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border">
                @for (a of assessments(); track a.id) {
                  <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                    <a
                      [routerLink]="['/ai-governance/assessments', a.id]"
                      class="min-w-0 truncate text-body font-semibold text-fg hover:underline"
                    >
                      <span class="mr-1 font-mono text-meta text-fg-subtle">{{ a.code }}</span>
                      {{ a.title }}
                    </a>
                    <span class="flex flex-wrap items-center gap-2">
                      <span class="text-meta text-fg-muted">{{ kindKey(a.kind) | transloco }}</span>
                      @if (a.review_flag) {
                        <app-badge tone="warn">{{
                          'aiGovernance.assessments.needsReview' | transloco
                        }}</app-badge>
                      }
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="assessmentValue(a.status)"
                        [labelKey]="assessmentStatusKey(a.status)"
                      />
                    </span>
                  </li>
                }
              </ul>
            }
          </app-card>

          <app-card data-testid="system-documentation">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h2 class="font-display text-section font-bold text-fg">
                  {{ 'aiGovernance.systemDetail.documentation' | transloco }}
                </h2>
                @if (s.documentation_progress; as p) {
                  <p class="mt-1 text-ui text-fg-muted">
                    {{
                      'aiGovernance.systemDetail.governanceProgress'
                        | transloco: { done: p.governance_done, total: p.governance_total }
                    }}
                    ·
                    {{
                      (p.annex_iv_required
                        ? 'aiGovernance.systemDetail.annexProgress'
                        : 'aiGovernance.systemDetail.annexOptional'
                      ) | transloco: { done: p.annex_iv_done, total: p.annex_iv_total }
                    }}
                  </p>
                } @else {
                  <p class="mt-1 text-ui text-fg-muted">
                    {{ 'aiGovernance.systemDetail.documentationHint' | transloco }}
                  </p>
                }
              </div>
              <a
                [routerLink]="['/ai-governance/systems', s.id, 'documentation']"
                class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
                data-testid="system-documentation-link"
              >
                <app-icon name="documents" [size]="14" />
                {{ 'aiGovernance.systemDetail.openDocumentation' | transloco }}
              </a>
            </div>
          </app-card>

          <app-card data-testid="system-risks">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h2 class="font-display text-section font-bold text-fg">
                  {{ 'aiGovernance.systemDetail.risks' | transloco }}
                </h2>
                <p class="mt-1 text-ui text-fg-muted">
                  {{ 'aiGovernance.systemDetail.risksHint' | transloco }}
                </p>
              </div>
              @if (store.canWrite()) {
                <app-button
                  size="sm"
                  variant="secondary"
                  [loading]="flows.starting() === 'ai_system.to_risk'"
                  (click)="startFlow('ai_system.to_risk', s)"
                  data-testid="system-create-risk"
                >
                  <app-icon name="plus" [size]="14" />
                  {{ 'aiGovernance.systemDetail.createRisk' | transloco }}
                </app-button>
              }
            </div>
          </app-card>

          <app-ai-system-monitoring
            [systemId]="s.id"
            [canWrite]="store.canWrite()"
            [metrics]="s.monitoring_metrics ?? []"
            [highRisk]="s.risk_class === 'high'"
            (reportIncident)="startFlow('ai_system.to_incident', s)"
          />
          <app-ai-system-incidents
            [systemId]="s.id"
            [canWrite]="store.canWrite()"
            [starting]="flows.starting() === 'ai_system.to_incident'"
            (report)="startFlow('ai_system.to_incident', s)"
          />
        </div>

        <div tasks>
          <app-entity-tasks
            entityType="ai_system"
            [entityId]="s.id"
            [canCreate]="store.canWrite()"
            [defaultAssignee]="defaultAssignee()"
            [entityLabel]="s.code + ' ' + s.name"
          />
        </div>

        <app-supports-requirements
          aside-requirements
          entityType="ai_system"
          [entityId]="s.id"
          [canEdit]="store.canWrite()"
          [frameworks]="frameworks"
        />

        <div aside class="flex flex-col gap-4">
          <app-ai-system-review-schedule [systemId]="s.id" [canWrite]="store.canWrite()" />
        </div>

        <app-help-strip
          aside-learn
          [scope]="scope"
          page="systemDetail"
          lesson="ai-act-obligations"
        />
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="confirmDelete()"
        [title]="'aiGovernance.systemDetail.deleteTitle' | transloco"
        [message]="'aiGovernance.systemDetail.deleteMessage' | transloco: { name: s.name }"
        [confirmLabel]="'aiGovernance.common.delete' | transloco"
        [cancelLabel]="'aiGovernance.common.cancel' | transloco"
        confirmVariant="danger"
        [busy]="deleting()"
        (confirmed)="remove(s)"
        (cancelled)="confirmDelete.set(false)"
      />
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
    }
  `,
})
export class AiSystemDetail {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly assigneeOptions = inject(AssigneeOptionsService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  protected readonly flows = inject(CreateFlowService);
  protected readonly store = inject(AiGovernanceStore);

  readonly id = input.required<string>();

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly root = AI_GOV_ROOT;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = SYSTEM_FIELD_LABELS;
  protected readonly frameworks = ['iso42001', 'eu_ai_act'] as const;
  protected readonly riskKey = riskKey;
  protected readonly riskValue = riskValue;
  protected readonly statusKey = statusKey;
  protected readonly statusValue = systemStatusValue;
  protected readonly roleKey = roleKey;
  protected readonly kindKey = kindKey;
  protected readonly assessmentStatusKey = assessmentStatusKey;
  protected readonly assessmentValue = assessmentStatusValue;
  protected readonly transparencyKey = transparencyKey;

  protected readonly system = signal<AiSystem | null>(null);
  protected readonly obligations = signal<readonly Obligation[]>([]);
  protected readonly assessments = signal<readonly AssessmentSummary[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly explanation = signal('');
  protected readonly confirmDelete = signal(false);
  protected readonly deleting = signal(false);
  protected readonly classifying = signal(false);
  protected readonly reload = signal(0);

  /** Met vs. counted obligations (not-relevant ones do not count). */
  protected readonly obligationTotals = computed(() => {
    const list = this.obligations();
    const counted = list.filter((o) => o.status !== 'not_relevant');
    return { met: counted.filter((o) => o.status === 'met').length, total: counted.length };
  });
  protected readonly hasFria = computed(() =>
    this.assessments().some((a) => a.kind === 'fria' && a.status !== 'draft'),
  );
  protected readonly departmentName = computed(() => {
    const id = this.system()?.department_id;
    if (!id) {
      return null;
    }
    return (
      this.assigneeOptions.options().departments.find((d) => d.value === `department:${id}`)
        ?.label ?? null
    );
  });
  protected readonly defaultAssignee = computed<AssigneeIn | null>(() => {
    const owner = this.system()?.owner;
    return owner ? { type: 'user', value: owner.id } : null;
  });
  /** The clauses the system's obligations come from (assistant page context). */
  private readonly obligationRefs = computed(() =>
    [...new Set(this.obligations().map((o) => o.clause_ref || o.ref))].filter(Boolean),
  );

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_SYSTEM_ENTITY,
      entityId: this.id(),
      view: 'detail',
      title: this.titleOf(this.system()),
      requirements: this.obligationRefs(),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      this.reload();
      this.language.active();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.assigneeOptions.ensureLoaded();
        this.loadError.set(null);
        this.api.getSystem(orgId, id).subscribe({
          next: (system) => {
            this.system.set(system);
            this.obligations.set(system.obligations);
          },
          error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
        });
        this.api.listAssessments(orgId, { ai_system_id: id, limit: 50 }).subscribe({
          next: (page) => this.assessments.set(page.items),
          error: () => this.assessments.set([]),
        });
      });
    });
  }

  private titleOf(s: AiSystem | null): string | null {
    return s ? `${s.code} ${s.name}` : null;
  }

  protected explainKey(s: AiSystem): string {
    return riskExplainKey(s.risk_class, s.ai_act_role, s.is_builtin);
  }

  /** Classify / reclassify: open the wizard on a draft prefilled with the current answers. */
  protected classify(s: AiSystem): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.classifying()) {
      return;
    }
    this.classifying.set(true);
    this.api.reclassify(orgId, s.id, this.language.active()).subscribe({
      next: (draft) => {
        this.classifying.set(false);
        void this.router.navigate(['/ai-governance/systems', s.id, 'classify'], {
          queryParams: { assessment: draft.id },
        });
      },
      error: (err: unknown) => {
        this.classifying.set(false);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }

  protected startFlow(key: string, s: AiSystem): void {
    void this.flows.start(key, AI_SYSTEM_ENTITY, s.id);
  }

  protected askAbout(system: AiSystem): void {
    this.ask.askAbout(
      this.language.translate('aiGovernance.ai.prompts.askAboutSystem', {
        code: system.code,
        name: system.name,
      }),
    );
  }

  protected exportFile(s: AiSystem): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.api.exportTechnicalDocumentation(orgId, s.id, this.language.active()).subscribe({
      next: (blob) => downloadBlob(blob, `${s.code}-technical-file.pdf`),
      error: (err: unknown) => this.notifications.error(aiGovernanceErrorKey(err)),
    });
  }

  protected remove(system: AiSystem): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.api.deleteSystem(orgId, system.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('aiGovernance.systemDetail.deleted', { code: system.code });
        void this.router.navigate(['/ai-governance/systems']);
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}
