import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  Injector,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription, map } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AssigneeIn } from '../../core/tasks/task.models';
import { AskPanelService } from '../ask/ask-panel.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { EntityChip, EntityChipRef } from '../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../shared/kit/record-detail-layout';
import {
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe, formatLocalDate } from '../../shared/locale/locale-pipes';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { FormField } from '../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { AssessmentCriteriaView, CriteriaDraft } from './components/assessment-criteria';
import { FieldLabel } from './components/field-label';
import { InputRowChange, ReviewInputRow } from './components/review-input-row';
import { MeetingWorkspace } from './components/meeting-workspace';
import { SignoffChecklist, checklist } from './components/signoff-checklist';
import { ManagementReviewApi } from './data/management-review-api';
import { missingForSubmit, mrErrorCode, mrErrorKey } from './data/management-review-errors';
import {
  ASSIST_DRAFT_INPUT_SUMMARY,
  ASSIST_SUGGEST_OUTPUTS,
  CRITERIA,
  Criterion,
  CriterionValue,
  Decision,
  DecisionCategory,
  MeetingDetail,
  NeighbourReview,
  ReviewAction,
  ReviewDetail,
  ReviewInput,
  SubmitRequirement,
  SuggestedOutputs,
  UpdateReviewRequest,
} from './data/management-review.models';
import {
  MISSING_TARGET,
  MR_MODULE,
  MR_PERMISSIONS,
  MR_SCOPE,
  MR_SETTINGS_LINK,
  REVIEW_SECTIONS,
  ReviewSection,
  assessmentKey,
  decisionCategoryKey,
  defaultSection,
  frameworkKey,
  inputDone,
  mrCrumbs,
  reviewActionKey,
  reviewStatusKey,
  sectionDone,
  textOrNull,
  toneValue,
} from './management-review-display';

/** Open inputs shown before "Vis N flere" (U37: at most a handful of controls). */
const OPEN_INPUTS_SHOWN = 3;

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Snapshot field -> label key, for the revisions tab. */
export const REVIEW_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'managementReview.fields.title',
  status: 'managementReview.fields.status',
  frameworks: 'managementReview.fields.frameworks',
  period_start: 'managementReview.fields.periodStart',
  period_end: 'managementReview.fields.periodEnd',
  owner_user_id: 'managementReview.fields.owner',
  inputs_summary: 'managementReview.fields.inputsSummary',
  conclusions: 'managementReview.fields.conclusions',
  improvement_opportunities: 'managementReview.fields.improvementOpportunities',
  change_needs: 'managementReview.fields.changeNeeds',
  resource_needs: 'managementReview.fields.resourceNeeds',
  system_assessment: 'managementReview.fields.systemAssessment',
  assessment_criteria: 'managementReview.fields.assessmentCriteria',
};

/**
 * The text output fields of a review, in display order, with the decision
 * category that belongs under each (decisions of the meeting are shown there).
 */
export const OUTPUT_FIELDS = [
  {
    key: 'conclusions',
    label: 'managementReview.fields.conclusions',
    help: 'conclusions',
    category: 'decision',
  },
  {
    key: 'improvement_opportunities',
    label: 'managementReview.fields.improvementOpportunities',
    help: 'improvementOpportunities',
    category: 'improvement',
  },
  {
    key: 'change_needs',
    label: 'managementReview.fields.changeNeeds',
    help: 'changeNeeds',
    category: 'change',
  },
  {
    key: 'resource_needs',
    label: 'managementReview.fields.resourceNeeds',
    help: 'resourceNeeds',
    category: 'resource',
  },
] as const;

export type OutputKey = (typeof OUTPUT_FIELDS)[number]['key'];
type TextKey = OutputKey | 'inputs_summary';

export interface OutputsDraft {
  readonly inputs_summary: string;
  readonly conclusions: string;
  readonly improvement_opportunities: string;
  readonly change_needs: string;
  readonly resource_needs: string;
  readonly criteria: CriteriaDraft;
}

const TEXT_KEYS: readonly TextKey[] = [
  'inputs_summary',
  'conclusions',
  'improvement_opportunities',
  'change_needs',
  'resource_needs',
];

function criteriaOf(r: ReviewDetail): CriteriaDraft {
  const out: Partial<Record<Criterion, CriterionValue>> = {};
  for (const c of CRITERIA) {
    const v = r.assessment_criteria?.items?.[c];
    if (v && (v.rating || v.note)) {
      out[c] = { rating: v.rating ?? null, note: v.note ?? null };
    }
  }
  return out;
}

export function outputsDraft(r: ReviewDetail): OutputsDraft {
  return {
    inputs_summary: r.inputs_summary ?? '',
    conclusions: r.conclusions ?? '',
    improvement_opportunities: r.improvement_opportunities ?? '',
    change_needs: r.change_needs ?? '',
    resource_needs: r.resource_needs ?? '',
    criteria: criteriaOf(r),
  };
}

const sameCriterion = (a?: CriterionValue | null, b?: CriterionValue | null) =>
  (a?.rating ?? null) === (b?.rating ?? null) && (a?.note ?? '').trim() === (b?.note ?? '').trim();

/** Only the outputs that changed (empty text is sent as null; a cleared criterion as null). */
export function outputsPatch(r: ReviewDetail, d: OutputsDraft): UpdateReviewRequest {
  const out: Record<string, unknown> = {};
  const before = outputsDraft(r);
  for (const key of TEXT_KEYS) {
    if ((d[key] ?? '').trim() !== (before[key] ?? '').trim()) {
      out[key] = textOrNull(d[key]);
    }
  }
  const criteria: Partial<Record<Criterion, CriterionValue | null>> = {};
  for (const c of CRITERIA) {
    if (!sameCriterion(d.criteria[c], before.criteria[c])) {
      const v = d.criteria[c];
      criteria[c] =
        v && (v.rating || textOrNull(v.note))
          ? { rating: v.rating ?? null, note: textOrNull(v.note) }
          : null;
    }
  }
  if (Object.keys(criteria).length) {
    out['assessment_criteria'] = criteria;
  }
  return out as UpdateReviewRequest;
}

/** Which output field a suggested decision category is added to. */
export function outputFieldFor(category: DecisionCategory): OutputKey {
  switch (category) {
    case 'improvement':
      return 'improvement_opportunities';
    case 'change':
      return 'change_needs';
    case 'resource':
      return 'resource_needs';
    default:
      return 'conclusions';
  }
}

/** Append a line to a text field (blank line between paragraphs). */
export function appendLine(text: string, line: string): string {
  const base = text.trimEnd();
  return base ? `${base}\n- ${line}` : `- ${line}`;
}

/** A `?section=` value, when it names a section. */
export function sectionOf(value: string | null): ReviewSection | null {
  return (REVIEW_SECTIONS as readonly string[]).includes(value ?? '')
    ? (value as ReviewSection)
    : null;
}

/** The one primary workflow action of the header, if the review has one now. */
export function primaryAction(r: ReviewDetail): ReviewAction | null {
  for (const a of ['start', 'submit', 'sign'] as const) {
    if (r.allowed_actions.includes(a)) {
      return a;
    }
  }
  return null;
}

/** The status sentence of the "Hovedinformasjon" card (docs/ux-guide.md §2.7). */
export interface ReviewStatusSentence {
  readonly key: string;
  readonly params: Record<string, unknown>;
  readonly tone: StatusLineTone;
}

/**
 * "Pågår – 4 av 19 punkter i grunnlaget er gjennomgått …": the status word, a dash and
 * what it means now. Open work is `warn` (never `fail`), signed is `pass`.
 */
export function reviewStatusSentence(
  r: ReviewDetail,
  date: (value: string | null | undefined) => string,
): ReviewStatusSentence {
  const base = 'managementReview.lead.status.';
  switch (r.status) {
    case 'planned':
      return { key: `${base}planned`, params: {}, tone: 'info' };
    case 'in_progress': {
      const missing = r.submit_check?.missing ?? r.missing_for_submit;
      if (r.submit_check && missing.length === 0) {
        return { key: `${base}ready`, params: {}, tone: 'warn' };
      }
      return {
        key: `${base}in_progress`,
        params: { done: r.inputs.filter((i) => inputDone(i)).length, total: r.inputs.length },
        tone: 'warn',
      };
    }
    case 'awaiting_signoff':
      return {
        key: `${base}awaiting_signoff`,
        params: { name: r.submitted_by?.name ?? '—', date: date(r.submitted_at) },
        tone: 'warn',
      };
    case 'signed':
      return {
        key: `${base}signed`,
        params: {
          name: r.signature_name || r.signed_by?.name || '—',
          date: date(r.signed_at),
        },
        tone: 'pass',
      };
    default:
      return { key: `${base}cancelled`, params: { date: date(r.cancelled_at) }, tone: 'neutral' };
  }
}

/**
 * What the review still needs ("Oppfølging"): the sign-off items left (each opens the
 * step that fixes it), then a missing period or owner (the edit page).
 */
export function reviewMissing(
  r: ReviewDetail,
  go: (item: SubmitRequirement) => void,
  editLink: readonly unknown[],
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  if (r.status === 'planned' || r.status === 'in_progress') {
    for (const item of checklist(r)) {
      if (!item.done) {
        items.push({
          key: item.key,
          labelKey: `managementReview.lead.missing.${item.key}`,
          params: item.params,
          action: () => go(item.key),
        });
      }
    }
  }
  if (r.can_edit && r.status !== 'signed' && r.status !== 'cancelled') {
    if (!r.period_start && !r.period_end) {
      items.push({
        key: 'period',
        labelKey: 'managementReview.lead.missing.period',
        link: editLink,
      });
    }
    if (!r.owner) {
      items.push({ key: 'owner', labelKey: 'managementReview.lead.missing.owner', link: editLink });
    }
  }
  return items;
}

/** A neighbour review or the review's meeting as an entity chip. */
export function reviewChip(n: NeighbourReview): EntityChipRef {
  return {
    entity_type: 'management_review',
    entity_id: n.id,
    title: n.title,
    code: n.code,
    url: n.url,
    status: n.status,
    module: MR_MODULE,
  };
}

export function meetingChip(m: MeetingDetail): EntityChipRef {
  return {
    entity_type: 'meeting',
    entity_id: m.id,
    title: m.title,
    code: m.code,
    url: `/management-review/meetings/${m.id}`,
    status: m.status,
    module: MR_MODULE,
  };
}

/**
 * `/management-review/reviews/:id`: one management review end to end, split into
 * the four steps of the work (so one screen holds one job):
 *
 * 1. Grunnlag — the inputs ISO 9.3.2 lists, with figures fetched from the
 *    modules that own the data, notes that save themselves, and "reviewed" or
 *    "not relevant" (with a reason) per input; plus the summary.
 * 2. Møtet — the meeting: agenda, attendees (top management), minutes, decisions.
 * 3. Resultater — conclusions, improvement, change and resource needs (with the
 *    meeting's decisions of each kind), and the 9.3 conclusions rated one by one.
 * 4. Signering — what is still missing (each item links to its place), submit,
 *    sign; once signed the report is frozen with a checksum.
 *
 * One sticky bar saves the text of steps 1 and 3; leaving with unsaved text asks
 * first. The header has one primary action (the next workflow step); the rest is
 * in "Mer". The review documents ISO 9.3 for each standard it covers.
 */
@Component({
  selector: 'app-mr-review-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    AiAssistButton,
    TourStepDirective,
    WhyItMatters,
    RecordDetailLayout,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    EntityChip,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FieldList,
    FormField,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PromptDialog,
    StatusBadge,
    AssessmentCriteriaView,
    FieldLabel,
    MeetingWorkspace,
    ReviewInputRow,
    SignoffChecklist,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[880px] px-4 pt-7 sm:px-8">
          <app-error-state
            titleKey="managementReview.common.notFoundTitle"
            bodyKey="managementReview.common.notFound"
            (retry)="reload()"
          />
          <a
            routerLink="/management-review/reviews"
            class="mt-3 inline-flex min-h-6 items-center text-ui font-semibold text-accent"
          >
            {{ 'managementReview.common.backToList' | transloco }}
          </a>
        </div>
      }
      @case ('ready') {
        @if (review(); as r) {
          <app-record-detail-layout
            [anatomy]="true"
            entityType="management_review"
            [entityId]="r.id"
            [title]="r.title"
            [breadcrumbs]="crumbs()"
            [settingsLink]="settingsLink"
            [tabs]="tabs"
            [canEdit]="r.can_edit"
            [fieldLabels]="fieldLabels"
            [requirementsPanel]="true"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ r.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'managementReview.detail.type' | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="tone(r.status)"
                [labelKey]="statusKey(r.status)"
              />
            </ng-container>

            @if (primary(); as a) {
              <span
                primary
                [title]="a === 'submit' && !canSubmit() ? (submitHint() | transloco) : ''"
              >
                <app-button
                  [variant]="a === 'submit' && !canSubmit() ? 'secondary' : 'primary'"
                  [disabled]="busy() || (a === 'submit' && !canSubmit())"
                  [attr.data-testid]="'action-' + a"
                  (click)="runAction(a)"
                >
                  {{ actionKey(a) | transloco }}
                </app-button>
              </span>
            }
            <a
              secondary
              [routerLink]="['/management-review/reviews', r.id, 'report']"
              class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2"
              data-testid="review-report-link"
            >
              <app-icon name="documents" [size]="14" />
              {{ 'managementReview.detail.report' | transloco }}
            </a>

            @if (r.can_edit) {
              <button appMenuItem overflow (click)="edit()">
                {{ 'managementReview.detail.edit' | transloco }}
              </button>
            }
            @if (allowed('return')) {
              <button appMenuItem overflow (click)="runAction('return')">
                {{ actionKey('return') | transloco }}
              </button>
            }
            @if (allowed('cancel')) {
              <button appMenuItem overflow (click)="runAction('cancel')">
                {{ actionKey('cancel') | transloco }}
              </button>
            }
            @if (allowed('delete')) {
              <button appMenuItem overflow [danger]="true" (click)="confirmDelete.set(true)">
                {{ actionKey('delete') | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askSummary()">
              <app-icon name="spark" [size]="15" />
              {{ 'managementReview.ai.summarise' | transloco }}
            </button>
            @if (r.can_edit) {
              <ng-container ngProjectAs="[ask]">
                <button
                  appMenuItem
                  ask
                  type="button"
                  data-testid="ask-draft-summary"
                  (click)="runAssist('draft')"
                >
                  <app-icon name="spark" [size]="15" />
                  {{ 'managementReview.ai.draftSummary' | transloco }}
                </button>
                <button
                  appMenuItem
                  ask
                  type="button"
                  data-testid="ask-suggest-outputs"
                  (click)="runAssist('suggest')"
                >
                  <app-icon name="spark" [size]="15" />
                  {{ 'managementReview.ai.suggestOutputs' | transloco }}
                </button>
              </ng-container>
            }

            <app-help-strip
              help
              [scope]="scope"
              page="detail"
              tour="detail"
              lesson="effective-review"
            />

            <!-- §2.7 Hovedinformasjon: where the review stands, the period, the meeting,
                 what was concluded and the follow-up. -->
            <app-record-lead record-lead data-testid="review-lead">
              <app-record-status-line
                status
                [tone]="statusTone()"
                appTourStep="mr-progress"
                data-testid="review-status-line"
              >
                {{ statusSentence().key | transloco: statusSentence().params }}
              </app-record-status-line>
              <app-field-item size="lead" labelKey="managementReview.lead.period">
                @if (r.period_start || r.period_end) {
                  {{ (r.period_start | localDay) || '…' }} –
                  {{ (r.period_end | localDay) || '…' }}
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="managementReview.lead.meeting">
                @if (meetingRef(); as ref) {
                  <span class="flex flex-col gap-1" data-testid="review-meeting">
                    <app-entity-chip [ref]="ref" [statusText]="true" [stacked]="true" />
                    <span class="text-meta text-fg-muted">
                      @if (meetingWhen(); as when) {
                        {{ when | localDate }}
                      }
                      @if (topManagement(); as tm) {
                        @if (meetingWhen()) {
                          ·
                        }
                        {{ 'managementReview.lead.topManagement' | transloco: tm }}
                      }
                    </span>
                  </span>
                }
              </app-field-item>
              <app-field-item
                size="lead"
                labelKey="managementReview.lead.conclusions"
                [value]="r.conclusions"
                [multiline]="true"
                [wide]="true"
              />
              <app-field-item size="lead" labelKey="managementReview.lead.actions" [wide]="true">
                @if (r.actions.total > 0) {
                  <span data-testid="action-stats">{{
                    'managementReview.lead.actionStats'
                      | transloco: { open: r.actions.open, done: r.actions.done }
                  }}</span>
                  @if (r.actions.overdue > 0) {
                    <span class="text-warn-ink">
                      ·
                      {{
                        'managementReview.lead.overdue' | transloco: { count: r.actions.overdue }
                      }}</span
                    >
                  }
                }
              </app-field-item>
            </app-record-lead>

            <div class="flex flex-col gap-5">
              <!-- step navigation -->
              <nav
                class="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto bg-bg/95 px-1 py-1.5 backdrop-blur"
                [attr.aria-label]="'managementReview.sections.label' | transloco"
                data-testid="mr-sections"
                appTourStep="mr-sections"
              >
                @for (s of sections; track s; let i = $index) {
                  <button
                    type="button"
                    class="flex min-h-10 flex-none items-center gap-2 rounded-tile border px-3 text-ui font-semibold whitespace-nowrap focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    [class]="
                      section() === s
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border bg-surface text-fg-muted hover:text-fg'
                    "
                    [attr.aria-current]="section() === s ? 'step' : null"
                    (click)="goTo(s)"
                    [attr.data-testid]="'section-' + s"
                  >
                    <span
                      class="flex h-5 w-5 flex-none items-center justify-center rounded-full border text-micro"
                      [class]="
                        done(s) ? 'border-pass bg-pass text-white' : 'border-current text-current'
                      "
                      aria-hidden="true"
                    >
                      @if (done(s)) {
                        <app-icon name="check" [size]="11" />
                      } @else {
                        {{ i + 1 }}
                      }
                    </span>
                    {{ 'managementReview.sections.' + s | transloco }}
                    @if (s === 'inputs') {
                      <span class="text-micro font-normal text-fg-muted">{{
                        'managementReview.sections.inputsCount'
                          | transloco: { done: inputsDone(), total: r.inputs.length }
                      }}</span>
                    }
                    @if (done(s)) {
                      <span class="sr-only">{{ 'managementReview.signoff.done' | transloco }}</span>
                    }
                  </button>
                }
              </nav>

              @switch (section()) {
                @case ('inputs') {
                  <section id="mr-inputs" class="flex flex-col gap-4" aria-labelledby="mr-inputs-h">
                    <app-card>
                      <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h2 id="mr-inputs-h" class="font-display text-section font-bold text-fg">
                            {{ 'managementReview.inputs.title' | transloco }}
                          </h2>
                          <p class="mt-0.5 text-meta text-fg-muted">
                            {{
                              'managementReview.inputs.progress'
                                | transloco: { done: inputsDone(), total: r.inputs.length }
                            }}
                            ·
                            @if (r.inputs_compiled_at) {
                              {{
                                'managementReview.inputs.compiledAt'
                                  | transloco: { date: (r.inputs_compiled_at | localDate) }
                              }}
                            } @else {
                              {{ 'managementReview.inputs.notCompiled' | transloco }}
                            }
                          </p>
                        </div>
                        @if (allowed('compile')) {
                          <app-button
                            size="sm"
                            variant="secondary"
                            appTourStep="mr-compile"
                            [disabled]="busy()"
                            (click)="runAction('compile')"
                          >
                            <app-icon name="history" [size]="14" />
                            {{ actionKey('compile') | transloco }}
                          </app-button>
                        }
                      </div>
                      @if (r.can_edit) {
                        <p class="mb-3 text-ui text-fg-muted">
                          {{ 'managementReview.inputs.intro' | transloco }}
                        </p>
                      }
                      <!-- U37: what is left first (a few at a time), finished inputs folded. -->
                      <div data-testid="review-inputs">
                        <ul class="flex flex-col gap-2">
                          @for (i of visibleOpenInputs(); track i.id) {
                            <li>
                              <app-mr-input-row
                                [item]="i"
                                [frameworks]="r.frameworks"
                                [canEdit]="r.can_edit"
                                [canCompile]="allowed('compile')"
                                [busy]="busy()"
                                [saving]="savingInput() === i.id"
                                [initiallyOpen]="i.id === firstOpenInput()"
                                (changed)="onInputChange(i, $event)"
                              />
                            </li>
                          } @empty {
                            <li class="text-body text-fg-muted" data-testid="mr-inputs-empty">
                              {{
                                (r.inputs.length
                                  ? 'managementReview.inputs.allDone'
                                  : 'managementReview.inputs.empty'
                                ) | transloco
                              }}
                            </li>
                          }
                        </ul>
                        @if (hiddenOpenCount() > 0) {
                          <app-button
                            class="mt-2 inline-block"
                            size="sm"
                            variant="ghost"
                            data-testid="mr-inputs-more"
                            (click)="showAllOpen.set(true)"
                          >
                            {{
                              'managementReview.inputs.showMore'
                                | transloco: { count: hiddenOpenCount() }
                            }}
                          </app-button>
                        }
                        @if (doneInputs().length) {
                          <details class="group mt-3" data-testid="mr-done-inputs">
                            <summary
                              class="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-ui font-semibold text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden"
                            >
                              <span
                                class="flex -rotate-90 transition-transform group-open:rotate-0"
                                aria-hidden="true"
                                ><app-icon name="chevron" [size]="14"
                              /></span>
                              {{
                                'managementReview.inputs.doneFold'
                                  | transloco: { count: doneInputs().length }
                              }}
                            </summary>
                            <ul class="mt-2 flex flex-col gap-2">
                              @for (i of doneInputs(); track i.id) {
                                <li>
                                  <app-mr-input-row
                                    [item]="i"
                                    [frameworks]="r.frameworks"
                                    [canEdit]="r.can_edit"
                                    [canCompile]="allowed('compile')"
                                    [busy]="busy()"
                                    [saving]="savingInput() === i.id"
                                    (changed)="onInputChange(i, $event)"
                                  />
                                </li>
                              }
                            </ul>
                          </details>
                        }
                      </div>
                      @if (r.can_edit) {
                        @if (addingCustom()) {
                          <form
                            class="mt-3 flex flex-wrap items-center gap-2"
                            (submit)="$event.preventDefault(); addInput()"
                          >
                            <label class="sr-only" for="mr-custom-input">{{
                              'managementReview.inputs.customTitle' | transloco
                            }}</label>
                            <input
                              id="mr-custom-input"
                              type="text"
                              maxlength="255"
                              class="h-10 min-w-0 flex-1 basis-60 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                              [placeholder]="'managementReview.inputs.customTitle' | transloco"
                              [value]="customTitle()"
                              (input)="customTitle.set($any($event.target).value)"
                            />
                            <app-button
                              size="sm"
                              variant="secondary"
                              type="submit"
                              [disabled]="!customTitle().trim() || busy()"
                            >
                              <app-icon name="plus" [size]="13" />
                              {{ 'managementReview.inputs.addCustom' | transloco }}
                            </app-button>
                          </form>
                        } @else {
                          <app-button
                            class="mt-3 inline-block"
                            size="sm"
                            variant="ghost"
                            data-testid="mr-add-custom"
                            (click)="addingCustom.set(true)"
                          >
                            <app-icon name="plus" [size]="13" />
                            {{ 'managementReview.inputs.addOwn' | transloco }}
                          </app-button>
                        }
                      }
                    </app-card>

                    <app-card>
                      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div class="flex flex-wrap items-center gap-1.5">
                          <h2 class="font-display text-card font-bold text-fg">
                            {{ 'managementReview.fields.inputsSummary' | transloco }}
                          </h2>
                        </div>
                        @if (r.can_edit) {
                          <app-ai-assist-button
                            #draftAssist
                            variant="ghost"
                            [assist]="draftSummaryAssist"
                            labelKey="managementReview.ai.draftSummary"
                            entityType="management_review"
                            [entityId]="r.id"
                            [input]="{ review_id: r.id }"
                            (text)="setText('inputs_summary', $event)"
                          />
                        }
                      </div>
                      @if (r.can_edit) {
                        <app-mr-field-label
                          controlId="mr-inputs-summary"
                          [label]="'managementReview.fields.inputsSummary' | transloco"
                          page="detail"
                          field="inputsSummary"
                          [srOnly]="true"
                        />
                        <app-form-field inputId="mr-inputs-summary">
                          <textarea
                            id="mr-inputs-summary"
                            rows="6"
                            maxlength="50000"
                            [value]="outputs().inputs_summary"
                            (input)="setText('inputs_summary', $any($event.target).value)"
                          ></textarea>
                        </app-form-field>
                      } @else {
                        <p class="text-body whitespace-pre-line text-fg">
                          {{ r.inputs_summary || ('common.empty.notSet' | transloco) }}
                        </p>
                      }
                    </app-card>
                  </section>
                }

                @case ('meeting') {
                  <section class="flex flex-col gap-4" aria-labelledby="mr-meeting-h">
                    @if (r.meeting; as m) {
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <h2 id="mr-meeting-h" class="font-display text-section font-bold text-fg">
                          {{
                            'managementReview.detail.meetingHeading' | transloco: { code: m.code }
                          }}
                        </h2>
                        <a
                          [routerLink]="['/management-review/meetings', m.id]"
                          class="inline-flex min-h-6 items-center gap-1 text-ui font-semibold text-accent hover:underline"
                        >
                          {{ 'managementReview.detail.openMeeting' | transloco }}
                          <app-icon name="arrow" [size]="13" />
                        </a>
                      </div>
                      <app-mr-meeting-workspace
                        [meeting]="m"
                        [canManage]="canManage()"
                        (changed)="onMeetingChanged($event)"
                      />
                    } @else {
                      <h2 id="mr-meeting-h" class="sr-only">
                        {{ 'managementReview.sections.meeting' | transloco }}
                      </h2>
                      <app-alert tone="info">{{
                        'managementReview.detail.noMeeting' | transloco
                      }}</app-alert>
                    }
                  </section>
                }

                @case ('outputs') {
                  <section class="flex flex-col gap-4" aria-labelledby="mr-outputs-h">
                    <app-card appTourStep="mr-outputs">
                      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h2 id="mr-outputs-h" class="font-display text-section font-bold text-fg">
                          {{ 'managementReview.detail.outputsHeading' | transloco }}
                        </h2>
                        @if (r.can_edit) {
                          <app-ai-assist-button
                            #suggestAssistBtn
                            variant="ghost"
                            [assist]="suggestAssist"
                            labelKey="managementReview.ai.suggestOutputs"
                            entityType="management_review"
                            [entityId]="r.id"
                            [input]="{ review_id: r.id }"
                            (result)="onSuggestions($event)"
                          />
                        }
                      </div>
                      <p class="mb-4 text-ui text-fg-muted">
                        {{ 'managementReview.detail.outputsIntro' | transloco }}
                      </p>
                      @if (suggestions().length) {
                        <ul class="mb-4 flex flex-col gap-2" data-testid="output-suggestions">
                          @for (s of suggestions(); track $index; let idx = $index) {
                            <li class="rounded-tile border border-border p-3">
                              <div class="flex flex-wrap items-start gap-2">
                                <app-badge tone="info">{{
                                  categoryKey(s.category) | transloco
                                }}</app-badge>
                                <p class="min-w-0 flex-1 text-body text-fg">{{ s.text }}</p>
                              </div>
                              <div class="mt-2 flex flex-wrap gap-2">
                                <app-button
                                  size="sm"
                                  variant="secondary"
                                  (click)="useSuggestion(idx)"
                                >
                                  {{ 'managementReview.ai.addToOutputs' | transloco }}
                                </app-button>
                                @if (r.meeting?.can_edit) {
                                  <app-button
                                    size="sm"
                                    variant="secondary"
                                    [disabled]="busy()"
                                    (click)="recordSuggestion(idx)"
                                  >
                                    {{ 'managementReview.ai.recordDecision' | transloco }}
                                  </app-button>
                                }
                                <app-button
                                  size="sm"
                                  variant="ghost"
                                  (click)="dismissSuggestion(idx)"
                                >
                                  {{ 'managementReview.ai.dismiss' | transloco }}
                                </app-button>
                              </div>
                            </li>
                          }
                        </ul>
                        <p class="mb-4 text-meta text-fg-subtle">
                          {{ 'managementReview.ai.suggestionNote' | transloco }}
                        </p>
                      }
                      <div class="flex flex-col gap-5">
                        @for (f of outputFields; track f.key) {
                          <div>
                            <app-mr-field-label
                              [controlId]="'mr-out-' + f.key"
                              [label]="f.label | transloco"
                              page="detail"
                              [field]="f.help"
                            />
                            @if (r.can_edit) {
                              <app-form-field [inputId]="'mr-out-' + f.key">
                                <textarea
                                  [id]="'mr-out-' + f.key"
                                  rows="4"
                                  maxlength="50000"
                                  [value]="outputs()[f.key]"
                                  (input)="setText(f.key, $any($event.target).value)"
                                ></textarea>
                              </app-form-field>
                            } @else {
                              <p class="text-body whitespace-pre-line text-fg">
                                {{ r[f.key] || ('common.empty.notSet' | transloco) }}
                              </p>
                            }
                            @if (decisionsFor(f.category); as list) {
                              @if (list.length) {
                                <div class="mt-2 rounded-tile bg-surface-2 px-3 py-2">
                                  <p class="text-meta font-semibold text-fg-muted">
                                    {{
                                      'managementReview.detail.fromMeeting'
                                        | transloco
                                          : { category: (categoryKey(f.category) | transloco) }
                                    }}
                                  </p>
                                  <ul class="mt-1 flex flex-col gap-1">
                                    @for (d of list; track d.id) {
                                      <li class="text-ui text-fg">
                                        – {{ d.text }}
                                        @if (d.task; as t) {
                                          <a
                                            [routerLink]="t.url"
                                            class="ml-1 text-meta font-semibold text-accent hover:underline"
                                            >{{
                                              'managementReview.decisions.taskShort' | transloco
                                            }}</a
                                          >
                                        }
                                      </li>
                                    }
                                  </ul>
                                </div>
                              }
                            }
                          </div>
                        }
                      </div>
                    </app-card>

                    <app-card id="mr-criteria">
                      <div class="mb-1 flex flex-wrap items-center gap-1.5">
                        <h2 class="font-display text-card font-bold text-fg">
                          {{ 'managementReview.criteria.heading' | transloco }}
                        </h2>
                      </div>
                      <p class="mb-3 text-ui text-fg-muted">
                        {{ 'managementReview.criteria.intro' | transloco }}
                      </p>
                      <app-mr-assessment-criteria
                        [criteria]="r.assessment_criteria"
                        [draft]="outputs().criteria"
                        [canEdit]="r.can_edit"
                        [prompt]="askAssessmentPrompt()"
                        (draftChange)="setCriterion($event.criterion, $event.value)"
                      />
                      @if (!r.assessment_criteria && r.system_assessment) {
                        <p class="mt-2 text-body text-fg">
                          {{ assessmentKey(r.system_assessment) | transloco }}
                        </p>
                      }
                    </app-card>
                  </section>
                }

                @case ('signoff') {
                  <section class="flex flex-col gap-4" aria-labelledby="mr-signoff-h">
                    <app-card>
                      <h2 id="mr-signoff-h" class="font-display text-section font-bold text-fg">
                        {{ 'managementReview.signoff.heading' | transloco }}
                      </h2>
                      @if (r.status === 'planned' || r.status === 'in_progress') {
                        <p class="mt-1 mb-3 text-ui text-fg-muted">
                          {{
                            (canSubmit()
                              ? 'managementReview.signoff.ready'
                              : 'managementReview.signoff.intro'
                            ) | transloco
                          }}
                        </p>
                        <app-mr-signoff-checklist
                          [review]="checked() ?? r"
                          (go)="goToMissing($event)"
                        />
                        @if (allowed('submit')) {
                          <div class="mt-4 flex flex-wrap items-center gap-3">
                            <app-button
                              [variant]="canSubmit() ? 'primary' : 'secondary'"
                              [disabled]="busy() || !canSubmit()"
                              (click)="runAction('submit')"
                              data-testid="signoff-submit"
                            >
                              {{ actionKey('submit') | transloco }}
                            </app-button>
                            @if (!canSubmit()) {
                              <span class="text-meta text-fg-subtle">{{
                                submitHint() | transloco
                              }}</span>
                            }
                          </div>
                        }
                      } @else if (r.status === 'awaiting_signoff') {
                        <p class="mt-1 mb-3 text-ui text-fg-muted">
                          {{ 'managementReview.signoff.awaiting' | transloco }}
                        </p>
                        <div class="flex flex-wrap gap-2">
                          @if (allowed('sign')) {
                            <app-button (click)="runAction('sign')" [disabled]="busy()">
                              {{ actionKey('sign') | transloco }}
                            </app-button>
                          }
                          @if (allowed('return')) {
                            <app-button
                              variant="secondary"
                              (click)="runAction('return')"
                              [disabled]="busy()"
                            >
                              {{ actionKey('return') | transloco }}
                            </app-button>
                          }
                        </div>
                      } @else if (r.status === 'signed') {
                        <app-field-list [columns]="2" class="mt-3">
                          <app-field-item
                            labelKey="managementReview.sign.signedBy"
                            [value]="r.signature_name || r.signed_by?.name || null"
                          />
                          <app-field-item labelKey="managementReview.sign.signedAt">
                            {{ r.signed_at | localDate }}
                          </app-field-item>
                          @if (r.signature_statement) {
                            <app-field-item
                              labelKey="managementReview.sign.statement"
                              [value]="r.signature_statement"
                              [wide]="true"
                            />
                          }
                          @if (r.report_sha256) {
                            <app-field-item labelKey="managementReview.sign.checksum" [wide]="true">
                              <span class="font-mono text-meta break-all">{{
                                r.report_sha256
                              }}</span>
                            </app-field-item>
                          }
                        </app-field-list>
                      } @else {
                        <p class="mt-1 text-ui text-fg-muted">
                          {{ 'managementReview.signoff.cancelled' | transloco }}
                        </p>
                      }
                    </app-card>
                  </section>
                }
              }

              @if (r.can_edit && outputsDirty()) {
                <div
                  class="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center justify-end gap-2 rounded-card border border-border bg-surface px-4 py-3 shadow-pop"
                  role="region"
                  [attr.aria-label]="'managementReview.detail.saveBar' | transloco"
                  data-testid="save-bar"
                >
                  <span class="mr-auto text-ui font-semibold text-fg">{{
                    'managementReview.detail.unsaved' | transloco
                  }}</span>
                  <app-button variant="ghost" size="sm" (click)="discardOutputs()">
                    {{ 'managementReview.detail.discard' | transloco }}
                  </app-button>
                  <app-button
                    size="sm"
                    [loading]="busy()"
                    (click)="saveOutputs()"
                    data-testid="save-outputs"
                  >
                    {{ 'managementReview.detail.saveOutputs' | transloco }}
                  </app-button>
                </div>
              }
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="management_review"
                [entityId]="r.id"
                [canCreate]="r.can_edit"
                [defaultAssignee]="defaultAssignee()"
                [entityLabel]="r.code + ' ' + r.title"
              />
            </div>

            @if (r.previous_review || r.next_review) {
              <div
                follow-up-connections
                class="mt-3 flex flex-col gap-3 border-t border-border pt-3"
                data-testid="review-neighbours"
              >
                @if (r.previous_review; as p) {
                  <div>
                    <p class="text-meta font-semibold text-fg-muted">
                      {{ 'managementReview.previous.heading' | transloco }}
                    </p>
                    <span class="mt-1 block" data-testid="previous-review">
                      <app-entity-chip
                        [ref]="neighbourRef(p)"
                        [statusText]="true"
                        [stacked]="true"
                      />
                    </span>
                    @if (p.actions; as a) {
                      @if (a.items.length) {
                        <p class="mt-2 text-meta font-semibold text-fg-muted">
                          {{
                            'managementReview.previous.openActions'
                              | transloco: { count: a.items.length }
                          }}
                        </p>
                        <ul class="mt-1 flex flex-col gap-1.5" data-testid="previous-open-actions">
                          @for (item of a.items; track item.decision_id) {
                            <li class="flex flex-col gap-0.5 text-ui">
                              <span class="text-fg">{{ item.text }}</span>
                              <span
                                class="flex flex-wrap items-center gap-1.5 text-meta text-fg-muted"
                              >
                                <app-status-badge
                                  meaning="lifecycle"
                                  [value]="item.overdue ? 'overdue' : tone(item.status)"
                                  [labelKey]="
                                    item.overdue
                                      ? 'managementReview.actionStatus.overdue'
                                      : 'managementReview.actionStatus.' + item.status
                                  "
                                />
                                @if (item.owner?.name) {
                                  {{ item.owner?.name }}
                                }
                                @if (item.task; as t) {
                                  <a
                                    [routerLink]="t.url"
                                    class="font-semibold text-accent hover:underline"
                                    >{{ 'managementReview.decisions.taskShort' | transloco }}</a
                                  >
                                }
                              </span>
                            </li>
                          }
                        </ul>
                      } @else if (a.open + a.done + a.overdue > 0) {
                        <p class="mt-1.5 text-meta text-fg-muted">
                          {{ 'managementReview.previous.allDone' | transloco }}
                        </p>
                      }
                    }
                  </div>
                }
                @if (r.next_review; as n) {
                  <div>
                    <p class="text-meta font-semibold text-fg-muted">
                      {{ 'managementReview.previous.nextHeading' | transloco }}
                    </p>
                    <span class="mt-1 block" data-testid="next-review">
                      <app-entity-chip
                        [ref]="neighbourRef(n)"
                        [statusText]="true"
                        [stacked]="true"
                      />
                    </span>
                  </div>
                }
              </div>
            }

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="managementReview.fields.owner"
                [value]="r.owner?.name ?? null"
              />
              <app-field-item
                layout="inline"
                labelKey="managementReview.lead.frameworks"
                [value]="frameworksText() || null"
              />
              <app-field-item layout="inline" labelKey="managementReview.lead.compiledAt">
                @if (r.inputs_compiled_at) {
                  {{ r.inputs_compiled_at | localDate }}
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="managementReview.lead.updated"
                [value]="r.updated_at | localDate"
              />
            </app-record-meta>
            <app-why-it-matters aside-learn [scope]="scope" page="detail" />
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="signOpen()"
            [title]="'managementReview.sign.title' | transloco"
            [message]="'managementReview.sign.message' | transloco: { code: r.code }"
            [confirmLabel]="'managementReview.reviewActions.sign' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            confirmVariant="primary"
            [busy]="busy()"
            [confirmDisabled]="!signName().trim()"
            initialFocus="#mr-sign-name"
            (confirmed)="sign()"
            (cancelled)="signOpen.set(false)"
          >
            <div class="mt-3 flex flex-col gap-3">
              <app-form-field
                [label]="'managementReview.sign.name' | transloco"
                inputId="mr-sign-name"
              >
                <input
                  id="mr-sign-name"
                  type="text"
                  maxlength="200"
                  [value]="signName()"
                  (input)="signName.set($any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'managementReview.sign.statement' | transloco"
                inputId="mr-sign-statement"
              >
                <textarea
                  id="mr-sign-statement"
                  rows="3"
                  maxlength="2000"
                  [value]="signStatement()"
                  (input)="signStatement.set($any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
          </app-confirm-dialog>

          <app-prompt-dialog
            [open]="reasonFor() !== null"
            [title]="
              (reasonFor() === 'cancel'
                ? 'managementReview.cancel.title'
                : 'managementReview.return.title'
              ) | transloco
            "
            [message]="
              (reasonFor() === 'cancel'
                ? 'managementReview.cancel.message'
                : 'managementReview.return.message'
              ) | transloco
            "
            [label]="'managementReview.common.reason' | transloco"
            [confirmLabel]="actionKey(reasonFor() ?? 'return') | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [confirmVariant]="reasonFor() === 'cancel' ? 'danger' : 'primary'"
            [busy]="busy()"
            (confirmed)="confirmReason($event)"
            (cancelled)="reasonFor.set(null)"
          />

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'managementReview.detail.deleteTitle' | transloco"
            [message]="'managementReview.detail.deleteMessage' | transloco: { code: r.code }"
            [confirmLabel]="actionKey('delete') | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class ReviewDetailPage {
  private readonly api = inject(ManagementReviewApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);

  readonly id = input.required<string>();

  protected readonly scope = MR_SCOPE;
  protected readonly settingsLink = MR_SETTINGS_LINK;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = REVIEW_FIELD_LABELS;
  protected readonly sections = REVIEW_SECTIONS;
  protected readonly outputFields = OUTPUT_FIELDS;
  protected readonly draftSummaryAssist = ASSIST_DRAFT_INPUT_SUMMARY;
  protected readonly suggestAssist = ASSIST_SUGGEST_OUTPUTS;
  protected readonly statusKey = reviewStatusKey;
  protected readonly tone = toneValue;
  protected readonly actionKey = reviewActionKey;
  protected readonly assessmentKey = assessmentKey;
  protected readonly categoryKey = decisionCategoryKey;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly review = signal<ReviewDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly savingInput = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly signOpen = signal(false);
  protected readonly signName = signal('');
  protected readonly signStatement = signal('');
  protected readonly reasonFor = signal<'return' | 'cancel' | null>(null);
  protected readonly customTitle = signal('');
  /** All open inputs shown (else the first {@link OPEN_INPUTS_SHOWN}). */
  protected readonly showAllOpen = signal(false);
  /** The "add your own input" field is open. */
  protected readonly addingCustom = signal(false);
  protected readonly suggestions = signal<SuggestedOutputs['decisions']>([]);
  /** Missing items reported by a failed submit (else the server's list). */
  private readonly submitMissing = signal<readonly SubmitRequirement[] | null>(null);
  /** `?section=` of the address (links, reloads and back/forward keep the step). */
  private readonly urlSection = toSignal(
    this.route.queryParamMap.pipe(map((q) => sectionOf(q.get('section')))),
    { initialValue: sectionOf(this.route.snapshot.queryParamMap.get('section')) },
  );
  /** The section picked by the user or the address (else the one with work left). */
  private readonly picked = linkedSignal<ReviewSection | null>(() => this.urlSection());

  protected readonly outputs = linkedSignal<ReviewDetail | null, OutputsDraft>({
    source: this.review,
    computation: (r, previous) => {
      // Keep unsaved text when only the meeting or the inputs changed.
      if (previous && previous.source && r && previous.source.id === r.id) {
        if (Object.keys(outputsPatch(previous.source, previous.value)).length > 0) {
          return previous.value;
        }
      }
      return r ? outputsDraft(r) : outputsDraft({} as ReviewDetail);
    },
  });

  protected readonly crumbs = computed(() =>
    mrCrumbs(
      { labelKey: 'managementReview.nav.reviews', link: '/management-review/reviews' },
      {
        label: this.review()?.code ?? '',
      },
    ),
  );
  protected readonly frameworksText = computed(() =>
    (this.review()?.frameworks ?? [])
      .map((f) => this.language.translate(frameworkKey(f)))
      .join(' · '),
  );
  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(MR_PERMISSIONS.manage),
  );
  protected readonly primary = computed(() => {
    const r = this.review();
    return r ? primaryAction(r) : null;
  });
  protected readonly canSubmit = computed(() => {
    const r = this.review();
    if (!r) {
      return false;
    }
    return (
      (r.can_submit ?? r.missing_for_submit.length === 0) &&
      !this.submitMissing() &&
      !this.outputsDirty()
    );
  });
  protected readonly submitHint = computed(() =>
    this.outputsDirty()
      ? 'managementReview.errors.unsavedOutputs'
      : 'managementReview.signoff.disabledHint',
  );
  /** The review as the sign-off checklist sees it (a refused submit wins). */
  protected readonly checked = computed(() => {
    const r = this.review();
    return r ? this.withSubmitMissing(r) : null;
  });
  protected readonly section = computed<ReviewSection>(() => {
    const r = this.review();
    return this.picked() ?? (r ? defaultSection(r) : 'inputs');
  });
  protected readonly inputsDone = computed(
    () => this.review()?.inputs.filter((i) => inputDone(i)).length ?? 0,
  );
  /** Inputs with work left, in order (U37: what is left comes first). */
  private readonly openInputs = computed<readonly ReviewInput[]>(() =>
    (this.review()?.inputs ?? []).filter((i) => !inputDone(i)),
  );
  protected readonly visibleOpenInputs = computed<readonly ReviewInput[]>(() =>
    this.showAllOpen() ? this.openInputs() : this.openInputs().slice(0, OPEN_INPUTS_SHOWN),
  );
  protected readonly hiddenOpenCount = computed(
    () => this.openInputs().length - this.visibleOpenInputs().length,
  );
  /** Finished inputs (reviewed or not relevant), folded under one disclosure. */
  protected readonly doneInputs = computed<readonly ReviewInput[]>(() =>
    (this.review()?.inputs ?? []).filter((i) => inputDone(i)),
  );
  /** The first input that still needs work opens by itself. */
  protected readonly firstOpenInput = computed(
    () => this.review()?.inputs.find((i) => !inputDone(i))?.id ?? null,
  );
  protected readonly outputsDirty = computed(() => {
    const r = this.review();
    return !!r && Object.keys(outputsPatch(r, this.outputs())).length > 0;
  });
  protected readonly defaultAssignee = computed<AssigneeIn | null>(() => {
    const owner = this.review()?.owner;
    return owner ? { type: 'user', value: owner.id } : null;
  });
  protected readonly askAssessmentPrompt = computed(() =>
    this.language.translate('managementReview.ai.prompts.askAssessment', {
      code: this.review()?.code ?? '-',
      title: this.review()?.title ?? '-',
    }),
  );

  private readonly draftAssist = viewChild<AiAssistButton>('draftAssist');
  private readonly suggestAssistBtn = viewChild<AiAssistButton>('suggestAssistBtn');

  protected readonly statusSentence = computed(() => {
    const r = this.review();
    const locale = this.language.locale();
    return r
      ? reviewStatusSentence(r, (v) => formatLocalDate(v, 'mediumDate', locale))
      : { key: '', params: {}, tone: 'neutral' as StatusLineTone };
  });
  protected readonly statusTone = computed(() => this.statusSentence().tone);
  protected readonly missing = computed<RecordMissingItem[]>(() => {
    const r = this.checked();
    return r
      ? reviewMissing(r, (item) => this.goToMissing(item), [
          '/management-review/reviews',
          r.id,
          'edit',
        ])
      : [];
  });
  protected readonly meetingRef = computed(() => {
    const m = this.review()?.meeting;
    return m ? meetingChip(m) : null;
  });
  protected readonly meetingWhen = computed(() => {
    const m = this.review()?.meeting;
    return m?.held_at || m?.scheduled_at || null;
  });
  /** "Toppledelsen: 1 av 2 til stede", when the meeting has top management on its list. */
  protected readonly topManagement = computed(() => {
    const at = this.review()?.meeting?.attendance;
    return at && at.top_management_total > 0
      ? { present: at.top_management_present, total: at.top_management_total }
      : null;
  });
  protected readonly neighbourRef = reviewChip;

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: MR_MODULE,
      entityType: 'management_review',
      entityId: this.id(),
      view: 'detail',
      title: this.review()?.title ?? null,
      requirements: this.review()?.requirement_refs ?? [],
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
  }

  /** Unsaved text on the page (the route guard asks before leaving). */
  hasUnsavedChanges(): boolean {
    return this.outputsDirty();
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  protected allowed(action: ReviewAction): boolean {
    return this.review()?.allowed_actions.includes(action) ?? false;
  }

  protected done(section: ReviewSection): boolean {
    const r = this.review();
    return !!r && sectionDone(this.withSubmitMissing(r), section) === true;
  }

  protected decisionsFor(category: string): readonly Decision[] {
    return (this.review()?.meeting?.decisions ?? []).filter((d) => d.category === category);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), true);
  }

  protected edit(): void {
    void this.router.navigate(['/management-review/reviews', this.id(), 'edit']);
  }

  protected askSummary(): void {
    const r = this.review();
    if (r) {
      this.ask.showWith(
        this.language.translate('managementReview.ai.prompts.summariseReview', {
          code: r.code,
          title: r.title,
        }),
      );
    }
  }

  /** "Spør KI": run a drafting assist from the header, in the step it fills. */
  protected runAssist(which: 'draft' | 'suggest'): void {
    this.goTo(which === 'draft' ? 'inputs' : 'outputs');
    afterNextRender(
      () => (which === 'draft' ? this.draftAssist() : this.suggestAssistBtn())?.run(),
      { injector: this.injector },
    );
  }

  // --- sections ------------------------------------------------------------------------

  protected goTo(section: ReviewSection, anchor?: string): void {
    this.picked.set(section);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    afterNextRender(
      () => {
        const target = anchor
          ? this.host.nativeElement.querySelector<HTMLElement>(`#${anchor}`)
          : this.host.nativeElement.querySelector<HTMLElement>('[data-testid="mr-sections"]');
        target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
        if (anchor) {
          const focusable = target?.querySelector<HTMLElement>(
            'textarea, input, button, [tabindex]',
          );
          (focusable ?? target)?.focus?.({ preventScroll: true });
        }
      },
      { injector: this.injector },
    );
  }

  protected goToMissing(item: SubmitRequirement): void {
    const target = MISSING_TARGET[item];
    if (item === 'inputs_reviewed') {
      this.showAllOpen.set(true);
    }
    this.goTo(target.section, target.anchor);
  }

  /** The review with the missing items of a refused submit, when there was one. */
  private withSubmitMissing(r: ReviewDetail): ReviewDetail {
    const missing = this.submitMissing();
    if (!missing) {
      return r;
    }
    return {
      ...r,
      missing_for_submit: missing,
      submit_check: r.submit_check ? { ...r.submit_check, missing, ready: false } : r.submit_check,
    };
  }

  // --- workflow ------------------------------------------------------------------------

  protected runAction(action: ReviewAction): void {
    switch (action) {
      case 'start':
        this.mutate((o, id) => this.api.start(o, id), 'managementReview.notices.started');
        break;
      case 'compile':
        this.mutate((o, id) => this.api.compile(o, id), 'managementReview.notices.compiled');
        break;
      case 'submit':
        this.submit();
        break;
      case 'sign':
        this.signName.set(this.auth.user()?.full_name ?? '');
        this.signStatement.set(this.language.translate('managementReview.sign.defaultStatement'));
        this.signOpen.set(true);
        break;
      case 'return':
      case 'cancel':
        this.reasonFor.set(action);
        break;
      case 'delete':
        this.confirmDelete.set(true);
        break;
    }
  }

  private submit(): void {
    if (this.outputsDirty()) {
      this.notifications.error('managementReview.errors.unsavedOutputs');
      return;
    }
    if (!this.canSubmit()) {
      this.goTo('signoff');
      return;
    }
    this.mutate(
      (o, id) => this.api.submit(o, id),
      'managementReview.notices.submitted',
      () => this.picked.set('signoff'),
      (error) => {
        if (mrErrorCode(error) === 'review_incomplete') {
          this.submitMissing.set(missingForSubmit(error) as SubmitRequirement[]);
          this.goTo('signoff');
        }
      },
    );
  }

  protected sign(): void {
    this.mutate(
      (o, id) =>
        this.api.sign(o, id, {
          signature_name: textOrNull(this.signName()),
          statement: textOrNull(this.signStatement()),
        }),
      'managementReview.notices.signed',
      () => this.signOpen.set(false),
    );
  }

  protected confirmReason(reason: string): void {
    const which = this.reasonFor();
    if (!which) {
      return;
    }
    this.mutate(
      (o, id) =>
        which === 'cancel'
          ? this.api.cancel(o, id, textOrNull(reason))
          : this.api.returnReview(o, id, textOrNull(reason)),
      which === 'cancel'
        ? 'managementReview.notices.cancelled'
        : 'managementReview.notices.returned',
      () => this.reasonFor.set(null),
    );
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteReview(orgId, this.id()).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('managementReview.notices.reviewDeleted');
        void this.router.navigate(['/management-review/reviews']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(mrErrorKey(error));
      },
    });
  }

  // --- inputs --------------------------------------------------------------------------

  protected onInputChange(i: ReviewInput, change: InputRowChange): void {
    switch (change.kind) {
      case 'notes':
        this.savingInput.set(i.id);
        this.mutate(
          (o, id) => this.api.updateInput(o, id, i.id, { notes: change.notes }),
          null,
          () => this.savingInput.set(null),
          () => this.savingInput.set(null),
          true,
        );
        break;
      case 'reviewed':
        this.mutate(
          (o, id) => this.api.updateInput(o, id, i.id, { reviewed: change.reviewed }),
          null,
        );
        break;
      case 'notRelevant':
        this.mutate(
          (o, id) =>
            this.api.updateInput(o, id, i.id, {
              not_relevant: change.notRelevant,
              not_relevant_reason: change.notRelevant ? change.reason : null,
            }),
          change.notRelevant ? 'managementReview.notices.markedNotRelevant' : null,
        );
        break;
      case 'remove':
        this.mutate(
          (o, id) => this.api.deleteInput(o, id, i.id),
          'managementReview.notices.inputRemoved',
        );
        break;
      case 'compile':
        this.runAction('compile');
        break;
    }
  }

  protected addInput(): void {
    const title = this.customTitle().trim();
    if (!title) {
      return;
    }
    this.mutate(
      (o, id) => this.api.addInput(o, id, { title }),
      'managementReview.notices.inputAdded',
      () => {
        this.customTitle.set('');
        this.addingCustom.set(false);
      },
    );
  }

  // --- outputs -------------------------------------------------------------------------

  protected setText(key: TextKey, value: string): void {
    this.outputs.update((d) => ({ ...d, [key]: value }));
  }

  protected setCriterion(criterion: Criterion, value: CriterionValue): void {
    this.outputs.update((d) => ({ ...d, criteria: { ...d.criteria, [criterion]: value } }));
  }

  protected discardOutputs(): void {
    const r = this.review();
    if (r) {
      this.outputs.set(outputsDraft(r));
    }
  }

  protected saveOutputs(): void {
    const r = this.review();
    if (!r) {
      return;
    }
    const patch = outputsPatch(r, this.outputs());
    if (!Object.keys(patch).length) {
      return;
    }
    this.submitMissing.set(null);
    this.mutate(
      (o, id) => this.api.updateReview(o, id, patch),
      'managementReview.notices.outputsSaved',
      () => {
        const fresh = this.review();
        if (fresh) {
          this.outputs.set(outputsDraft(fresh));
        }
      },
    );
  }

  protected onSuggestions(result: unknown): void {
    const decisions = (result as Partial<SuggestedOutputs> | null)?.decisions;
    this.suggestions.set(
      Array.isArray(decisions)
        ? decisions.filter(
            (d): d is SuggestedOutputs['decisions'][number] =>
              !!d && typeof d.text === 'string' && typeof d.category === 'string',
          )
        : [],
    );
  }

  protected useSuggestion(index: number): void {
    const s = this.suggestions()[index];
    if (!s) {
      return;
    }
    const field = outputFieldFor(s.category);
    this.outputs.update((d) => ({ ...d, [field]: appendLine(d[field], s.text) }));
    this.dismissSuggestion(index);
  }

  protected recordSuggestion(index: number): void {
    const s = this.suggestions()[index];
    const meeting = this.review()?.meeting;
    const orgId = this.selectedOrg.currentOrgId();
    if (!s || !meeting || !orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .addDecision(orgId, meeting.id, {
        text: s.text,
        category: s.category,
        create_action: s.category === 'action',
      })
      .subscribe({
        next: (m) => {
          this.busy.set(false);
          this.notifications.success('managementReview.notices.decisionSaved');
          this.dismissSuggestion(index);
          this.onMeetingChanged(m);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(mrErrorKey(error));
        },
      });
  }

  protected dismissSuggestion(index: number): void {
    this.suggestions.update((list) => list.filter((_, i) => i !== index));
  }

  // --- meeting -------------------------------------------------------------------------

  protected onMeetingChanged(meeting: MeetingDetail): void {
    this.review.update((r) => (r ? { ...r, meeting } : r));
    this.submitMissing.set(null);
    // The meeting drives the sign-off checklist and the action counts: refresh quietly.
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  // --- plumbing ------------------------------------------------------------------------

  private mutate(
    call: (orgId: string, id: string) => Observable<ReviewDetail>,
    successKey: string | null,
    done?: () => void,
    failed?: (error: unknown) => void,
    quiet = false,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || (!quiet && this.busy())) {
      return;
    }
    if (!quiet) {
      this.busy.set(true);
    }
    call(orgId, this.id()).subscribe({
      next: (r) => {
        if (!quiet) {
          this.busy.set(false);
        }
        this.submitMissing.set(null);
        this.review.set(r);
        done?.();
        if (successKey) {
          this.notifications.success(successKey);
        }
      },
      error: (error: unknown) => {
        if (!quiet) {
          this.busy.set(false);
        }
        failed?.(error);
        this.notifications.error(mrErrorKey(error));
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
      this.suggestions.set([]);
      this.submitMissing.set(null);
    }
    this.request = this.api.getReview(orgId, id).subscribe({
      next: (r) => {
        this.review.set(r);
        this.state.set('ready');
      },
      error: () => {
        if (showLoading) {
          this.state.set('error');
        }
      },
    });
  }
}
