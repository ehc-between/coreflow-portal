import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RecruitmentApi } from '../data/recruitment-api';
import {
  blankToNull,
  checkToneValue,
  fromLocalInput,
  pendingRequiredChecks,
} from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  CHECK_STATUSES,
  CHECK_TYPES,
  Check,
  CheckStatus,
  CheckType,
  ChecksSummary,
  Stage,
} from '../data/recruitment.models';
import { RecruitmentField } from '../shared/recruitment-field';

/** Check types that need a written legal basis (never planned automatically). */
export const LEGAL_BASIS_TYPES: readonly CheckType[] = ['criminal_record', 'credit'];

/** Stages before the checks are planned automatically. */
const BEFORE_CHECKS: readonly Stage[] = ['applied', 'screening', 'interview', 'assessment'];

interface CheckDraft {
  readonly check_type: CheckType;
  readonly required: boolean;
  readonly consent_obtained: boolean;
  readonly legal_basis: string;
  readonly referee_name: string;
  readonly referee_contact: string;
  readonly due_at: string;
  readonly notes: string;
}

function emptyDraft(): CheckDraft {
  return {
    check_type: 'reference',
    required: false,
    consent_obtained: false,
    legal_basis: '',
    referee_name: '',
    referee_contact: '',
    due_at: '',
    notes: '',
  };
}

/** What the card says at the top: still to come, all done, or what is open. */
export type ChecksState = 'upcoming' | 'done' | 'open' | 'none';

export function checksState(
  stage: Stage,
  summary: ChecksSummary | null,
  pending: readonly CheckType[],
  checks: readonly Check[],
): ChecksState {
  const required = summary?.required_types ?? [];
  if (required.length === 0 && checks.length === 0) {
    return 'none';
  }
  const planned = summary ? summary.planned : checks.filter((c) => c.required).length;
  if (planned === 0 && BEFORE_CHECKS.includes(stage)) {
    return 'upcoming';
  }
  const open = summary ? summary.open + summary.not_planned.length : pending.length;
  return open === 0 && (summary?.failed ?? 0) === 0 ? 'done' : 'open';
}

let nextId = 0;

/**
 * Background and reference checks, proportional to the role's risk
 * (ISO/IEC 27001 A.6.1). Before the reference-check stage the card only says which
 * checks will be required; after that it counts what is done, open and not planned
 * yet. A check only progresses with the candidate's consent, waiving one needs a
 * note, and criminal-record and credit checks need a written legal basis.
 */
@Component({
  selector: 'app-application-checks',
  imports: [
    TranslocoPipe,
    FieldHelp,
    LocalDatePipe,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    PromptDialog,
    SlideOver,
    StatusBadge,
    RecruitmentField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block scroll-mt-20' },
  template: `
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-1.5 text-card font-bold text-fg">
          {{ 'recruitment.checks.title' | transloco }}
          <app-field-help
            scope="recruitment"
            page="application"
            field="checks"
            [requirements]="refs"
          />
        </h2>
        @if (canEdit()) {
          <div class="flex flex-wrap gap-2">
            @if (canPlan()) {
              <app-button size="sm" variant="secondary" [loading]="saving()" (click)="plan()">
                {{ 'recruitment.checks.plan' | transloco }}
              </app-button>
            }
            <app-button size="sm" variant="secondary" (click)="openForm()">
              <app-icon name="plus" [size]="14" />
              {{ 'recruitment.checks.add' | transloco }}
            </app-button>
          </div>
        }
      </div>

      @switch (state()) {
        @case ('upcoming') {
          <p class="text-ui text-fg-muted" data-testid="checks-upcoming">
            {{ 'recruitment.checks.upcoming' | transloco: { checks: requiredText() } }}
          </p>
        }
        @case ('done') {
          <p class="text-ui font-semibold text-pass-ink" data-testid="checks-done">
            {{ 'recruitment.checks.allDone' | transloco }}
          </p>
        }
        @case ('open') {
          <p class="text-ui text-fg-muted">
            {{ 'recruitment.checks.requiredForRole' | transloco }} {{ requiredText() }}
          </p>
          <p class="mt-1 text-ui font-semibold text-warn-ink" data-testid="checks-pending">
            {{ openText() }}
          </p>
        }
        @default {
          <p class="text-ui text-fg-muted">{{ 'recruitment.checks.noneRequired' | transloco }}</p>
        }
      }

      <ul class="mt-3 flex flex-col gap-2">
        @for (check of checks(); track check.id) {
          <li class="rounded-tile border border-border p-3 text-ui">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-fg">{{
                'recruitment.checkType.' + check.check_type | transloco
              }}</span>
              @if (check.required) {
                <app-status-badge
                  meaning="lifecycle"
                  value="draft"
                  labelKey="recruitment.checks.required"
                />
              }
              <app-status-badge
                meaning="lifecycle"
                [value]="statusValue(check.status)"
                [labelKey]="'recruitment.checkStatus.' + check.status"
              />
              @if (!check.consent_obtained) {
                <app-status-badge
                  meaning="lifecycle"
                  value="blocked"
                  labelKey="recruitment.checks.noConsent"
                />
              }
              @if (needsBasis(check)) {
                <app-status-badge
                  meaning="lifecycle"
                  value="blocked"
                  labelKey="recruitment.checks.legalBasisMissing"
                  data-testid="check-needs-basis"
                />
              }
              @if (check.due_at) {
                <span class="text-fg-subtle">
                  {{ 'recruitment.checks.due' | transloco: { date: (check.due_at | localDate) } }}
                </span>
              }
            </div>
            @if (check.legal_basis) {
              <p class="mt-1 text-fg-muted">
                {{ 'recruitment.checks.legalBasisShown' | transloco: { text: check.legal_basis } }}
              </p>
            }
            @if (check.referee_name || check.referee_contact) {
              <p class="mt-1 text-fg-muted">
                {{ check.referee_name }}
                @if (check.referee_contact) {
                  · {{ check.referee_contact }}
                }
              </p>
            }
            @if (check.notes) {
              <p class="mt-1 whitespace-pre-wrap text-fg">{{ check.notes }}</p>
            }
            @if (check.completed_by) {
              <p class="mt-1 text-meta text-fg-subtle">
                {{
                  'recruitment.checks.completedBy'
                    | transloco
                      : {
                          name: check.completed_by.name,
                          date: (check.completed_at | localDate),
                        }
                }}
              </p>
            }
            @if (canEdit()) {
              <div class="mt-2 flex flex-wrap items-center gap-2">
                @if (!check.consent_obtained) {
                  <app-button size="sm" variant="secondary" (click)="consent(check)">
                    {{ 'recruitment.checks.recordConsent' | transloco }}
                  </app-button>
                }
                @if (needsBasis(check)) {
                  <app-button size="sm" variant="secondary" (click)="basisFor.set(check)">
                    {{ 'recruitment.checks.addLegalBasis' | transloco }}
                  </app-button>
                }
                <label class="sr-only" [attr.for]="uid + '-' + check.id">{{
                  'recruitment.checks.statusOf'
                    | transloco: { type: ('recruitment.checkType.' + check.check_type | transloco) }
                }}</label>
                <select
                  [id]="uid + '-' + check.id"
                  class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg outline-none focus:border-accent"
                  [disabled]="saving()"
                  (change)="setStatus(check, $any($event.target).value, $event)"
                >
                  @for (s of statuses; track s) {
                    <option [value]="s" [selected]="s === check.status">
                      {{ 'recruitment.checkStatus.' + s | transloco }}
                    </option>
                  }
                </select>
                @if (!check.required || canManage()) {
                  <button
                    type="button"
                    class="inline-flex min-h-8 items-center gap-1 rounded-tile px-2 py-1 text-ui font-semibold text-fg-muted hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    (click)="removing.set(check)"
                  >
                    <app-icon name="trash" [size]="13" />
                    {{ 'recruitment.checks.remove' | transloco }}
                  </button>
                }
              </div>
            }
          </li>
        } @empty {
          @if (state() !== 'upcoming') {
            <li class="text-ui text-fg-muted">{{ 'recruitment.checks.none' | transloco }}</li>
          }
        }
      </ul>
    </app-card>

    <app-prompt-dialog
      [open]="waiving() !== null"
      [title]="'recruitment.checks.waiveTitle' | transloco"
      [message]="'recruitment.checks.waiveMessage' | transloco"
      [label]="'recruitment.checks.waiveNote' | transloco"
      [required]="true"
      [busy]="saving()"
      [confirmLabel]="'recruitment.checks.waive' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      (confirmed)="waive($event)"
      (cancelled)="waiving.set(null)"
    />
    <app-prompt-dialog
      [open]="basisFor() !== null"
      [title]="'recruitment.checks.addLegalBasis' | transloco"
      [message]="'recruitment.checks.legalBasisHint' | transloco"
      [label]="'recruitment.fields.legalBasis' | transloco"
      [required]="true"
      [busy]="saving()"
      confirmVariant="primary"
      [confirmLabel]="'recruitment.common.save' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      (confirmed)="saveBasis($event)"
      (cancelled)="basisFor.set(null)"
    />
    <app-confirm-dialog
      [open]="removing() !== null"
      [title]="'recruitment.checks.removeTitle' | transloco"
      [message]="'recruitment.checks.removeMessage' | transloco"
      [busy]="saving()"
      [confirmLabel]="'recruitment.checks.remove' | transloco"
      [cancelLabel]="'recruitment.common.keep' | transloco"
      (confirmed)="remove()"
      (cancelled)="removing.set(null)"
    />

    <app-slide-over
      [open]="formOpen()"
      [title]="'recruitment.checks.add' | transloco"
      [closeLabel]="'recruitment.common.close' | transloco"
      (closed)="formOpen.set(false)"
    >
      <form class="flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
        <app-recruitment-field
          labelKey="recruitment.fields.checkType"
          [inputId]="uid + '-type'"
          [required]="true"
        >
          <select [id]="uid + '-type'" (change)="set('check_type', $any($event.target).value)">
            @for (t of types; track t) {
              <option [value]="t" [selected]="t === draft().check_type">
                {{ 'recruitment.checkType.' + t | transloco }}
              </option>
            }
          </select>
        </app-recruitment-field>
        @if (draftNeedsBasis()) {
          <app-recruitment-field
            labelKey="recruitment.fields.legalBasis"
            [inputId]="uid + '-basis'"
            page="application"
            help="legal_basis"
            [required]="true"
            hintKey="recruitment.checks.legalBasisHint"
            [error]="basisError()"
            [ask]="'recruitment.ask.legalBasis' | transloco"
          >
            <textarea
              [id]="uid + '-basis'"
              rows="3"
              maxlength="2000"
              [value]="draft().legal_basis"
              (input)="set('legal_basis', $any($event.target).value)"
              data-testid="check-legal-basis"
            ></textarea>
          </app-recruitment-field>
        }
        <label class="flex min-h-6 items-center gap-2 text-body text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="draft().required"
            (change)="set('required', $any($event.target).checked)"
          />
          {{ 'recruitment.checks.requiredBeforeOffer' | transloco }}
        </label>
        <label class="flex items-start gap-2 text-body text-fg">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            [checked]="draft().consent_obtained"
            (change)="set('consent_obtained', $any($event.target).checked)"
          />
          <span>{{ 'recruitment.checks.consentObtained' | transloco }}</span>
        </label>
        <app-recruitment-field labelKey="recruitment.fields.refereeName" [inputId]="uid + '-ref'">
          <input
            [id]="uid + '-ref'"
            maxlength="200"
            [value]="draft().referee_name"
            (input)="set('referee_name', $any($event.target).value)"
          />
        </app-recruitment-field>
        <app-recruitment-field
          labelKey="recruitment.fields.refereeContact"
          [inputId]="uid + '-contact'"
        >
          <input
            [id]="uid + '-contact'"
            maxlength="320"
            [value]="draft().referee_contact"
            (input)="set('referee_contact', $any($event.target).value)"
          />
        </app-recruitment-field>
        <app-recruitment-field labelKey="recruitment.fields.dueAt" [inputId]="uid + '-due'">
          <input
            [id]="uid + '-due'"
            type="datetime-local"
            [value]="draft().due_at"
            (input)="set('due_at', $any($event.target).value)"
          />
        </app-recruitment-field>
        <app-recruitment-field labelKey="recruitment.fields.checkNotes" [inputId]="uid + '-notes'">
          <textarea
            [id]="uid + '-notes'"
            rows="3"
            maxlength="5000"
            [value]="draft().notes"
            (input)="set('notes', $any($event.target).value)"
          ></textarea>
        </app-recruitment-field>
        <div class="flex justify-end gap-2">
          <app-button variant="secondary" (click)="formOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="saving()">
            {{ 'recruitment.checks.save' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class ApplicationChecks {
  private readonly api = inject(RecruitmentApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly applicationId = input.required<string>();
  readonly stage = input<Stage>('applied');
  readonly checks = input<readonly Check[]>([]);
  readonly required = input<readonly CheckType[]>([]);
  readonly summary = input<ChecksSummary | null>(null);
  readonly canEdit = input(false);
  readonly canManage = input(false);
  readonly changed = output<void>();

  protected readonly uid = `cf-chk-${++nextId}`;
  protected readonly refs = ['iso27001:A.6.1'];
  protected readonly types = CHECK_TYPES;
  protected readonly statuses = CHECK_STATUSES;
  protected readonly statusValue = checkToneValue;
  protected readonly saving = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly formSubmitted = signal(false);
  protected readonly waiving = signal<Check | null>(null);
  protected readonly basisFor = signal<Check | null>(null);
  protected readonly removing = signal<Check | null>(null);
  protected readonly draft = signal<CheckDraft>(emptyDraft());

  protected readonly pending = computed(() =>
    pendingRequiredChecks(this.required(), this.checks()),
  );
  protected readonly state = computed(() =>
    checksState(this.stage(), this.summary(), this.pending(), this.checks()),
  );
  protected readonly canPlan = computed(() => {
    const s = this.summary();
    return s ? s.not_planned.length > 0 : this.checks().length === 0 && this.required().length > 0;
  });
  protected readonly requiredText = computed(() => {
    const types = this.summary()?.required_types ?? this.required();
    return types.length === 0
      ? this.language.translate('common.empty.none')
      : types.map((t) => this.language.translate(`recruitment.checkType.${t}`)).join(', ');
  });
  protected readonly openText = computed(() => {
    const s = this.summary();
    const parts: string[] = [];
    if (s) {
      if (s.open > 0) {
        parts.push(this.language.translate('recruitment.checks.openCount', { count: s.open }));
      }
      if (s.failed > 0) {
        parts.push(this.language.translate('recruitment.checks.failedCount', { count: s.failed }));
      }
      if (s.not_planned.length > 0) {
        parts.push(
          this.language.translate('recruitment.checks.notPlanned', {
            checks: s.not_planned
              .map((t) => this.language.translate(`recruitment.checkType.${t}`))
              .join(', '),
          }),
        );
      }
      if (s.done > 0) {
        parts.push(this.language.translate('recruitment.checks.doneCount', { count: s.done }));
      }
      return parts.join(' · ');
    }
    return this.language.translate('recruitment.checks.pending', { count: this.pending().length });
  });
  protected readonly draftNeedsBasis = computed(() =>
    LEGAL_BASIS_TYPES.includes(this.draft().check_type),
  );
  protected readonly basisError = computed(() =>
    this.formSubmitted() && this.draftNeedsBasis() && !this.draft().legal_basis.trim()
      ? 'recruitment.checks.legalBasisRequired'
      : null,
  );

  protected needsBasis(check: Check): boolean {
    const needs = check.needs_legal_basis ?? LEGAL_BASIS_TYPES.includes(check.check_type);
    return needs && !check.legal_basis;
  }

  protected openForm(): void {
    this.draft.set(emptyDraft());
    this.formSubmitted.set(false);
    this.formOpen.set(true);
  }

  protected set<K extends keyof CheckDraft>(key: K, value: CheckDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected plan(): void {
    const orgId = this.orgId();
    if (orgId) {
      this.run(this.api.planChecks(orgId, this.applicationId()), 'recruitment.checks.planned');
    }
  }

  protected save(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.formSubmitted.set(true);
    if (this.basisError()) {
      return;
    }
    const d = this.draft();
    this.run(
      this.api.addCheck(orgId, this.applicationId(), {
        check_type: d.check_type,
        required: d.required,
        consent_obtained: d.consent_obtained,
        legal_basis: this.draftNeedsBasis() ? blankToNull(d.legal_basis) : null,
        referee_name: blankToNull(d.referee_name),
        referee_contact: blankToNull(d.referee_contact),
        due_at: fromLocalInput(d.due_at),
        notes: blankToNull(d.notes),
      }),
      'recruitment.checks.added',
      () => this.formOpen.set(false),
    );
  }

  protected consent(check: Check): void {
    const orgId = this.orgId();
    if (orgId) {
      this.run(
        this.api.updateCheck(orgId, check.id, { consent_obtained: true }),
        'recruitment.checks.updated',
      );
    }
  }

  protected saveBasis(text: string): void {
    const orgId = this.orgId();
    const check = this.basisFor();
    if (orgId && check && text.trim()) {
      this.run(
        this.api.updateCheck(orgId, check.id, { legal_basis: text.trim() }),
        'recruitment.checks.updated',
        () => this.basisFor.set(null),
      );
    }
  }

  protected setStatus(check: Check, value: string, event: Event): void {
    const orgId = this.orgId();
    const status = value as CheckStatus;
    if (!orgId || status === check.status) {
      return;
    }
    if (status === 'waived') {
      // Reset the picker until the note is given.
      (event.target as HTMLSelectElement).value = check.status;
      this.waiving.set(check);
      return;
    }
    this.run(this.api.updateCheck(orgId, check.id, { status }), 'recruitment.checks.updated');
  }

  protected waive(note: string): void {
    const orgId = this.orgId();
    const check = this.waiving();
    if (!orgId || !check) {
      return;
    }
    this.run(
      this.api.updateCheck(orgId, check.id, {
        status: 'waived',
        notes: check.notes ? `${check.notes}\n${note.trim()}` : note.trim(),
      }),
      'recruitment.checks.updated',
      () => this.waiving.set(null),
    );
  }

  protected remove(): void {
    const orgId = this.orgId();
    const check = this.removing();
    if (orgId && check) {
      this.run(this.api.deleteCheck(orgId, check.id), 'recruitment.checks.deleted', () =>
        this.removing.set(null),
      );
    }
  }

  private run(call: Observable<unknown>, messageKey: string, after?: () => void): void {
    this.saving.set(true);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        after?.();
        this.toasts.success(messageKey);
        this.changed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.toasts.error(recruitmentError(err).key);
        this.changed.emit();
      },
    });
  }
}
