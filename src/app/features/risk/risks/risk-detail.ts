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
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { Term } from '../../../shared/guidance/term';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { EntityChip } from '../../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
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
  currentBasis,
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

/**
 * One risk. The first card says what the risk is (description, the exposed record,
 * threat, vulnerability, consequence); then the assessment (inherent -> treatment
 * decision -> residual, against the appetite), the acceptance sign-off, the
 * treatment plan (tasks, effectiveness checks) and the cited controls (linked to the
 * SoA with their implementation status). The aside shows the requirements the
 * risk documents (fed by its controls), its connections and a short summary; the
 * record kit tabs hold related items, activity, comments, attachments and revisions.
 */
@Component({
  selector: 'app-risk-detail',
  imports: [
    TourStepDirective,
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AiAssistButton,
    AskAbout,
    Term,
    EntityChip,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    SupportsRequirements,
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
    ControlList,
    RatingBadge,
    RiskTreatments,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (risk(); as r) {
      @let rating = current();
      <app-record-detail-layout
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
          <app-status-badge
            meaning="lifecycle"
            [value]="statusValue(r.status)"
            [labelKey]="'risk.status.' + r.status"
          />
          <app-rating-badge
            [score]="rating?.score"
            [level]="rating?.level"
            [label]="rating?.label"
            [color]="rating?.color"
            prefixKey="risk.rating.currentPrefix"
            [hintKey]="basisHint()"
          />
          @switch (appetite()) {
            @case ('above') {
              <app-badge tone="fail">{{ 'risk.rating.aboveAppetite' | transloco }}</app-badge>
            }
            @case ('accepted') {
              <app-badge tone="neutral" data-testid="accepted-above-appetite">
                {{ acceptedLabel() }}
              </app-badge>
            }
          }
          @if (r.review_overdue) {
            <app-badge tone="warn">{{ 'risk.detail.reviewOverdue' | transloco }}</app-badge>
          }
          <app-watch-button entityType="risk" [entityId]="r.id" />
        </ng-container>

        @if (r.can_edit) {
          <app-button primary size="sm" (click)="edit()" data-testid="risk-edit">
            {{ 'risk.common.edit' | transloco }}
          </app-button>
        }
        @if (r.can_edit && r.status !== 'closed') {
          <app-button secondary size="sm" variant="secondary" (click)="reviewOpen.set(true)">
            <app-icon name="checkcircle" [size]="14" />
            {{ 'risk.detail.review' | transloco }}
          </app-button>
        }
        @if (r.can_accept && r.status !== 'closed' && !r.acceptance) {
          <app-button
            secondary
            size="sm"
            variant="secondary"
            [disabled]="!rated()"
            [attr.title]="rated() ? null : ('risk.detail.acceptNeedsRating' | transloco)"
            (click)="openAccept()"
            data-testid="risk-accept"
          >
            {{ 'risk.detail.accept' | transloco }}
          </app-button>
        }
        @if (r.can_accept && r.status !== 'closed' && r.acceptance) {
          <button appMenuItem overflow (click)="revokeOpen.set(true)">
            {{ 'risk.detail.revoke' | transloco }}
          </button>
        }
        @if (r.can_delete) {
          <button appMenuItem overflow [danger]="true" (click)="deleteOpen.set(true)">
            {{ 'risk.common.delete' | transloco }}
          </button>
        }

        <div class="flex flex-col gap-5">
          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }

          <app-card data-testid="risk-what">
            <h2 class="mb-3 font-display text-section font-bold text-fg">
              {{ 'risk.detail.what' | transloco }}
            </h2>
            @if (r.description) {
              <p class="mb-4 text-body whitespace-pre-line text-fg">{{ r.description }}</p>
            }
            <app-field-list>
              <app-field-item labelKey="risk.fields.sourceType" [wide]="true">
                <div class="flex flex-wrap items-center gap-2">
                  @if (r.source_type) {
                    <span>{{ 'risk.sourceTypes.' + r.source_type | transloco }}</span>
                  }
                  @if (r.source_entity; as entity) {
                    <app-entity-chip [ref]="entity" data-testid="risk-subject" />
                  } @else if (r.source_ref) {
                    <span class="text-fg-muted">· {{ r.source_ref }}</span>
                  } @else if (!r.source_type) {
                    <span class="text-fg-muted">{{ 'common.empty.notSet' | transloco }}</span>
                  }
                </div>
              </app-field-item>
              <app-field-item
                labelKey="risk.fields.threat"
                [value]="r.threat"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item
                labelKey="risk.fields.vulnerability"
                [value]="r.vulnerability"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item
                labelKey="risk.fields.consequence"
                [value]="r.consequence_text"
                [wide]="true"
                [multiline]="true"
              />
              @if (r.affected_properties.length) {
                <app-field-item
                  labelKey="risk.fields.affectedProperties"
                  [value]="properties()"
                  [wide]="true"
                />
              }
            </app-field-list>
          </app-card>

          <app-card>
            <h2 class="mb-3 flex items-center gap-1.5 font-display text-section font-bold text-fg">
              {{ 'risk.detail.assessment' | transloco }}
              <app-ask-about [prompt]="'risk.ask.rating' | transloco" field="rating" />
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3" [appTourStep]="'risk-ratings'">
              <div>
                <p class="mb-1 text-meta font-semibold text-fg-muted">
                  <app-term scope="risk" key="inherent-risk">{{
                    'risk.fields.inherent' | transloco
                  }}</app-term>
                </p>
                <app-rating-badge
                  [score]="r.inherent?.score"
                  [level]="r.inherent?.level"
                  [label]="r.inherent?.label"
                  [color]="r.inherent?.color"
                />
                @if (r.inherent; as i) {
                  <p class="mt-1 text-meta text-fg-subtle">
                    {{ 'risk.detail.lc' | transloco: { l: i.likelihood, c: i.consequence } }}
                  </p>
                }
              </div>
              <div>
                <p class="mb-1 text-meta font-semibold text-fg-muted">
                  {{ 'risk.fields.strategy' | transloco }}
                </p>
                <p class="text-body text-fg">
                  {{
                    r.treatment_strategy
                      ? ('risk.strategies.' + r.treatment_strategy | transloco)
                      : ('risk.common.notDecided' | transloco)
                  }}
                </p>
                <p class="mt-1 text-meta text-fg-subtle">
                  {{
                    'risk.detail.treatmentCounts'
                      | transloco: { open: r.treatments.open, done: r.treatments.done }
                  }}
                </p>
              </div>
              <div>
                <p class="mb-1 text-meta font-semibold text-fg-muted">
                  <app-term scope="risk" key="residual-risk">{{
                    'risk.fields.residual' | transloco
                  }}</app-term>
                </p>
                <app-rating-badge
                  [score]="r.residual?.score"
                  [level]="r.residual?.level"
                  [label]="r.residual?.label"
                  [color]="r.residual?.color"
                />
                @if (r.residual; as res) {
                  <p class="mt-1 text-meta text-fg-subtle">
                    {{ 'risk.detail.lc' | transloco: { l: res.likelihood, c: res.consequence } }}
                  </p>
                } @else if (r.inherent) {
                  <p class="mt-1 text-meta text-fg-subtle">
                    {{ 'risk.detail.noResidual' | transloco }}
                  </p>
                }
              </div>
            </div>
            <div
              class="mt-4 flex flex-col gap-1 rounded-tile bg-surface-2 px-3 py-2 text-ui text-fg-muted"
            >
              <p>
                <app-term scope="risk" key="current-rating">{{
                  'risk.rating.current' | transloco
                }}</app-term
                >:
                {{ basisHint() ?? 'risk.rating.basisHint.none' | transloco }}
              </p>
              @if (appetiteMax() !== null) {
                <p data-testid="risk-appetite-line">
                  <app-term scope="risk" key="risk-appetite">{{
                    'risk.overview.appetiteTerm' | transloco
                  }}</app-term
                  >:
                  {{ 'risk.detail.appetiteLine' | transloco: { score: appetiteMax() } }}
                </p>
              }
              @if (!rated() && r.can_accept) {
                <p>{{ 'risk.detail.acceptNeedsRating' | transloco }}</p>
              }
            </div>
            @if (r.treatment_notes) {
              <p class="mt-3 text-body whitespace-pre-line text-fg-muted">
                {{ r.treatment_notes }}
              </p>
            }
            @if (r.status !== 'closed' && r.can_edit) {
              <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <label for="risk-status" class="text-meta font-semibold text-fg-muted">
                  {{ 'risk.detail.changeStatus' | transloco }}
                </label>
                <select
                  id="risk-status"
                  class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                  [disabled]="!!r.acceptance"
                  [attr.aria-describedby]="r.acceptance ? 'risk-status-locked' : null"
                  (change)="requestStatus($any($event.target).value)"
                >
                  @if (r.status === 'accepted') {
                    <option value="accepted" selected>
                      {{ 'risk.status.accepted' | transloco }}
                    </option>
                  }
                  @for (s of patchableStatuses; track s) {
                    <option [value]="s" [selected]="s === r.status">
                      {{ 'risk.status.' + s | transloco }}
                    </option>
                  }
                </select>
                @if (r.acceptance) {
                  <span id="risk-status-locked" class="text-meta text-fg-subtle">{{
                    'risk.detail.acceptedLocked' | transloco
                  }}</span>
                }
              </div>
            }
          </app-card>

          @if (r.acceptance; as a) {
            <app-card data-testid="risk-acceptance">
              <h2 class="mb-2 font-display text-section font-bold text-fg">
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
            </app-card>
          }

          <app-card>
            <app-risk-treatments
              [appTourStep]="'risk-treatments'"
              [risk]="r"
              [canEdit]="r.can_edit && r.status !== 'closed'"
              [focusId]="treatmentFocus()"
              (changed)="reload()"
              (planApplied)="applyPlan($event)"
              (rerate)="rerate()"
            />
          </app-card>

          <app-card data-testid="risk-controls">
            <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 class="flex items-center gap-1.5 font-display text-section font-bold text-fg">
                {{ 'risk.detail.controls' | transloco }}
              </h2>
              @if (r.can_edit) {
                <app-ai-assist-button
                  assist="risk.suggest_controls"
                  labelKey="risk.ai.suggestControls"
                  [input]="{ risk_id: r.id }"
                  entityType="risk"
                  [entityId]="r.id"
                  (result)="onControls($event)"
                />
              }
            </div>
            <p class="mb-3 text-meta text-fg-muted">{{ 'risk.detail.controlsHint' | transloco }}</p>
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
          </app-card>
        </div>

        <app-supports-requirements
          aside-requirements
          entityType="risk"
          [entityId]="r.id"
          [canEdit]="r.can_edit"
          [frameworks]="frameworks()"
        />

        <app-card aside>
          <h2 class="mb-3 text-card font-semibold text-fg">
            {{ 'risk.detail.summary' | transloco }}
          </h2>
          <app-field-list [columns]="1">
            <app-field-item labelKey="risk.fields.riskOwner" [value]="r.owner?.name" empty="none" />
            <app-field-item labelKey="risk.fields.department" [value]="r.department?.name" />
            <app-field-item
              labelKey="risk.fields.category"
              [value]="'risk.categories.' + r.category | transloco"
            />
            <app-field-item
              labelKey="risk.fields.lastReviewed"
              [value]="r.last_reviewed_at ? (r.last_reviewed_at | localDay) : null"
            />
            <app-field-item
              labelKey="risk.fields.nextReview"
              [value]="r.next_review_at ? (r.next_review_at | localDay) : null"
            />
            @if (r.status_reason) {
              <app-field-item labelKey="risk.fields.statusReason" [value]="r.status_reason" />
            }
            <app-field-item labelKey="risk.fields.updatedAt" [value]="r.updated_at | localDate" />
          </app-field-list>
        </app-card>

        <app-help-strip
          aside-learn
          scope="risk"
          page="detail"
          tour="detail"
          lesson="treating-risks"
        />
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

      <app-prompt-dialog
        [open]="statusTarget() !== null"
        [title]="'risk.detail.statusTitle' | transloco"
        [message]="
          'risk.detail.statusMessage'
            | transloco: { status: ('risk.status.' + (statusTarget() ?? 'identified') | transloco) }
        "
        [label]="'risk.detail.reason' | transloco"
        [required]="statusTarget() === 'closed'"
        [confirmLabel]="'risk.common.save' | transloco"
        [cancelLabel]="'risk.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="setStatus($event)"
        (cancelled)="cancelStatus()"
      />

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
  protected readonly perms = inject(RiskPermissions);

  readonly id = input.required<string>();
  /** `?treatment=<id>` (entity URL of a treatment). */
  readonly treatment = input<string | undefined>(undefined);

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
  protected readonly acceptNote = signal('');
  protected readonly acceptExpiry = signal('');
  protected readonly statusTarget = signal<PatchableRiskStatus | null>(null);
  protected readonly controlSuggestions = signal<readonly ControlSuggestion[]>([]);
  private sub: Subscription | null = null;

  protected readonly treatmentFocus = computed(() => this.treatment() ?? null);
  protected readonly current = computed(() => {
    const risk = this.risk();
    return risk ? currentRating(risk) : null;
  });
  protected readonly rated = computed(() => !!this.risk()?.inherent || !!this.risk()?.residual);
  /** "Hva mangler" (U29): what an editor still has to fill in, each a link to the form. */
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const r = this.risk();
    if (!r?.can_edit || r.status === 'closed') {
      return [];
    }
    const link = ['/risk/risks', r.id, 'edit'];
    const items: RecordMissingItem[] = [];
    if (!this.rated()) {
      items.push({ key: 'rating', labelKey: 'risk.detail.missing.rating', link });
    }
    if (!r.owner) {
      items.push({ key: 'owner', labelKey: 'risk.detail.missing.owner', link });
    }
    if (!r.treatment_strategy) {
      items.push({ key: 'strategy', labelKey: 'risk.detail.missing.strategy', link });
    }
    return items;
  });
  protected readonly appetite = computed(() => {
    const risk = this.risk();
    return risk ? appetiteState(risk) : null;
  });
  protected readonly appetiteMax = computed(() => this.risk()?.appetite_max_score ?? null);
  protected readonly basisHint = computed(() => {
    const risk = this.risk();
    const basis = risk ? currentBasis(risk) : null;
    return basis ? `risk.rating.basisHint.${basis}` : null;
  });
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
  protected readonly acceptedLabel = computed(() => {
    const a = this.risk()?.acceptance;
    if (!a) {
      return this.translate('risk.rating.acceptedAboveAppetite');
    }
    return this.translate('risk.rating.acceptedAboveAppetiteBy', {
      name: a.accepted_by?.name ?? this.translate('risk.common.unknown'),
    });
  });

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
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
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
    void this.router.navigate(['/risk/risks', this.id(), 'edit']);
  }

  /** After an effectiveness check: re-rate the residual risk on the edit form. */
  protected rerate(): void {
    void this.router.navigate(['/risk/risks', this.id(), 'edit'], {
      queryParams: { step: 'assess' },
    });
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

  protected requestStatus(status: string): void {
    if ((PATCHABLE_RISK_STATUSES as readonly string[]).includes(status)) {
      this.statusTarget.set(status as PatchableRiskStatus);
    }
  }

  protected cancelStatus(): void {
    this.statusTarget.set(null);
    // Re-render the select with the stored status.
    const risk = this.risk();
    this.risk.set(risk ? { ...risk } : null);
  }

  protected setStatus(reason: string): void {
    const status = this.statusTarget();
    if (!status) {
      return;
    }
    this.mutate(
      (orgId) =>
        this.api.updateRisk(orgId, this.id(), {
          status,
          status_reason: reason.trim() || null,
        }),
      'risk.notices.statusChanged',
      () => this.statusTarget.set(null),
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
