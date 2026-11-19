import {
  ChangeDetectionStrategy,
  Component,
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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeIn } from '../../../core/tasks/task.models';
import { AskPanelService } from '../../ask/ask-panel.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { Term } from '../../../shared/guidance/term';
import { EntityChip } from '../../../shared/kit/entity-chip';
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
  StatusLineTone,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { OutputsPanel } from '../../../shared/outputs';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
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

/** Whether a stored date (date, naive UTC or zoned ISO) lies in the past. */
export function isPast(value: string | null | undefined, now: Date = new Date()): boolean {
  if (!value) {
    return false;
  }
  const iso = value.length <= 10 || /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const time = new Date(iso).getTime();
  return !Number.isNaN(time) && time < now.getTime();
}

/** Met vs. counted obligations (not-relevant ones do not count). */
export function obligationCounts(list: readonly Obligation[]): { met: number; total: number } {
  const counted = list.filter((o) => o.status !== 'not_relevant');
  return { met: counted.filter((o) => o.status === 'met').length, total: counted.length };
}

/** The "how is this system doing" sentence (docs/ux-guide.md §2.7 rule 4). */
export function systemStatusSentence(
  s: Pick<AiSystem, 'risk_class'>,
  counts: { met: number; total: number },
): { key: string; tone: StatusLineTone } {
  if (s.risk_class === 'unclassified') {
    return { key: 'aiGovernance.systemDetail.statusLine.unclassified', tone: 'warn' };
  }
  if (s.risk_class === 'prohibited') {
    return { key: 'aiGovernance.systemDetail.statusLine.prohibited', tone: 'fail' };
  }
  if (counts.total === 0) {
    return { key: 'aiGovernance.systemDetail.statusLine.none', tone: 'neutral' };
  }
  return counts.met >= counts.total
    ? { key: 'aiGovernance.systemDetail.statusLine.done', tone: 'pass' }
    : { key: 'aiGovernance.systemDetail.statusLine.open', tone: 'warn' };
}

/** What an AI system still needs ("Oppfølging", docs/ux-guide.md §2.7). */
export function systemMissing(
  s: AiSystem,
  ctx: {
    readonly editLink: readonly unknown[];
    readonly counts: { met: number; total: number };
    readonly hasFria: boolean;
    readonly classify: (() => void) | null;
    readonly createDpia: (() => void) | null;
    readonly showObligations: () => void;
  },
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (s.risk_class === 'unclassified' && ctx.classify) {
    items.push({
      key: 'classify',
      labelKey: 'aiGovernance.systemDetail.missing.classify',
      action: ctx.classify,
    });
  }
  if (isPast(s.next_review_at)) {
    items.push({
      key: 'review',
      labelKey: 'aiGovernance.systemDetail.missing.review',
      link: ctx.editLink,
    });
  }
  const open = ctx.counts.total - ctx.counts.met;
  if (s.risk_class !== 'unclassified' && open > 0) {
    items.push({
      key: 'obligations',
      labelKey:
        open === 1
          ? 'aiGovernance.systemDetail.missing.obligationsOne'
          : 'aiGovernance.systemDetail.missing.obligations',
      params: { count: open },
      action: ctx.showObligations,
    });
  }
  if (s.fria_required && !ctx.hasFria) {
    items.push({
      key: 'fria',
      labelKey: 'aiGovernance.systemDetail.missing.fria',
      link: ['/ai-governance/assessments/new'],
      queryParams: { system: s.id, kind: 'fria' },
    });
  }
  if (!s.intended_purpose?.trim()) {
    items.push({
      key: 'purpose',
      labelKey: 'aiGovernance.systemDetail.missing.purpose',
      link: ctx.editLink,
    });
  }
  if (!s.owner) {
    items.push({
      key: 'owner',
      labelKey: 'aiGovernance.systemDetail.missing.owner',
      link: ctx.editLink,
    });
  }
  if (!s.is_builtin && !s.overseers?.length) {
    items.push({
      key: 'overseers',
      labelKey: 'aiGovernance.systemDetail.missing.overseers',
      link: ctx.editLink,
    });
  }
  const untrained = (s.overseers ?? []).filter((o) => !o.literacy_valid).length;
  if (untrained > 0) {
    items.push({
      key: 'literacy',
      labelKey: 'aiGovernance.systemDetail.missing.literacy',
      params: { count: untrained },
      link: ['/ai-governance/literacy'],
    });
  }
  if (s.uses_personal_data && !s.processing_activity) {
    items.push({
      key: 'ropa',
      labelKey: 'aiGovernance.systemDetail.missing.ropa',
      link: ctx.editLink,
    });
  }
  if (s.dpia_recommended && !s.dpias?.length && ctx.createDpia) {
    items.push({
      key: 'dpia',
      labelKey: 'aiGovernance.systemDetail.missing.dpia',
      action: ctx.createDpia,
    });
  }
  return items;
}

/**
 * `/ai-governance/systems/:id`: one AI system on the detail-page anatomy
 * (docs/ux-guide.md §2.7). "Hovedinformasjon" says what the system is used for,
 * what its AI Act risk class means for the org, where it comes from and who
 * oversees it; the status sentence says how far the obligations are. The other
 * facts (models, data, personal data, DPIA) sit in "Flere detaljer" with empty
 * ones hidden. Below: the obligations as a to-do list (the provider's duties
 * folded away), the assessments, documentation, monitoring, incidents and the
 * review plan. The "Oppfølging" card lists what is missing, the requirements,
 * the connections and owner / review dates. Assistant actions are in "Spør KI";
 * "Lag ny fra denne" creates an AI incident, AI risk, DPIA or task.
 */
@Component({
  selector: 'app-ai-system-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    Term,
    EntityChip,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    SupportsRequirements,
    EntityTasks,
    Badge,
    Button,
    Card,
    OutputsPanel,
    ConfirmDialog,
    ErrorState,
    FieldItem,
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
      @let line = statusLine();
      <app-record-detail-layout
        [anatomy]="true"
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
        [missing]="missing()"
        backLink="/ai-governance/systems"
        backLabelKey="aiGovernance.systems.backToList"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="system-code">{{ s.code }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'aiGovernance.fields.system' | transloco }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            meaning="lifecycle"
            [value]="statusValue(s.status)"
            [labelKey]="statusKey(s.status)"
          />
          <app-status-badge
            meaning="severity"
            [value]="riskValue(s.risk_class)"
            [labelKey]="riskKey(s.risk_class)"
            data-testid="system-risk"
          />
          @if (reviewOverdue()) {
            <app-status-badge
              meaning="lifecycle"
              value="overdue"
              labelKey="aiGovernance.systemDetail.reviewOverdue"
            />
          }
        </ng-container>

        @let writable = store.canWrite();
        @let unclassified = s.risk_class === 'unclassified';
        @if (writable && unclassified) {
          <app-button
            primary
            [loading]="classifying()"
            (click)="classify(s)"
            data-testid="system-classify"
          >
            {{ 'aiGovernance.systemDetail.classify' | transloco }}
          </app-button>
        }
        @if (writable && unclassified) {
          <app-button secondary variant="secondary" (click)="edit(s)" data-testid="system-edit">
            {{ 'aiGovernance.common.edit' | transloco }}
          </app-button>
        }
        @if (writable && !unclassified) {
          <app-button primary (click)="edit(s)" data-testid="system-edit">
            {{ 'aiGovernance.common.edit' | transloco }}
          </app-button>
        }
        @if (writable && !unclassified) {
          <button
            appMenuItem
            overflow
            type="button"
            [disabled]="classifying()"
            (click)="classify(s)"
            data-testid="system-classify"
          >
            {{ 'aiGovernance.systemDetail.reclassify' | transloco }}
          </button>
        }
        <button appMenuItem overflow type="button" (click)="exportFile(s)">
          {{ 'aiGovernance.docs.export' | transloco }}
        </button>
        @if (store.canManage()) {
          <button
            appMenuItem
            overflow
            type="button"
            [danger]="true"
            (click)="confirmDelete.set(true)"
          >
            {{ 'aiGovernance.common.delete' | transloco }}
          </button>
        }

        <button appMenuItem ask type="button" (click)="askAbout(s)">
          <app-icon name="spark" [size]="15" />
          {{ 'aiGovernance.ai.askAboutSystem' | transloco }}
        </button>
        @if (s.risk_class !== 'unclassified' && s.obligations.length) {
          <button appMenuItem ask type="button" (click)="explainObligations()">
            <app-icon name="spark" [size]="15" />
            {{ 'aiGovernance.ai.explainObligations' | transloco }}
          </button>
        }

        <app-help-strip
          help
          [scope]="scope"
          page="systemDetail"
          lesson="ai-act-obligations"
          [subject]="s.name"
        />

        <app-record-lead
          record-lead
          [fillLink]="store.canWrite() ? editLink() : null"
          data-testid="system-lead"
        >
          <app-record-status-line status [tone]="line.tone" data-testid="system-status-line">
            {{
              line.key
                | transloco
                  : {
                      risk: (riskKey(s.risk_class) | transloco),
                      met: obligationTotals().met,
                      total: obligationTotals().total,
                      open: obligationTotals().total - obligationTotals().met,
                    }
            }}
          </app-record-status-line>
          <app-field-item
            size="lead"
            labelKey="aiGovernance.systemDetail.lead.purpose"
            [wide]="true"
            [value]="s.intended_purpose"
            [multiline]="true"
          />
          <app-field-item
            size="lead"
            labelKey="aiGovernance.systemDetail.lead.riskMeaning"
            [wide]="true"
            data-testid="system-classification"
          >
            @if (s.risk_class !== 'unclassified') {
              <span class="flex flex-col gap-2">
                <span>{{ explainKey(s) | transloco }}</span>
                @if (s.transparency.length) {
                  <span class="text-ui text-fg-muted">
                    {{ 'aiGovernance.systemDetail.transparency' | transloco }}:
                    @for (t of s.transparency; track t; let last = $last) {
                      {{ transparencyKey(t) | transloco }}{{ last ? '' : ', ' }}
                    }
                  </span>
                }
                @if (s.fria_applicable) {
                  <span
                    class="rounded-tile px-3 py-2 text-ui"
                    [class]="
                      s.fria_required && !hasFria()
                        ? 'bg-warn-soft text-fg'
                        : 'bg-surface-2 text-fg-muted'
                    "
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
                  </span>
                }
                @if (s.classification; as c) {
                  <a
                    [routerLink]="['/ai-governance/assessments', c.id]"
                    class="inline-flex flex-wrap items-center gap-2 text-ui text-fg-muted hover:text-accent"
                    data-testid="system-classification-link"
                  >
                    <app-icon name="checkcircle" [size]="14" />
                    <span>{{
                      s.classified_at
                        ? ('aiGovernance.systemDetail.classifiedOn'
                          | transloco: { date: (s.classified_at | localDay) })
                        : ('aiGovernance.kindShort.classification' | transloco)
                    }}</span>
                    <span class="font-mono text-meta">{{ c.code }}</span>
                    <app-status-badge
                      meaning="lifecycle"
                      [value]="assessmentValue(c.status)"
                      [labelKey]="assessmentStatusKey(c.status)"
                    />
                    <span aria-hidden="true" class="text-accent">→</span>
                  </a>
                }
              </span>
            }
          </app-field-item>
          <app-field-item size="lead" labelKey="aiGovernance.systemDetail.lead.provider">
            @if (s.supplier; as sup) {
              <span class="flex flex-col gap-1">
                <app-entity-chip [ref]="sup" data-testid="system-supplier" />
                @if (s.models.length) {
                  <span class="text-ui text-fg-muted">{{ s.models.join(', ') }}</span>
                }
              </span>
            } @else if (s.provider_name) {
              <span class="flex flex-col gap-1">
                <span>{{ s.provider_name }}</span>
                @if (s.models.length) {
                  <span class="text-ui text-fg-muted">{{ s.models.join(', ') }}</span>
                }
              </span>
            }
          </app-field-item>
          <app-field-item size="lead" labelKey="aiGovernance.systemDetail.lead.overseers">
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
            }
          </app-field-item>
        </app-record-lead>

        <div class="flex flex-col gap-8">
          <app-record-details
            [columns]="2"
            [fillLink]="store.canWrite() ? editLink() : null"
            data-testid="system-about"
          >
            @if (s.description && s.description !== s.intended_purpose) {
              <app-field-item
                labelKey="aiGovernance.fields.description"
                [value]="s.description"
                [wide]="true"
                [multiline]="true"
              />
            }
            <app-field-item
              labelKey="aiGovernance.systemDetail.plain.dataCategories"
              [value]="s.data_categories.length ? s.data_categories.join(', ') : null"
            />
            @if (s.uses_personal_data) {
              <app-field-item labelKey="aiGovernance.systemDetail.plain.personalData">
                <span class="flex flex-col gap-1.5">
                  <span>{{ 'aiGovernance.systemDetail.plain.personalDataYes' | transloco }}</span>
                  @if (s.processing_activity; as ropa) {
                    <app-entity-chip [ref]="ropa" [statusText]="true" data-testid="system-ropa" />
                  } @else {
                    <span class="text-meta text-warn-ink">{{
                      'aiGovernance.systemDetail.noRopa' | transloco
                    }}</span>
                  }
                </span>
              </app-field-item>
            }
            @if (s.uses_personal_data || s.dpias?.length) {
              <app-field-item labelKey="aiGovernance.systemDetail.plain.dpia">
                <span class="flex flex-col gap-1.5" data-testid="system-dpias">
                  @for (d of s.dpias ?? []; track d.entity_id) {
                    <app-entity-chip [ref]="d" [statusText]="true" />
                  } @empty {
                    <span class="text-ui text-fg-muted">
                      {{
                        (s.dpia_recommended
                          ? 'aiGovernance.systemDetail.dpiaRecommended'
                          : 'aiGovernance.systemDetail.noDpia'
                        ) | transloco
                      }}
                    </span>
                    @if (store.canWrite()) {
                      <span>
                        <app-button
                          size="sm"
                          variant="secondary"
                          [loading]="flows.starting() === 'ai_system.to_dpia'"
                          (click)="startFlow('ai_system.to_dpia', s)"
                        >
                          {{ 'aiGovernance.systemDetail.createDpia' | transloco }}
                        </app-button>
                      </span>
                    }
                  }
                </span>
              </app-field-item>
            }
            <app-field-item labelKey="aiGovernance.fields.role">
              {{ roleKey(s.ai_act_role) | transloco }}
            </app-field-item>
            <app-field-item labelKey="aiGovernance.fields.department" [value]="departmentName()" />
            @if (s.is_builtin || s.gpai) {
              <app-field-item labelKey="aiGovernance.systemDetail.plain.kind">
                <span class="flex flex-wrap gap-1.5">
                  @if (s.is_builtin) {
                    <app-badge tone="neutral">{{
                      'aiGovernance.systems.builtin' | transloco
                    }}</app-badge>
                  }
                  @if (s.gpai) {
                    <app-badge tone="neutral">{{
                      'aiGovernance.result.gpai' | transloco
                    }}</app-badge>
                  }
                </span>
              </app-field-item>
            }
          </app-record-details>

          @if (s.risk_class !== 'unclassified') {
            <app-card data-testid="system-obligations" id="system-obligations" class="scroll-mt-20">
              <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 class="font-display text-card font-bold text-fg">
                  {{ 'aiGovernance.systemDetail.obligations' | transloco }}
                </h2>
                @if (s.obligations.length) {
                  <app-ai-assist-button
                    #explainAssist
                    [quiet]="true"
                    assist="ai_governance.explain_obligations"
                    labelKey="aiGovernance.ai.explainObligations"
                    [input]="{ ai_system_id: s.id }"
                    entityType="ai_system"
                    [entityId]="s.id"
                    (text)="explanation.set($event)"
                  />
                }
              </div>
              <p class="mb-3 text-meta text-fg-muted">
                {{ 'aiGovernance.systemDetail.obligationsHint' | transloco }}
              </p>
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
                <details
                  class="group mt-4 border-t border-border pt-3"
                  data-testid="system-provider-obligations"
                >
                  <summary
                    class="flex min-h-8 cursor-pointer list-none items-center gap-2 text-ui font-semibold text-fg hover:text-accent [&::-webkit-details-marker]:hidden"
                  >
                    <app-icon
                      name="chevron"
                      [size]="14"
                      class="-rotate-90 transition-transform group-open:rotate-0"
                    />
                    {{
                      'aiGovernance.systemDetail.providerToggle'
                        | transloco: { count: s.provider_obligations!.length }
                    }}
                  </summary>
                  <p class="mt-1 mb-1 text-meta text-fg-muted">
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
                </details>
              }
            </app-card>
          }

          <app-card data-testid="system-assessments">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-card font-bold text-fg">
                {{ 'aiGovernance.systemDetail.assessments' | transloco }}
              </h2>
              @if (store.canWrite()) {
                <div class="flex flex-wrap gap-2">
                  <a
                    routerLink="/ai-governance/assessments/new"
                    [queryParams]="{ system: s.id, kind: 'impact' }"
                    class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
                  >
                    <app-icon name="plus" [size]="14" />
                    {{ 'aiGovernance.systemDetail.newImpact' | transloco }}
                  </a>
                  @if (s.fria_applicable) {
                    <a
                      routerLink="/ai-governance/assessments/new"
                      [queryParams]="{ system: s.id, kind: 'fria' }"
                      class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
                      data-testid="system-new-fria"
                    >
                      <app-icon name="plus" [size]="14" />
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
                  <li>
                    <a
                      [routerLink]="['/ai-governance/assessments', a.id]"
                      class="group flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
                      data-testid="system-assessment-row"
                    >
                      <span
                        class="flex h-7 w-7 flex-none items-center justify-center rounded-tile bg-surface-2 text-fg-muted"
                        aria-hidden="true"
                      >
                        <app-icon name="qa" [size]="15" />
                      </span>
                      <span class="flex min-w-0 flex-1 flex-col">
                        <span class="text-meta text-fg-muted">
                          {{ kindKey(a.kind) | transloco }}
                          <span class="ml-1 font-mono">{{ a.code }}</span>
                        </span>
                        <span
                          class="truncate text-body font-semibold text-fg group-hover:text-accent group-hover:underline"
                          >{{ a.title }}</span
                        >
                      </span>
                      <span class="flex flex-wrap items-center gap-2">
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
                        <span aria-hidden="true" class="text-accent">→</span>
                      </span>
                    </a>
                  </li>
                }
              </ul>
            }
          </app-card>

          <app-card data-testid="system-documentation">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h2 class="font-display text-card font-bold text-fg">
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
          <app-ai-system-review-schedule [systemId]="s.id" [canWrite]="store.canWrite()" />
          <app-outputs-panel
            entityType="ai_system"
            [entityId]="s.id"
            data-testid="system-outputs"
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

        @if (store.canWrite()) {
          <button
            follow-up-connections
            type="button"
            class="mt-3 inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
            [disabled]="flows.starting() === 'ai_system.to_risk'"
            (click)="startFlow('ai_system.to_risk', s)"
            data-testid="system-create-risk"
          >
            <app-icon name="plus" [size]="13" />
            {{ 'aiGovernance.systemDetail.createRisk' | transloco }}
          </button>
        }

        <app-record-meta follow-up-meta>
          <app-field-item
            layout="inline"
            labelKey="aiGovernance.fields.owner"
            [value]="s.owner?.name"
          />
          <app-field-item
            layout="inline"
            labelKey="aiGovernance.fields.classifiedAt"
            [value]="s.classified_at ? (s.classified_at | localDay) : null"
          />
          <app-field-item
            layout="inline"
            labelKey="aiGovernance.fields.nextReview"
            [keepEmpty]="s.status !== 'retired'"
            emptyKey="kit.detail.meta.notPlanned"
            emptyActionKey="kit.detail.meta.plan"
            [emptyLink]="store.canWrite() ? editLink() : null"
          >
            @if (s.next_review_at) {
              <span [class.text-warn-ink]="reviewOverdue()">{{ s.next_review_at | localDay }}</span>
            }
          </app-field-item>
          <app-field-item
            layout="inline"
            labelKey="aiGovernance.systemDetail.updated"
            [value]="s.updated_at | localDate"
          />
        </app-record-meta>
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

  private readonly explainAssist = viewChild<AiAssistButton>('explainAssist');

  protected readonly system = signal<AiSystem | null>(null);
  protected readonly obligations = signal<readonly Obligation[]>([]);
  protected readonly assessments = signal<readonly AssessmentSummary[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly explanation = signal('');
  protected readonly confirmDelete = signal(false);
  protected readonly deleting = signal(false);
  protected readonly classifying = signal(false);
  protected readonly reload = signal(0);

  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/ai-governance/systems',
    this.id(),
    'edit',
  ]);
  protected readonly obligationTotals = computed(() => obligationCounts(this.obligations()));
  protected readonly hasFria = computed(() =>
    this.assessments().some((a) => a.kind === 'fria' && a.status !== 'draft'),
  );
  protected readonly reviewOverdue = computed(() => isPast(this.system()?.next_review_at));
  protected readonly statusLine = computed(() =>
    systemStatusSentence(this.system() ?? { risk_class: 'unclassified' }, this.obligationTotals()),
  );
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const s = this.system();
    if (!s || !this.store.canWrite()) {
      return [];
    }
    return systemMissing(s, {
      editLink: this.editLink(),
      counts: this.obligationTotals(),
      hasFria: this.hasFria(),
      classify: () => this.classify(s),
      createDpia: () => this.startFlow('ai_system.to_dpia', s),
      showObligations: () => this.scrollTo('system-obligations'),
    });
  });
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

  protected edit(s: AiSystem): void {
    void this.router.navigate(['/ai-governance/systems', s.id, 'edit']);
  }

  /** "Forklar forpliktelsene" from the "Spør KI" menu: run the assist, show the answer. */
  protected explainObligations(): void {
    this.scrollTo('system-obligations');
    this.explainAssist()?.run();
  }

  protected scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
