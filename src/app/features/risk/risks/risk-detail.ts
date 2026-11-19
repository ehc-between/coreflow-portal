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
import { AiAssistApi } from '../../../core/ai/ai-assist-api';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { providePageContext } from '../../../core/ai/page-context';
import { SseStream } from '../../../core/ai/sse-client';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { Term } from '../../../shared/guidance/term';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
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
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RiskApi } from '../data/risk-api';
import {
  appetiteState,
  canonicalControlRef,
  controlsOf,
  currentRating,
  frameworksForCategory,
  fromDateInput,
  riskStatusValue,
  toDateInput,
} from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import {
  ControlSuggestion,
  PATCHABLE_RISK_STATUSES,
  PatchableRiskStatus,
  Risk,
  TreatmentPlan,
} from '../data/risk.models';
import { ControlList } from '../shared/control-list';
import { RatingBadge } from '../shared/rating-badge';
import { RiskPermissions } from '../shared/risk-permissions';
import { RiskTreatments } from './risk-treatments';

function titleOf(risk: Risk | null): string | null {
  return risk ? `${risk.code} ${risk.title}` : null;
}

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> label key, for the revisions tab. */
export const RISK_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'risk.fields.title',
  description: 'risk.fields.description',
  register_id: 'risk.fields.register',
  status: 'risk.fields.status',
  source_type: 'risk.fields.sourceType',
  source_ref: 'risk.fields.sourceRef',
  source_entity_type: 'risk.fields.sourceEntity',
  source_entity_id: 'risk.fields.sourceEntity',
  threat: 'risk.fields.threat',
  vulnerability: 'risk.fields.vulnerability',
  consequence_text: 'risk.fields.consequence',
  affected_properties: 'risk.fields.affectedProperties',
  owner_user_id: 'risk.fields.riskOwner',
  department_id: 'risk.fields.department',
  inherent_likelihood: 'risk.fields.inherentLikelihood',
  inherent_consequence: 'risk.fields.inherentConsequence',
  inherent_score: 'risk.fields.inherentScore',
  inherent_level: 'risk.fields.inherent',
  treatment_strategy: 'risk.fields.strategy',
  treatment_notes: 'risk.fields.treatmentNotes',
  residual_likelihood: 'risk.fields.residualLikelihood',
  residual_consequence: 'risk.fields.residualConsequence',
  residual_score: 'risk.fields.residualScore',
  residual_level: 'risk.fields.residual',
  control_refs: 'risk.fields.controlRefs',
  review_interval_months: 'risk.fields.reviewInterval',
  next_review_at: 'risk.fields.nextReview',
  last_reviewed_at: 'risk.fields.lastReviewed',
  accepted_at: 'risk.fields.acceptedAt',
  acceptance_note: 'risk.fields.acceptanceNote',
  acceptance_expires_at: 'risk.fields.acceptanceExpires',
};

/** The status sentence of a risk ("Over risikoappetitten – …"), docs/ux-guide.md §2.7. */
export interface RiskStatusSentence {
  readonly key: string;
  readonly tone: StatusLineTone;
}

/**
 * How the risk stands, in one sentence: closed, not rated yet, accepted, above or
 * within the appetite. Open work is `warn`, never `fail`; a low risk is not an
 * achievement, so "within the appetite" is neutral, not green.
 */
export function riskStatusSentence(risk: Risk): RiskStatusSentence | null {
  if (risk.status === 'closed') {
    return { key: 'risk.detail.statusLine.closed', tone: 'neutral' };
  }
  if (!risk.inherent && !risk.residual) {
    return { key: 'risk.detail.statusLine.unrated', tone: 'warn' };
  }
  const appetite = appetiteState(risk);
  if (risk.acceptance || appetite === 'accepted') {
    return { key: 'risk.detail.statusLine.accepted', tone: 'neutral' };
  }
  if (appetite === 'above') {
    return { key: 'risk.detail.statusLine.above', tone: 'warn' };
  }
  if (risk.appetite_max_score !== null && risk.appetite_max_score !== undefined) {
    return { key: 'risk.detail.statusLine.within', tone: 'neutral' };
  }
  return null;
}

/** What a risk still needs ("Oppfølging"): each line a link to the form or an action. */
export function riskMissing(
  risk: Risk,
  editLink: readonly unknown[],
  actions: { review: (() => void) | null; addTreatment: (() => void) | null },
): RecordMissingItem[] {
  if (!risk.can_edit || risk.status === 'closed') {
    return [];
  }
  const items: RecordMissingItem[] = [];
  if (risk.review_overdue && actions.review) {
    items.push({ key: 'review', labelKey: 'risk.detail.missing.review', action: actions.review });
  }
  if (!risk.inherent && !risk.residual) {
    items.push({ key: 'rating', labelKey: 'risk.detail.missing.rating', link: editLink });
  }
  if (!risk.treatment_strategy) {
    items.push({ key: 'strategy', labelKey: 'risk.detail.missing.strategy', link: editLink });
  }
  if (
    risk.treatment_strategy === 'mitigate' &&
    risk.treatments.open + risk.treatments.done === 0 &&
    actions.addTreatment
  ) {
    items.push({
      key: 'treatments',
      labelKey: 'risk.detail.missing.treatments',
      action: actions.addTreatment,
    });
  }
  if (!risk.owner) {
    items.push({ key: 'owner', labelKey: 'risk.detail.missing.owner', link: editLink });
  }
  return items;
}

type RiskAssist = 'controls' | 'plan';

/**
 * One risk, on the detail-page anatomy (docs/ux-guide.md §2.7). "Hovedinformasjon"
 * says what could happen, how serious it is (before -> after treatment, against
 * the appetite), how it is handled and what it concerns; the details tab holds the
 * rest of the analysis, the acceptance sign-off, the treatment plan and the cited
 * controls (linked to the SoA). The "Oppfølging" card lists what is missing, the
 * requirements the risk documents, its connections and the owner / review dates.
 * Assistant actions (explain, suggest controls, draft a treatment plan) sit in the
 * header's "Spør KI" menu.
 */
@Component({
  selector: 'app-risk-detail',
  imports: [
    TourStepDirective,
    RouterLink,
    TranslocoPipe,
    Term,
    EntityChip,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    LocalDayPipe,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FormField,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PromptDialog,
    StatusBadge,
    ControlList,
    RatingBadge,
    RiskTreatments,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (risk(); as r) {
      @let rating = current();
      <app-record-detail-layout
        [anatomy]="true"
        entityType="risk"
        [entityId]="r.id"
        [title]="r.title"
        [breadcrumbs]="[
          { labelKey: 'modules.names.risk', link: '/risk' },
          { labelKey: 'risk.risks.title', link: '/risk/risks' },
          { label: r.code },
        ]"
        settingsLink="/settings/modules/risk"
        [tabs]="tabs"
        [canEdit]="r.can_edit"
        [includeAudit]="perms.canReadAudit()"
        [fieldLabels]="fieldLabels"
        [missing]="missing()"
        backLink="/risk/risks"
        backLabelKey="risk.common.backToRisks"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="risk-code">{{ r.code }}</span>
          <span aria-hidden="true">·</span>
          <a
            [routerLink]="['/settings/modules/risk/registers', r.register.id]"
            class="hover:text-fg hover:underline"
          >
            {{ r.register.name }}
          </a>
          <span aria-hidden="true">·</span>
          <app-status-badge
            meaning="lifecycle"
            [value]="statusValue(r.status)"
            [labelKey]="'risk.status.' + r.status"
          />
          @if (r.review_overdue) {
            <app-badge tone="warn">{{ 'risk.detail.reviewOverdue' | transloco }}</app-badge>
          }
        </ng-container>

        @if (r.can_edit) {
          <app-button primary (click)="edit()" data-testid="risk-edit">
            {{ 'risk.common.edit' | transloco }}
          </app-button>
        }
        @if (canReview() && r.review_overdue) {
          <app-button secondary variant="secondary" (click)="reviewOpen.set(true)">
            <app-icon name="checkcircle" [size]="14" />
            {{ 'risk.detail.review' | transloco }}
          </app-button>
        }
        @if (canAccept() && acceptIsNext()) {
          <app-button
            secondary
            variant="secondary"
            (click)="openAccept()"
            data-testid="risk-accept"
          >
            {{ 'risk.detail.accept' | transloco }}
          </app-button>
        }
        @if (canReview() && !r.review_overdue) {
          <button appMenuItem overflow type="button" (click)="reviewOpen.set(true)">
            {{ 'risk.detail.review' | transloco }}
          </button>
        }
        @if (canAccept() && !acceptIsNext()) {
          <button
            appMenuItem
            overflow
            type="button"
            [disabled]="!rated()"
            [attr.title]="rated() ? null : ('risk.detail.acceptNeedsRating' | transloco)"
            (click)="openAccept()"
            data-testid="risk-accept"
          >
            {{ 'risk.detail.accept' | transloco }}
          </button>
        }
        @if (r.can_edit && r.status !== 'closed' && !r.acceptance) {
          <button
            appMenuItem
            overflow
            type="button"
            (click)="openStatus()"
            data-testid="risk-change-status"
          >
            {{ 'risk.detail.changeStatusAction' | transloco }}
          </button>
        }
        @if (r.can_accept && r.status !== 'closed' && r.acceptance) {
          <button appMenuItem overflow type="button" (click)="revokeOpen.set(true)">
            {{ 'risk.detail.revoke' | transloco }}
          </button>
        }
        @if (r.can_delete) {
          <button appMenuItem overflow type="button" [danger]="true" (click)="deleteOpen.set(true)">
            {{ 'risk.common.delete' | transloco }}
          </button>
        }

        <button appMenuItem ask type="button" (click)="explain()">
          <app-icon name="spark" [size]="15" />
          {{ 'risk.ai.explainRating' | transloco }}
        </button>
        @if (r.can_edit && r.status !== 'closed') {
          <button
            appMenuItem
            ask
            type="button"
            [disabled]="!!assisting()"
            (click)="runAssist('plan')"
            data-testid="risk-ai-plan"
          >
            <app-icon name="spark" [size]="15" />
            {{ 'risk.ai.draftTreatment' | transloco }}
          </button>
        }
        @if (r.can_edit) {
          <button
            appMenuItem
            ask
            type="button"
            [disabled]="!!assisting()"
            (click)="runAssist('controls')"
            data-testid="risk-ai-controls"
          >
            <app-icon name="spark" [size]="15" />
            {{ 'risk.ai.suggestControls' | transloco }}
          </button>
        }

        <app-help-strip help scope="risk" page="detail" tour="detail" lesson="treating-risks" />

        <app-record-lead record-lead [fillLink]="r.can_edit ? editLink() : null">
          @if (statusSentence(); as s) {
            <app-record-status-line status [tone]="s.tone" data-testid="risk-status-line">
              {{
                s.key
                  | transloco
                    : {
                        name:
                          r.acceptance?.accepted_by?.name ?? ('risk.common.unknown' | transloco),
                        score: r.appetite_max_score,
                      }
              }}
            </app-record-status-line>
          }
          <app-field-item
            size="lead"
            labelKey="risk.detail.lead.what"
            [wide]="true"
            [value]="r.description"
            [multiline]="true"
          />
          <app-field-item
            size="lead"
            labelKey="risk.detail.lead.level"
            [appTourStep]="'risk-ratings'"
          >
            @if (rating) {
              <span class="flex flex-col gap-2" data-testid="risk-level">
                <span class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  @if (r.inherent; as i) {
                    <span class="text-ui text-fg-muted">
                      <app-term scope="risk" key="inherent-risk">{{
                        'risk.detail.before' | transloco
                      }}</app-term>
                    </span>
                    <app-rating-badge
                      [score]="i.score"
                      [level]="i.level"
                      [label]="i.label"
                      [color]="i.color"
                    />
                  }
                  @if (r.inherent && r.residual) {
                    <span aria-hidden="true" class="text-fg-subtle">→</span>
                  }
                  @if (r.residual; as res) {
                    <span class="text-ui text-fg-muted">
                      <app-term scope="risk" key="residual-risk">{{
                        'risk.detail.after' | transloco
                      }}</app-term>
                    </span>
                    <app-rating-badge
                      [score]="res.score"
                      [level]="res.level"
                      [label]="res.label"
                      [color]="res.color"
                    />
                  }
                </span>
                @if (!r.residual) {
                  <span class="text-ui text-fg-muted">{{
                    'risk.detail.noResidual' | transloco
                  }}</span>
                }
                @if (appetiteMax() !== null) {
                  <span class="text-meta text-fg-subtle" data-testid="risk-appetite-line">
                    <app-term scope="risk" key="risk-appetite">{{
                      'risk.overview.appetiteTerm' | transloco
                    }}</app-term
                    >: {{ 'risk.detail.appetiteLine' | transloco: { score: appetiteMax() } }}
                  </span>
                }
              </span>
            }
          </app-field-item>
          <app-field-item size="lead" labelKey="risk.detail.lead.handling">
            @if (r.treatment_strategy || r.treatment_notes || hasTreatments()) {
              <span class="flex flex-col gap-1">
                @if (r.treatment_strategy) {
                  <span>{{ 'risk.strategies.' + r.treatment_strategy | transloco }}</span>
                }
                @if (hasTreatments()) {
                  <a
                    href="#risk-treatments"
                    class="text-ui font-semibold text-accent hover:underline"
                    (click)="$event.preventDefault(); scrollTo('risk-treatments')"
                    >{{
                      'risk.detail.treatmentCounts'
                        | transloco: { open: r.treatments.open, done: r.treatments.done }
                    }}</a
                  >
                }
                @if (r.treatment_notes) {
                  <span class="text-ui whitespace-pre-line text-fg-muted">{{
                    r.treatment_notes
                  }}</span>
                }
              </span>
            }
          </app-field-item>
          <app-field-item size="lead" labelKey="risk.detail.lead.concerns">
            @if (r.source_type || r.source_entity || r.source_ref) {
              <span class="flex flex-col gap-1">
                @if (r.source_type) {
                  <span>{{ 'risk.sourceTypes.' + r.source_type | transloco }}</span>
                }
                @if (r.source_entity; as entity) {
                  <app-entity-chip [ref]="entity" data-testid="risk-subject" />
                } @else if (r.source_ref) {
                  <span class="text-ui text-fg-muted">{{ r.source_ref }}</span>
                }
              </span>
            }
          </app-field-item>
        </app-record-lead>

        <div class="flex flex-col gap-8">
          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }

          <app-record-details [columns]="2" [fillLink]="r.can_edit ? editLink() : null">
            <app-field-item
              labelKey="risk.detail.plain.threat"
              [value]="r.threat"
              [multiline]="true"
            />
            <app-field-item
              labelKey="risk.detail.plain.vulnerability"
              [value]="r.vulnerability"
              [multiline]="true"
            />
            <app-field-item
              labelKey="risk.detail.plain.consequence"
              [value]="r.consequence_text"
              [multiline]="true"
            />
            <app-field-item labelKey="risk.detail.plain.properties" [value]="properties()" />
            <app-field-item
              labelKey="risk.fields.category"
              [value]="'risk.categories.' + r.category | transloco"
            />
            <app-field-item labelKey="risk.fields.department" [value]="r.department?.name" />
            <app-field-item
              labelKey="risk.detail.plain.statusReason"
              [wide]="true"
              [value]="r.status_reason"
              [multiline]="true"
            />
          </app-record-details>

          @if (r.acceptance; as a) {
            <section data-testid="risk-acceptance" aria-labelledby="risk-acceptance-title">
              <h2 id="risk-acceptance-title" class="mb-2 font-display text-card font-bold text-fg">
                {{ 'risk.detail.acceptance' | transloco }}
              </h2>
              <p class="text-body text-fg">
                {{
                  'risk.detail.acceptedBy'
                    | transloco
                      : {
                          name: a.accepted_by?.name ?? ('risk.common.unknown' | transloco),
                          date: (a.accepted_at | localDay),
                        }
                }}
              </p>
              <p class="mt-1 text-ui text-fg-muted">
                {{
                  a.expires_at
                    ? ('risk.detail.acceptanceExpires'
                      | transloco: { date: (a.expires_at | localDay) })
                    : ('risk.detail.acceptanceUntilReview' | transloco)
                }}
              </p>
              @if (a.note) {
                <p class="mt-2 text-body whitespace-pre-line text-fg-muted">{{ a.note }}</p>
              }
            </section>
          }

          <section id="risk-treatments" class="scroll-mt-20">
            @if (assisting() === 'plan') {
              <p class="mb-2 text-ui text-fg-muted" role="status" data-testid="risk-ai-running">
                <app-icon name="spark" [size]="14" />
                {{ 'risk.ai.working' | transloco }}
              </p>
            }
            <app-risk-treatments
              [appTourStep]="'risk-treatments'"
              [risk]="r"
              [canEdit]="r.can_edit && r.status !== 'closed'"
              [focusId]="treatmentFocus()"
              [(plan)]="plan"
              (changed)="reload()"
              (planApplied)="applyPlan($event)"
              (rerate)="rerate()"
            />
          </section>

          <section
            id="risk-controls"
            class="scroll-mt-20"
            data-testid="risk-controls"
            aria-labelledby="risk-controls-title"
          >
            <h2 id="risk-controls-title" class="mb-1 font-display text-card font-bold text-fg">
              {{ 'risk.detail.controls' | transloco }}
            </h2>
            <p class="mb-3 text-meta text-fg-muted">{{ 'risk.detail.controlsHint' | transloco }}</p>
            @if (assisting() === 'controls') {
              <p class="mb-2 text-ui text-fg-muted" role="status" data-testid="risk-ai-running">
                <app-icon name="spark" [size]="14" />
                {{ 'risk.ai.working' | transloco }}
              </p>
            }
            @if (assistFailed()) {
              <app-alert tone="error" class="mb-3 block">{{
                'risk.ai.failed' | transloco
              }}</app-alert>
            }
            @if (controlSuggestions().length) {
              <section
                class="mb-3 rounded-card border border-accent/30 bg-accent-soft p-3 text-ui"
                aria-live="polite"
                [attr.aria-label]="'risk.ai.controlsTitle' | transloco"
              >
                <div class="mb-2 flex items-center justify-between">
                  <h3 class="font-semibold text-fg">{{ 'risk.ai.controlsTitle' | transloco }}</h3>
                  <button
                    type="button"
                    class="text-meta font-semibold text-fg-muted hover:text-fg"
                    (click)="controlSuggestions.set([])"
                  >
                    {{ 'risk.common.dismiss' | transloco }}
                  </button>
                </div>
                <ul class="flex flex-col gap-2">
                  @for (c of controlSuggestions(); track c.ref) {
                    <li
                      class="flex flex-col gap-2 rounded-tile bg-surface p-2.5 sm:flex-row sm:items-start"
                    >
                      <div class="min-w-0 flex-1">
                        <p class="font-semibold text-fg">
                          {{ suggestionNumber(c.ref) }}
                          @if (c.title) {
                            · {{ c.title }}
                          }
                        </p>
                        @if (c.reason) {
                          <p class="text-fg-muted">{{ c.reason }}</p>
                        }
                      </div>
                      @if (hasControl(c.ref)) {
                        <app-badge tone="pass">{{ 'risk.ai.added' | transloco }}</app-badge>
                      } @else {
                        <app-button size="sm" variant="secondary" (click)="addControl(c.ref)">
                          {{ 'risk.ai.add' | transloco }}
                        </app-button>
                      }
                    </li>
                  }
                </ul>
              </section>
            }
            <app-risk-control-list [controls]="controls()" emptyKey="risk.detail.noControls" />
          </section>
        </div>

        <app-supports-requirements
          aside-requirements
          entityType="risk"
          [entityId]="r.id"
          [canEdit]="r.can_edit"
          [frameworks]="frameworks()"
        />

        <app-record-meta follow-up-meta>
          <app-field-item
            layout="inline"
            labelKey="risk.fields.riskOwner"
            [value]="r.owner?.name"
          />
          <app-field-item
            layout="inline"
            labelKey="risk.fields.lastReviewed"
            [value]="r.last_reviewed_at ? (r.last_reviewed_at | localDay) : null"
          />
          <app-field-item
            layout="inline"
            labelKey="risk.fields.nextReview"
            [keepEmpty]="r.status !== 'closed'"
            emptyKey="kit.detail.meta.notPlanned"
            emptyActionKey="kit.detail.meta.plan"
            [emptyLink]="r.can_edit ? editLink() : null"
          >
            @if (r.next_review_at) {
              <span [class.text-warn-ink]="r.review_overdue">{{
                r.next_review_at | localDay
              }}</span>
            }
          </app-field-item>
          <app-field-item
            layout="inline"
            labelKey="risk.fields.updatedAt"
            [value]="r.updated_at | localDate"
          />
        </app-record-meta>
      </app-record-detail-layout>

      <app-prompt-dialog
        [open]="reviewOpen()"
        [title]="'risk.detail.reviewTitle' | transloco"
        [message]="'risk.detail.reviewMessage' | transloco"
        [label]="'risk.detail.reviewNote' | transloco"
        [confirmLabel]="'risk.detail.review' | transloco"
        [cancelLabel]="'risk.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="review($event)"
        (cancelled)="reviewOpen.set(false)"
      />

      <app-prompt-dialog
        [open]="revokeOpen()"
        [title]="'risk.detail.revokeTitle' | transloco"
        [message]="'risk.detail.revokeMessage' | transloco"
        [label]="'risk.detail.reason' | transloco"
        confirmVariant="danger"
        [confirmLabel]="'risk.detail.revoke' | transloco"
        [cancelLabel]="'risk.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="revoke($event)"
        (cancelled)="revokeOpen.set(false)"
      />

      <app-confirm-dialog
        [open]="statusOpen()"
        [title]="'risk.detail.statusTitle' | transloco"
        confirmVariant="primary"
        [confirmLabel]="'risk.common.save' | transloco"
        [cancelLabel]="'risk.common.cancel' | transloco"
        [busy]="busy()"
        [confirmDisabled]="
          !statusChoice() || (statusChoice() === 'closed' && !statusReason().trim())
        "
        (confirmed)="setStatus()"
        (cancelled)="statusOpen.set(false)"
      >
        <div class="mt-3 flex flex-col gap-3" data-testid="risk-status-dialog">
          <app-form-field [label]="'risk.detail.newStatus' | transloco" inputId="risk-status">
            <select id="risk-status" (change)="statusChoice.set($any($event.target).value)">
              @if (r.status === 'accepted') {
                <option value="" selected disabled>
                  {{ 'risk.status.accepted' | transloco }}
                </option>
              }
              @for (s of patchableStatuses; track s) {
                <option [value]="s" [selected]="s === statusChoice()">
                  {{ 'risk.status.' + s | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field
            [label]="
              (statusChoice() === 'closed' ? 'risk.detail.reasonRequired' : 'risk.detail.reason')
                | transloco
            "
            inputId="risk-status-reason"
          >
            <textarea
              id="risk-status-reason"
              rows="3"
              [value]="statusReason()"
              (input)="statusReason.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
        </div>
      </app-confirm-dialog>

      <app-confirm-dialog
        [open]="acceptOpen()"
        [title]="'risk.detail.acceptTitle' | transloco"
        [message]="
          (r.above_appetite ? 'risk.detail.acceptAboveAppetite' : 'risk.detail.acceptMessage')
            | transloco
        "
        confirmVariant="primary"
        [confirmLabel]="'risk.detail.acceptConfirm' | transloco"
        [cancelLabel]="'risk.common.cancel' | transloco"
        [busy]="busy()"
        [confirmDisabled]="r.above_appetite && !acceptNote().trim()"
        (confirmed)="accept()"
        (cancelled)="acceptOpen.set(false)"
      >
        <div class="mt-3 flex flex-col gap-3">
          <p
            class="rounded-tile border border-border bg-surface-2 px-3 py-2 text-ui text-fg"
            data-testid="accept-signer"
          >
            <app-icon name="checkcircle" [size]="14" />
            {{ 'risk.detail.acceptSigner' | transloco: { name: signer() } }}
          </p>
          <app-form-field
            [label]="
              (r.above_appetite
                ? 'risk.fields.acceptanceNoteRequired'
                : 'risk.fields.acceptanceNote'
              ) | transloco
            "
            inputId="risk-accept-note"
          >
            <textarea
              id="risk-accept-note"
              rows="3"
              [attr.aria-required]="r.above_appetite || null"
              [value]="acceptNote()"
              (input)="acceptNote.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
          @if (r.above_appetite && !acceptNote().trim()) {
            <p class="text-meta text-fg-muted">{{ 'risk.detail.acceptNoteHint' | transloco }}</p>
          }
          <app-form-field
            [label]="'risk.fields.acceptanceExpires' | transloco"
            inputId="risk-accept-expiry"
          >
            <input
              id="risk-accept-expiry"
              type="date"
              [value]="acceptExpiry()"
              (input)="acceptExpiry.set($any($event.target).value)"
            />
          </app-form-field>
          <p class="text-meta text-fg-subtle">{{ 'risk.detail.acceptExpiryHint' | transloco }}</p>
        </div>
      </app-confirm-dialog>

      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'risk.detail.deleteTitle' | transloco"
        [message]="'risk.detail.deleteMessage' | transloco: { code: r.code }"
        [confirmLabel]="'risk.common.delete' | transloco"
        [cancelLabel]="'risk.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="deleteOpen.set(false)"
      />
    } @else if (state() === 'error') {
      <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
        <app-error-state [bodyKey]="loadErrorKey()" (retry)="reload()" />
        <a
          routerLink="/risk/risks"
          class="mt-3 inline-block text-ui font-semibold text-accent hover:underline"
        >
          {{ 'risk.common.backToRisks' | transloco }}
        </a>
      </div>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
    }
  `,
})
export class RiskDetailPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly assistApi = inject(AiAssistApi);
  private readonly availability = inject(AiAvailability);
  protected readonly perms = inject(RiskPermissions);

  readonly id = input.required<string>();
  /** `?treatment=<id>` (entity URL of a treatment). */
  readonly treatment = input<string | undefined>(undefined);

  private readonly treatmentsRef = viewChild(RiskTreatments);

  protected readonly tabs = TABS;
  protected readonly fieldLabels = RISK_FIELD_LABELS;
  protected readonly patchableStatuses = PATCHABLE_RISK_STATUSES;
  protected readonly statusValue = riskStatusValue;

  protected readonly risk = signal<Risk | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadErrorKey = signal('risk.common.loadFailed');
  protected readonly errorKey = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly reviewOpen = signal(false);
  protected readonly revokeOpen = signal(false);
  protected readonly acceptOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly statusOpen = signal(false);
  protected readonly statusChoice = signal<PatchableRiskStatus | ''>('');
  protected readonly statusReason = signal('');
  protected readonly acceptNote = signal('');
  protected readonly acceptExpiry = signal('');
  protected readonly controlSuggestions = signal<readonly ControlSuggestion[]>([]);
  /** The drafted treatment plan (shown in the treatment section). */
  protected readonly plan = signal<TreatmentPlan | null>(null);
  protected readonly assisting = signal<RiskAssist | null>(null);
  protected readonly assistFailed = signal(false);
  private assistStream: SseStream | null = null;
  private sub: Subscription | null = null;

  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/risk/risks',
    this.id(),
    'edit',
  ]);
  protected readonly treatmentFocus = computed(() => this.treatment() ?? null);
  protected readonly current = computed(() => {
    const risk = this.risk();
    return risk ? currentRating(risk) : null;
  });
  protected readonly rated = computed(() => !!this.risk()?.inherent || !!this.risk()?.residual);
  protected readonly hasTreatments = computed(() => {
    const t = this.risk()?.treatments;
    return !!t && t.open + t.done > 0;
  });
  protected readonly statusSentence = computed(() => {
    const risk = this.risk();
    return risk ? riskStatusSentence(risk) : null;
  });
  protected readonly canReview = computed(() => {
    const r = this.risk();
    return !!r && r.can_edit && r.status !== 'closed';
  });
  protected readonly canAccept = computed(() => {
    const r = this.risk();
    return !!r && r.can_accept && r.status !== 'closed' && !r.acceptance;
  });
  /** Accepting is the obvious next step when the decision was "accept" and it is rated. */
  protected readonly acceptIsNext = computed(
    () => this.rated() && this.risk()?.treatment_strategy === 'accept',
  );
  /** "Oppfølging" (§2.7): what an editor still has to do, each a link or an action. */
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const r = this.risk();
    if (!r) {
      return [];
    }
    return riskMissing(r, this.editLink(), {
      review: this.canReview() ? () => this.reviewOpen.set(true) : null,
      addTreatment: () => this.addTreatment(),
    });
  });
  protected readonly appetiteMax = computed(() => this.risk()?.appetite_max_score ?? null);
  protected readonly controls = computed(() => {
    const risk = this.risk();
    return risk ? controlsOf(risk) : [];
  });
  /** Canonical refs of the cited controls (page context, "already added"). */
  private readonly controlRefs = computed(() => this.controls().map((c) => c.ref));
  /** Standards the requirement suggestions are narrowed to (from the register category). */
  protected readonly frameworks = computed(() => {
    const risk = this.risk();
    if (!risk) {
      return null;
    }
    const list = risk.frameworks?.length ? risk.frameworks : frameworksForCategory(risk.category);
    return list.length ? list : null;
  });
  protected readonly properties = computed(() =>
    (this.risk()?.affected_properties ?? [])
      .map((p) => this.translate(`risk.properties.${p}`))
      .join(', '),
  );
  protected readonly signer = computed(() => this.auth.displayName() || '');

  private translate(key: string, params?: Record<string, unknown>): string {
    return this.language.translate(key, params);
  }

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'risk',
      entityId: this.id(),
      view: 'detail',
      title: titleOf(this.risk()),
      requirements: this.controlRefs(),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    inject(DestroyRef).onDestroy(() => {
      this.sub?.unsubscribe();
      this.assistStream?.cancel();
    });
  }

  private load(orgId: string | null, id: string): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.sub = this.api.getRisk(orgId, id).subscribe({
      next: (risk) => {
        this.risk.set(risk);
        this.state.set('ready');
      },
      error: (e: unknown) => {
        this.risk.set(null);
        this.loadErrorKey.set(riskErrorKey(e));
        this.state.set('error');
      },
    });
  }

  reload(): void {
    this.load(this.perms.orgId(), this.id());
  }

  protected edit(): void {
    void this.router.navigate(this.editLink());
  }

  protected scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** "Legg til tiltak" from the follow-up card: open the new-treatment panel. */
  protected addTreatment(): void {
    this.scrollTo('risk-treatments');
    this.treatmentsRef()?.openNew();
  }

  /** After an effectiveness check: re-rate the residual risk on the edit form. */
  protected rerate(): void {
    void this.router.navigate(this.editLink(), { queryParams: { step: 'assess' } });
  }

  protected explain(): void {
    this.ask.askAbout(this.translate('risk.ask.rating'), { field: 'rating' });
  }

  /** Run an assistant action from the "Spør KI" menu; the result shows in its section. */
  protected runAssist(kind: RiskAssist): void {
    const orgId = this.perms.orgId();
    const risk = this.risk();
    if (!orgId || !risk || this.assisting()) {
      return;
    }
    this.assistFailed.set(false);
    this.assisting.set(kind);
    this.scrollTo(kind === 'plan' ? 'risk-treatments' : 'risk-controls');
    const key = kind === 'plan' ? 'risk.draft_treatment' : 'risk.suggest_controls';
    this.assistStream = this.assistApi.run(
      orgId,
      key,
      { input: { risk_id: risk.id }, entity_type: 'risk', entity_id: risk.id },
      (event) => {
        switch (event.type) {
          case 'result':
            if (kind === 'plan') {
              if (event.data && typeof event.data === 'object') {
                this.plan.set(event.data as TreatmentPlan);
              }
            } else {
              this.onControls(event.data);
            }
            break;
          case 'done':
            this.finishAssist();
            break;
          case 'error':
            this.assistFailed.set(true);
            this.finishAssist();
            break;
          case 'not-configured':
            this.availability.markUnavailable();
            this.assistFailed.set(true);
            this.finishAssist();
            break;
        }
      },
    );
  }

  private finishAssist(): void {
    this.assisting.set(null);
    this.assistStream = null;
  }

  /** Run a mutation that returns the updated risk. */
  private mutate(
    request: (orgId: string) => ReturnType<RiskApi['getRisk']>,
    notice: string,
    done?: () => void,
  ): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    request(orgId).subscribe({
      next: (risk) => {
        this.busy.set(false);
        this.risk.set(risk);
        done?.();
        this.toasts.success(notice, { code: risk.code });
      },
      error: (e: unknown) => {
        this.busy.set(false);
        done?.();
        this.errorKey.set(riskErrorKey(e));
      },
    });
  }

  protected review(note: string): void {
    this.mutate(
      (orgId) => this.api.reviewRisk(orgId, this.id(), { note: note.trim() || null }),
      'risk.notices.reviewed',
      () => this.reviewOpen.set(false),
    );
  }

  protected openAccept(): void {
    if (!this.rated()) {
      return;
    }
    this.acceptNote.set('');
    // Default: valid until the next periodic review (27001 6.1.3 f).
    this.acceptExpiry.set(toDateInput(this.risk()?.next_review_at));
    this.acceptOpen.set(true);
  }

  protected accept(): void {
    this.mutate(
      (orgId) =>
        this.api.acceptRisk(orgId, this.id(), {
          note: this.acceptNote().trim() || null,
          expires_at: fromDateInput(this.acceptExpiry()),
        }),
      'risk.notices.accepted',
      () => this.acceptOpen.set(false),
    );
  }

  protected revoke(reason: string): void {
    this.mutate(
      (orgId) => this.api.revokeAcceptance(orgId, this.id(), reason.trim() || null),
      'risk.notices.revoked',
      () => this.revokeOpen.set(false),
    );
  }

  protected openStatus(): void {
    const status = this.risk()?.status ?? '';
    this.statusChoice.set(
      (PATCHABLE_RISK_STATUSES as readonly string[]).includes(status)
        ? (status as PatchableRiskStatus)
        : '',
    );
    this.statusReason.set('');
    this.statusOpen.set(true);
  }

  protected setStatus(): void {
    const status = this.statusChoice();
    if (!status) {
      return;
    }
    if (status === this.risk()?.status) {
      this.statusOpen.set(false);
      return;
    }
    this.mutate(
      (orgId) =>
        this.api.updateRisk(orgId, this.id(), {
          status,
          status_reason: this.statusReason().trim() || null,
        }),
      'risk.notices.statusChanged',
      () => this.statusOpen.set(false),
    );
  }

  protected onControls(result: unknown): void {
    const controls = (result as { controls?: ControlSuggestion[] } | null)?.controls ?? [];
    this.controlSuggestions.set(controls.filter((c) => c && typeof c.ref === 'string'));
  }

  protected suggestionNumber(ref: string): string {
    const canonical = canonicalControlRef(ref);
    return canonical.slice(canonical.indexOf(':') + 1);
  }

  protected hasControl(ref: string): boolean {
    return this.controlRefs().includes(canonicalControlRef(ref));
  }

  protected addControl(ref: string): void {
    const risk = this.risk();
    if (!risk || this.hasControl(ref)) {
      return;
    }
    this.mutate(
      (orgId) =>
        this.api.updateRisk(orgId, risk.id, {
          control_refs: [...this.controlRefs(), canonicalControlRef(ref)],
        }),
      'risk.notices.saved',
    );
  }

  protected applyPlan(plan: TreatmentPlan): void {
    const risk = this.risk();
    if (!risk || !plan.residual_likelihood || !plan.residual_consequence) {
      return;
    }
    this.mutate(
      (orgId) =>
        this.api.updateRisk(orgId, risk.id, {
          residual_likelihood: plan.residual_likelihood,
          residual_consequence: plan.residual_consequence,
          ...(plan.strategy && !risk.treatment_strategy
            ? { treatment_strategy: plan.strategy }
            : {}),
        }),
      'risk.notices.saved',
    );
  }

  protected remove(): void {
    const orgId = this.perms.orgId();
    const risk = this.risk();
    if (!orgId || !risk) {
      return;
    }
    this.busy.set(true);
    this.api.deleteRisk(orgId, risk.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.toasts.success('risk.notices.deleted', { code: risk.code });
        void this.router.navigate(['/risk/risks']);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.errorKey.set(riskErrorKey(e));
      },
    });
  }
}
