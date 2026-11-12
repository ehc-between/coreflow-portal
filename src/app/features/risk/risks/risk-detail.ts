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
import { NotificationService } from '../../../core/notifications/notification.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { RiskApi } from '../data/risk-api';
import { fromDateInput, riskStatusTone, soaLink } from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import {
  ControlSuggestion,
  PATCHABLE_RISK_STATUSES,
  PatchableRiskStatus,
  Risk,
  TreatmentPlan,
} from '../data/risk.models';
import { RatingBadge } from '../shared/rating-badge';
import { RiskPageGuide } from '../shared/risk-page-guide';
import { RiskPermissions } from '../shared/risk-permissions';
import { RiskTreatments } from './risk-treatments';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';

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
  threat: 'risk.fields.threat',
  vulnerability: 'risk.fields.vulnerability',
  consequence_text: 'risk.fields.consequence',
  affected_properties: 'risk.fields.affectedProperties',
  owner_user_id: 'risk.fields.owner',
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
 * One risk: context, inherent -> treatment -> residual, the treatment plan (tasks),
 * acceptance sign-off, periodic review, the controls it references (linking to the
 * SoA) and the record kit tabs (related items, activity, comments, attachments,
 * revisions). AI: suggest controls, draft a treatment plan, ask about the rating.
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
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    PromptDialog,
    RatingBadge,
    RiskPageGuide,
    RiskTreatments,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (risk(); as r) {
      <app-record-detail-layout
        entityType="risk"
        [entityId]="r.id"
        [tabs]="tabs"
        [canEdit]="r.can_edit"
        [includeAudit]="perms.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/risk/risks"
        backLabelKey="risk.common.backToRisks"
      >
        <div header>
          <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
            <span class="font-mono">{{ r.code }}</span>
            <a [routerLink]="['/risk/registers', r.register.id]" class="hover:underline">
              {{ r.register.name }}
            </a>
          </p>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ r.title }}
          </h1>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <app-badge [tone]="statusTone()">{{ 'risk.status.' + r.status | transloco }}</app-badge>
            <app-rating-badge
              [score]="r.current_score"
              [level]="r.current_level"
              [label]="(r.residual ?? r.inherent)?.label"
              [color]="(r.residual ?? r.inherent)?.color"
            />
            @if (r.above_appetite) {
              <app-badge tone="fail">{{ 'risk.rating.aboveAppetite' | transloco }}</app-badge>
            }
            @if (r.review_overdue) {
              <app-badge tone="warn">{{ 'risk.detail.reviewOverdue' | transloco }}</app-badge>
            }
          </div>
        </div>

        <ng-container actions>
          <app-watch-button entityType="risk" [entityId]="r.id" />
          @if (r.can_edit && r.status !== 'closed') {
            <app-button size="sm" variant="secondary" (click)="reviewOpen.set(true)">
              <app-icon name="checkcircle" [size]="14" />
              {{ 'risk.detail.review' | transloco }}
            </app-button>
          }
          @if (r.can_accept && r.status !== 'closed') {
            @if (r.acceptance) {
              <app-button size="sm" variant="secondary" (click)="revokeOpen.set(true)">
                {{ 'risk.detail.revoke' | transloco }}
              </app-button>
            } @else {
              <app-button
                size="sm"
                variant="secondary"
                [disabled]="!r.inherent && !r.residual"
                (click)="openAccept()"
              >
                {{ 'risk.detail.accept' | transloco }}
              </app-button>
            }
          }
          @if (r.can_edit) {
            <app-button size="sm" (click)="edit()">
              {{ 'risk.common.edit' | transloco }}
            </app-button>
          }
          @if (r.can_delete) {
            <app-button size="sm" variant="ghost" (click)="deleteOpen.set(true)">
              <app-icon name="trash" [size]="14" />
              <span class="sr-only sm:not-sr-only">{{ 'risk.common.delete' | transloco }}</span>
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-5">
          <app-risk-page-guide page="detail" lesson="treating-risks" tour="detail" />

          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }

          <app-card>
            <h2 class="mb-3 flex items-center gap-1.5 font-display text-[16px] font-bold text-fg">
              {{ 'risk.detail.assessment' | transloco }}
              <app-ask-about [prompt]="'risk.ask.rating' | transloco" field="rating" />
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3" [appTourStep]="'risk-ratings'">
              <div>
                <p class="mb-1 text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.inherent' | transloco }}
                </p>
                <app-rating-badge
                  [score]="r.inherent?.score"
                  [level]="r.inherent?.level"
                  [label]="r.inherent?.label"
                  [color]="r.inherent?.color"
                />
                @if (r.inherent; as i) {
                  <p class="mt-1 text-[12px] text-fg-subtle">
                    {{ 'risk.detail.lc' | transloco: { l: i.likelihood, c: i.consequence } }}
                  </p>
                }
              </div>
              <div>
                <p class="mb-1 text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.strategy' | transloco }}
                </p>
                <p class="text-[13.5px] text-fg">
                  {{
                    r.treatment_strategy
                      ? ('risk.strategies.' + r.treatment_strategy | transloco)
                      : ('risk.common.notDecided' | transloco)
                  }}
                </p>
                <p class="mt-1 text-[12px] text-fg-subtle">
                  {{
                    'risk.detail.treatmentCounts'
                      | transloco: { open: r.treatments.open, done: r.treatments.done }
                  }}
                </p>
              </div>
              <div>
                <p class="mb-1 text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.residual' | transloco }}
                </p>
                <app-rating-badge
                  [score]="r.residual?.score"
                  [level]="r.residual?.level"
                  [label]="r.residual?.label"
                  [color]="r.residual?.color"
                />
                @if (r.residual; as res) {
                  <p class="mt-1 text-[12px] text-fg-subtle">
                    {{ 'risk.detail.lc' | transloco: { l: res.likelihood, c: res.consequence } }}
                  </p>
                }
              </div>
            </div>
            @if (r.treatment_notes) {
              <p class="mt-3 text-[13.5px] whitespace-pre-line text-fg-muted">
                {{ r.treatment_notes }}
              </p>
            }
            @if (r.status !== 'closed' && r.can_edit) {
              <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <label for="risk-status" class="text-[12.5px] font-semibold text-fg-muted">
                  {{ 'risk.detail.changeStatus' | transloco }}
                </label>
                <select
                  id="risk-status"
                  class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
                  [disabled]="!!r.acceptance"
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
                  <span class="text-[12px] text-fg-subtle">{{
                    'risk.detail.acceptedLocked' | transloco
                  }}</span>
                }
              </div>
            }
          </app-card>

          @if (r.acceptance; as a) {
            <app-card>
              <h2 class="mb-2 font-display text-[16px] font-bold text-fg">
                {{ 'risk.detail.acceptance' | transloco }}
              </h2>
              <p class="text-[13.5px] text-fg">
                {{
                  'risk.detail.acceptedBy'
                    | transloco
                      : {
                          name: a.accepted_by?.name ?? ('risk.common.unknown' | transloco),
                          date: (a.accepted_at | localDate: 'mediumDate'),
                        }
                }}
              </p>
              @if (a.expires_at) {
                <p class="mt-1 text-[12.5px] text-fg-muted">
                  {{
                    'risk.detail.acceptanceExpires' | transloco: { date: (a.expires_at | localDay) }
                  }}
                </p>
              }
              @if (a.note) {
                <p class="mt-2 text-[13.5px] whitespace-pre-line text-fg-muted">{{ a.note }}</p>
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
            />
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[16px] font-bold text-fg">
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
            @if (controlSuggestions().length) {
              <section
                class="mb-3 rounded-card border border-accent/30 bg-accent-soft p-3 text-[13px]"
                aria-live="polite"
                [attr.aria-label]="'risk.ai.controlsTitle' | transloco"
              >
                <div class="mb-2 flex items-center justify-between">
                  <h3 class="font-semibold text-fg">{{ 'risk.ai.controlsTitle' | transloco }}</h3>
                  <button
                    type="button"
                    class="text-[12.5px] font-semibold text-fg-muted hover:text-fg"
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
                          <span class="font-mono">{{ c.ref }}</span>
                          @if (c.title) {
                            · {{ c.title }}
                          }
                        </p>
                        @if (c.reason) {
                          <p class="text-fg-muted">{{ c.reason }}</p>
                        }
                      </div>
                      @if (r.control_refs.includes(c.ref)) {
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
            <ul class="flex flex-wrap gap-2">
              @for (ref of r.control_refs; track ref) {
                <li>
                  @if (soa(ref); as link) {
                    <a
                      [routerLink]="link.path"
                      [queryParams]="{ control: link.control }"
                      class="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 font-mono text-[12px] text-fg hover:border-accent hover:text-accent"
                      >{{ ref }}</a
                    >
                  } @else {
                    <span class="font-mono text-[12px]">{{ ref }}</span>
                  }
                </li>
              } @empty {
                <li class="text-[13px] text-fg-muted">
                  {{ 'risk.detail.noControls' | transloco }}
                </li>
              }
            </ul>
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'risk.detail.context' | transloco }}
            </h2>
            <dl class="grid grid-cols-1 gap-3 text-[13.5px] sm:grid-cols-2">
              @if (r.description) {
                <div class="sm:col-span-2">
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'risk.fields.description' | transloco }}
                  </dt>
                  <dd class="whitespace-pre-line text-fg">{{ r.description }}</dd>
                </div>
              }
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.sourceType' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ r.source_type ? ('risk.sourceTypes.' + r.source_type | transloco) : '—' }}
                  @if (r.source_ref) {
                    · {{ r.source_ref }}
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.affectedProperties' | transloco }}
                </dt>
                <dd class="text-fg">
                  @for (p of r.affected_properties; track p; let last = $last) {
                    {{ 'risk.properties.' + p | transloco }}{{ last ? '' : ', ' }}
                  } @empty {
                    —
                  }
                </dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.threat' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ r.threat || '—' }}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.vulnerability' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ r.vulnerability || '—' }}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.consequence' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ r.consequence_text || '—' }}</dd>
              </div>
            </dl>
          </app-card>
        </div>

        <ng-container aside>
          <app-card>
            <dl class="flex flex-col gap-3 text-[13px]">
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.owner' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ r.owner?.name ?? ('risk.common.unassigned' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.department' | transloco }}
                </dt>
                <dd class="text-fg">{{ r.department?.name ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.category' | transloco }}
                </dt>
                <dd class="text-fg">{{ 'risk.categories.' + r.category | transloco }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.lastReviewed' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ r.last_reviewed_at ? (r.last_reviewed_at | localDate: 'mediumDate') : '—' }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.nextReview' | transloco }}
                </dt>
                <dd
                  [class.text-fail]="r.review_overdue"
                  [class.font-semibold]="r.review_overdue"
                  class="text-fg"
                >
                  {{ r.next_review_at ? (r.next_review_at | localDay) : '—' }}
                </dd>
              </div>
              @if (r.status_reason) {
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'risk.fields.statusReason' | transloco }}
                  </dt>
                  <dd class="text-fg">{{ r.status_reason }}</dd>
                </div>
              }
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.updatedAt' | transloco }}
                </dt>
                <dd class="text-fg">{{ r.updated_at | localDate: 'medium' }}</dd>
              </div>
            </dl>
          </app-card>
          <app-card>
            <app-supports-requirements entityType="risk" [entityId]="r.id" />
          </app-card>
        </ng-container>
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
        [confirmLabel]="'risk.detail.accept' | transloco"
        [cancelLabel]="'risk.common.cancel' | transloco"
        [busy]="busy()"
        [confirmDisabled]="r.above_appetite && !acceptNote().trim()"
        (confirmed)="accept()"
        (cancelled)="acceptOpen.set(false)"
      >
        <div class="mt-3 flex flex-col gap-3">
          <app-form-field
            [label]="'risk.fields.acceptanceNote' | transloco"
            inputId="risk-accept-note"
          >
            <textarea
              id="risk-accept-note"
              rows="3"
              [value]="acceptNote()"
              (input)="acceptNote.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
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
        <app-alert tone="error">{{ loadErrorKey() | transloco }}</app-alert>
        <a
          routerLink="/risk/risks"
          class="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline"
        >
          {{ 'risk.common.backToRisks' | transloco }}
        </a>
      </div>
    } @else {
      <p class="py-16 text-center text-[14px] text-fg-muted">
        {{ 'risk.common.loading' | transloco }}
      </p>
    }
  `,
})
export class RiskDetailPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  protected readonly perms = inject(RiskPermissions);

  readonly id = input.required<string>();
  /** `?treatment=<id>` (entity URL of a treatment). */
  readonly treatment = input<string | undefined>(undefined);

  protected readonly tabs = TABS;
  protected readonly fieldLabels = RISK_FIELD_LABELS;
  protected readonly patchableStatuses = PATCHABLE_RISK_STATUSES;

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
  protected readonly statusTone = computed(() =>
    riskStatusTone(this.risk()?.status ?? 'identified'),
  );

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'risk',
      entityId: this.id(),
      view: 'detail',
      title: titleOf(this.risk()),
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

  protected soa(ref: string) {
    return soaLink(ref);
  }

  protected edit(): void {
    void this.router.navigate(['/risk/risks', this.id(), 'edit']);
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
    this.acceptExpiry.set('');
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

  protected addControl(ref: string): void {
    const risk = this.risk();
    if (!risk || risk.control_refs.includes(ref)) {
      return;
    }
    this.mutate(
      (orgId) =>
        this.api.updateRisk(orgId, risk.id, {
          control_refs: [...risk.control_refs, ref],
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
