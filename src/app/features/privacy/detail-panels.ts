import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PrivacyApi } from './data/privacy-api';
import {
  DataBreach,
  DataSubjectRequest,
  Decision,
  Dpia,
  LegalBasisAssessment,
  PrivacyRecord,
} from './data/privacy.models';
import { clockFact } from './data/privacy-display';
import { privacyError } from './data/privacy-errors';
import { PrivacyRefsService } from './data/privacy-refs.service';
import { REGISTERS, RegisterKey } from './data/privacy-registers';

/** The one-month deadline of a data subject request, and the one-time extension. */
@Component({
  selector: 'app-privacy-dsr-panel',
  imports: [TranslocoPipe, LocalDayPipe, Alert, Button, Card, Icon, PromptDialog, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = request();
    <app-card>
      <h2 class="mb-3 flex items-center gap-2 font-display text-card font-bold text-fg">
        <app-icon name="clock" [size]="16" />
        {{ 'privacy.dsr.deadlineTitle' | transloco }}
      </h2>
      <div class="flex flex-wrap items-center gap-3" data-testid="dsr-deadline">
        <span class="font-display text-page font-bold text-fg">
          {{ r.effective_due_at | localDay: 'mediumDate' }}
        </span>
        @if (r.closed_at) {
          <app-status-badge meaning="lifecycle" value="closed" labelKey="privacy.dsr.closed" />
        } @else if (r.is_overdue) {
          <app-status-badge meaning="severity" value="high" labelKey="privacy.dsr.overdueBadge" />
        } @else if (r.days_remaining !== null) {
          <app-status-badge
            meaning="lifecycle"
            [value]="r.days_remaining <= 7 ? 'due' : 'received'"
            labelKey="privacy.dsr.daysLeft"
            [labelParams]="{ days: r.days_remaining }"
          />
        }
        @if (r.extended) {
          <app-status-badge
            meaning="lifecycle"
            value="archived"
            labelKey="privacy.dsr.extendedBadge"
          />
        }
      </div>
      <p class="mt-2 text-ui text-fg-muted">
        {{
          'privacy.dsr.deadlineExplain'
            | transloco
              : {
                  received: (r.received_at | localDay: 'mediumDate'),
                  due: (r.due_at | localDay: 'mediumDate'),
                }
        }}
      </p>
      @if (r.extended && r.extension_reason) {
        <p class="mt-2 text-ui text-fg">
          {{ 'privacy.dsr.extensionReasonShown' | transloco: { reason: r.extension_reason } }}
        </p>
      }
      @if (canExtend()) {
        <div class="mt-3">
          <app-button
            variant="secondary"
            size="sm"
            (click)="extending.set(true)"
            data-testid="dsr-extend"
          >
            {{ 'privacy.dsr.extend' | transloco }}
          </app-button>
          <p class="mt-1 text-meta text-fg-subtle">{{ 'privacy.dsr.extendHint' | transloco }}</p>
        </div>
      }
      @if (error(); as e) {
        <app-alert tone="error" class="mt-3 block">{{ e | transloco }}</app-alert>
      }
    </app-card>
    <app-prompt-dialog
      [open]="extending()"
      [title]="'privacy.dsr.extendTitle' | transloco"
      [message]="'privacy.dsr.extendMessage' | transloco"
      [label]="'privacy.dsr.extensionReason' | transloco"
      [confirmLabel]="'privacy.dsr.extend' | transloco"
      [cancelLabel]="'privacy.common.cancel' | transloco"
      [required]="true"
      [maxLength]="2000"
      [busy]="busy()"
      (confirmed)="extend($event)"
      (cancelled)="extending.set(false)"
    />
  `,
})
export class DsrPanel {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notify = inject(NotificationService);

  readonly request = input.required<DataSubjectRequest>();
  readonly canWrite = input(false);
  readonly changed = output<DataSubjectRequest>();

  protected readonly extending = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canExtend = computed(
    () => this.canWrite() && !this.request().extended && !this.request().closed_at,
  );

  protected extend(reason: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.extendRequest(orgId, this.request().id, reason.trim()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.extending.set(false);
        this.notify.success('privacy.notices.extended', { code: r.code });
        this.changed.emit(r);
      },
      error: (err) => {
        this.busy.set(false);
        this.extending.set(false);
        this.error.set(privacyError(err).key);
      },
    });
  }
}

/**
 * The 72-hour clock of a breach while it is open (a notified breach says it is
 * waiting to be closed instead of showing a clock that no longer runs), the link to
 * record the notification decisions, and the assistant's draft assessment (started
 * from the page's "Spør KI" menu through {@link draftAssessment}).
 */
@Component({
  selector: 'app-privacy-breach-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    MarkdownPipe,
    AiAssistButton,
    Card,
    Icon,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = breach();
    @let c = clock();
    @if (b.status !== 'closed' || draft()) {
      <app-card>
        @if (b.status !== 'closed') {
          <h2 class="mb-3 flex items-center gap-2 font-display text-card font-bold text-fg">
            <app-icon name="clock" [size]="16" />
            {{ 'privacy.breach.clockTitle' | transloco }}
          </h2>
          <div class="flex flex-wrap items-center gap-3" data-testid="breach-clock">
            <span class="font-display text-section font-bold text-fg">
              {{ b.notification_deadline | localDate }}
            </span>
            @if (b.status === 'notified') {
              <app-status-badge
                meaning="lifecycle"
                value="pending"
                labelKey="privacy.breach.awaitingClosure"
              />
            } @else {
              <app-status-badge
                [meaning]="c.meaning"
                [value]="c.value"
                [labelKey]="c.key"
                [labelParams]="c.params"
              />
            }
          </div>
          <p class="mt-2 text-ui text-fg-muted">
            {{ 'privacy.breach.clockExplain' | transloco: { aware: (b.aware_at | localDate) } }}
          </p>
          @if (canWrite()) {
            <a
              [routerLink]="['/privacy', 'breaches', b.id, 'edit']"
              class="mt-3 inline-flex h-9 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
              data-testid="breach-decide"
            >
              {{ 'privacy.breach.recordDecisions' | transloco }}
            </a>
          }
        }
        @if (draft(); as text) {
          <div
            [class.mt-4]="b.status !== 'closed'"
            [class.border-t]="b.status !== 'closed'"
            [class.border-border]="b.status !== 'closed'"
            [class.pt-4]="b.status !== 'closed'"
          >
            <h3 class="mb-2 flex items-center gap-1.5 text-ui font-semibold text-fg">
              <app-icon name="spark" [size]="14" />
              {{ 'privacy.ai.draftBreach' | transloco }}
            </h3>
            <div
              class="max-h-[420px] overflow-y-auto rounded-tile bg-surface-2 p-3 text-ui text-fg"
              [innerHTML]="text | appMarkdown"
              aria-live="polite"
              data-testid="breach-assessment"
            ></div>
            <p class="mt-1 text-meta text-fg-subtle">{{ 'privacy.ai.disclaimer' | transloco }}</p>
          </div>
        }
      </app-card>
    }
    @if (canWrite()) {
      <app-ai-assist-button
        #assist
        [quiet]="true"
        assist="privacy.draft_breach_assessment"
        entityType="data_breach"
        [entityId]="b.id"
        labelKey="privacy.ai.draftBreach"
        (text)="draft.set($event)"
      />
    }
  `,
})
export class BreachPanel {
  readonly breach = input.required<DataBreach>();
  readonly canWrite = input(false);

  private readonly assist = viewChild<AiAssistButton>('assist');
  protected readonly draft = signal<string | null>(null);
  protected readonly clock = computed(() => clockFact(this.breach()));

  /** Run the assistant's draft risk assessment ("Spør KI" menu). */
  draftAssessment(): void {
    this.assist()?.run();
  }
}

/** "Datatilsynet: Varslet 12. okt." / "De berørte: …": the two notification decisions. */
export function breachAuthorityKey(b: DataBreach): string {
  if (b.authority_notified_at) {
    return 'privacy.breach.authorityNotified';
  }
  if (b.authority_notification_required === false) {
    return 'privacy.breach.authorityNotRequired';
  }
  if (b.authority_notification_required === true) {
    return 'privacy.breach.authorityPending';
  }
  return 'privacy.breach.undecided';
}

export function breachSubjectsKey(b: DataBreach): string {
  if (b.subjects_notified_at) {
    return 'privacy.breach.subjectsNotified';
  }
  if (b.subjects_notification_required === false) {
    return 'privacy.breach.subjectsNotRequired';
  }
  if (b.subjects_notification_required === true) {
    return 'privacy.breach.subjectsPending';
  }
  return 'privacy.breach.undecided';
}

/** The three stages of a DPIA, and where this one is. */
export const DPIA_STAGES = ['screening', 'assessment', 'decision'] as const;

export function dpiaStage(d: Dpia): (typeof DPIA_STAGES)[number] | 'done' {
  switch (d.status) {
    case 'screening':
      return 'screening';
    case 'in_progress':
      return 'assessment';
    case 'awaiting_decision':
      return 'decision';
    default:
      return 'done';
  }
}

/**
 * "Forhåndsvurdering → Vurdering → Beslutning": where the DPIA stands, and what the
 * next stage asks for. The step buttons sit in the page header.
 */
@Component({
  selector: 'app-privacy-dpia-steps',
  imports: [TranslocoPipe, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = dpia();
    <app-card>
      <ol class="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="dpia-steps">
        @for (s of stages; track s; let i = $index) {
          <li
            class="rounded-tile border px-3 py-2"
            [class]="
              stateOf(i) === 'done'
                ? 'border-pass/40 bg-pass-soft/60'
                : stateOf(i) === 'current'
                  ? 'border-accent bg-accent-soft/60'
                  : 'border-border'
            "
            [attr.aria-current]="stateOf(i) === 'current' ? 'step' : null"
          >
            <span class="flex items-center gap-1.5 text-meta font-semibold text-fg-muted">
              @if (stateOf(i) === 'done') {
                <app-icon name="check" [size]="12" />
              } @else {
                {{ i + 1 }}
              }
              {{ 'privacy.dpia.stage.' + s + '.title' | transloco }}
            </span>
            <span class="mt-0.5 block text-ui text-fg">
              {{ 'privacy.dpia.stage.' + s + '.body' | transloco }}
            </span>
          </li>
        }
      </ol>
      @if (d.status === 'screening') {
        <p class="mt-3 text-ui text-fg" data-testid="dpia-screening-outcome">
          {{ 'privacy.dpia.screeningOutcome.' + d.screening_result | transloco }}
        </p>
      } @else if (d.status === 'not_required') {
        <p class="mt-3 text-ui text-fg-muted">{{ 'privacy.dpia.closedNotRequired' | transloco }}</p>
      }
    </app-card>
  `,
})
export class DpiaSteps {
  readonly dpia = input.required<Dpia>();
  protected readonly stages = DPIA_STAGES;

  protected stateOf(index: number): 'done' | 'current' | 'todo' {
    const stage = dpiaStage(this.dpia());
    if (stage === 'done') {
      return this.dpia().status === 'not_required' && index > 0 ? 'todo' : 'done';
    }
    const current = DPIA_STAGES.indexOf(stage);
    return index < current ? 'done' : index === current ? 'current' : 'todo';
  }
}

/**
 * The decision on a DPIA or a legal basis assessment: who decided and when, and
 * Approve / Reject (with a comment) for `privacy:approve` while it awaits a decision.
 * Prior consultation (Art. 36) is only raised once the residual risk is set.
 */
@Component({
  selector: 'app-privacy-decision-panel',
  imports: [TranslocoPipe, LocalDayPipe, Alert, Button, Card, Icon, PromptDialog, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = record();
    <app-card>
      <h2 class="mb-3 flex items-center gap-2 font-display text-card font-bold text-fg">
        <app-icon name="checkcircle" [size]="16" />
        {{ 'privacy.decision.title' | transloco }}
      </h2>
      @if (register() === 'dpia') {
        @let d = asDpia();
        @if (d.residual_risk && d.prior_consultation_required) {
          <div class="mb-3 flex flex-wrap items-center gap-2 text-ui">
            <app-status-badge
              meaning="severity"
              value="high"
              labelKey="privacy.dpia.priorConsultation"
            />
          </div>
          <app-alert tone="info" class="mb-3 block">
            {{ 'privacy.dpia.priorConsultationExplain' | transloco }}
          </app-alert>
        }
      }
      @if (register() === 'lba' && asLba().is_lia) {
        <p class="mb-3 text-ui text-fg-muted">{{ 'privacy.lba.liaExplain' | transloco }}</p>
      }
      @if (r.decided_at) {
        <p class="text-ui text-fg" data-testid="decision-summary">
          {{
            'privacy.decision.decided'
              | transloco
                : {
                    status: ('privacy.status.' + r.status | transloco),
                    name: deciderName(),
                    date: (r.decided_at | localDay: 'mediumDate'),
                  }
          }}
        </p>
        @if (r.decision_comment) {
          <p class="mt-1 text-ui whitespace-pre-line text-fg-muted">{{ r.decision_comment }}</p>
        }
      } @else if (r.status === 'awaiting_decision') {
        <p class="text-ui text-fg-muted">{{ 'privacy.decision.awaiting' | transloco }}</p>
      } @else {
        <p class="text-ui text-fg-muted">
          {{ 'privacy.decision.notYet.' + register() | transloco }}
        </p>
      }
      @if (canDecide()) {
        <div class="mt-3 flex flex-wrap gap-2">
          <app-button size="sm" (click)="deciding.set('approved')" data-testid="decide-approve">
            {{ 'privacy.decision.approve' | transloco }}
          </app-button>
          <app-button
            size="sm"
            variant="danger"
            (click)="deciding.set('rejected')"
            data-testid="decide-reject"
          >
            {{ 'privacy.decision.reject' | transloco }}
          </app-button>
        </div>
      } @else if (r.status === 'awaiting_decision' && !canApprove()) {
        <p class="mt-2 text-meta text-fg-subtle">
          {{ 'privacy.decision.needsApprover' | transloco }}
        </p>
      }
      @if (error(); as e) {
        <app-alert tone="error" class="mt-3 block" data-testid="decision-error">
          {{ e.key | transloco: { fields: e.fields } }}
        </app-alert>
      }
    </app-card>
    <app-prompt-dialog
      [open]="deciding() !== null"
      [title]="'privacy.decision.dialogTitle.' + (deciding() ?? 'approved') | transloco"
      [message]="'privacy.decision.dialogMessage' | transloco"
      [label]="'privacy.decision.comment' | transloco"
      [confirmLabel]="
        'privacy.decision.' + (deciding() === 'rejected' ? 'reject' : 'approve') | transloco
      "
      [cancelLabel]="'privacy.common.cancel' | transloco"
      [confirmVariant]="deciding() === 'rejected' ? 'danger' : 'primary'"
      [required]="deciding() === 'rejected'"
      [busy]="busy()"
      (confirmed)="decide($event)"
      (cancelled)="deciding.set(null)"
    />
  `,
})
export class DecisionPanel {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notify = inject(NotificationService);
  private readonly refs = inject(PrivacyRefsService);
  private readonly language = inject(LanguageService);

  readonly register = input.required<Extract<RegisterKey, 'dpia' | 'lba'>>();
  readonly record = input.required<Dpia | LegalBasisAssessment>();
  readonly canApprove = input(false);
  readonly changed = output<PrivacyRecord>();

  protected readonly deciding = signal<Decision | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<{ key: string; fields: string } | null>(null);

  protected readonly asDpia = computed(() => this.record() as Dpia);
  protected readonly asLba = computed(() => this.record() as LegalBasisAssessment);
  protected readonly canDecide = computed(
    () => this.canApprove() && this.record().status === 'awaiting_decision',
  );
  protected readonly deciderName = computed(
    () =>
      this.refs.userName(this.record().decided_by) ??
      this.language.translate('privacy.common.someone'),
  );

  protected decide(comment: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    const decision = this.deciding();
    if (!orgId || !decision) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const def = REGISTERS[this.register()];
    this.api
      .decide(orgId, def, this.record().id, { decision, comment: comment.trim() || null })
      .subscribe({
        next: (r) => {
          this.busy.set(false);
          this.deciding.set(null);
          this.notify.success(`privacy.notices.${decision}`, { code: r.code });
          this.changed.emit(r);
        },
        error: (err) => {
          this.busy.set(false);
          this.deciding.set(null);
          const e = privacyError(err);
          this.error.set({
            key: e.key,
            fields: e.fields.map((f) => this.language.translate(`privacy.fields.${f}`)).join(', '),
          });
        },
      });
  }
}
