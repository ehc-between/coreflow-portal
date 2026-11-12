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
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { RecruitmentApi } from '../data/recruitment-api';
import {
  blankToNull,
  checkStatusTone,
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
} from '../data/recruitment.models';

interface CheckDraft {
  readonly check_type: CheckType;
  readonly required: boolean;
  readonly consent_obtained: boolean;
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
    referee_name: '',
    referee_contact: '',
    due_at: '',
    notes: '',
  };
}

/**
 * Background and reference checks, proportional to the role's risk
 * (ISO/IEC 27001 A.6.1). A check only progresses with the candidate's consent,
 * waiving one needs a note, and an offer waits until every required check is
 * passed, waived or marked with concerns.
 */
@Component({
  selector: 'app-application-checks',
  imports: [
    TranslocoPipe,
    FieldHelp,
    LocalDatePipe,
    Badge,
    Button,
    Card,
    FormField,
    Icon,
    PromptDialog,
    SlideOver,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'recruitment.checks.title' | transloco }}
        </h2>
        @if (canEdit()) {
          <div class="flex flex-wrap gap-2">
            @if (checks().length === 0) {
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
      <app-field-help scope="recruitment" page="application" field="checks" />
      <p class="mt-2 text-[12.5px] text-fg-muted">
        {{ 'recruitment.checks.requiredForRole' | transloco }}
        @for (c of required(); track c; let last = $last) {
          {{ 'recruitment.checkType.' + c | transloco }}{{ last ? '' : ', ' }}
        }
      </p>
      @if (pending().length > 0) {
        <p class="mt-1 text-[12.5px] font-semibold text-warn" data-testid="checks-pending">
          {{ 'recruitment.checks.pending' | transloco: { count: pending().length } }}
        </p>
      }

      <ul class="mt-3 flex flex-col gap-2">
        @for (check of checks(); track check.id) {
          <li class="rounded-tile border border-border p-3 text-[13px]">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-fg">{{
                'recruitment.checkType.' + check.check_type | transloco
              }}</span>
              @if (check.required) {
                <app-badge tone="neutral">{{
                  'recruitment.checks.required' | transloco
                }}</app-badge>
              }
              <app-badge [tone]="statusTone(check.status)">{{
                'recruitment.checkStatus.' + check.status | transloco
              }}</app-badge>
              @if (!check.consent_obtained) {
                <app-badge tone="warn">{{ 'recruitment.checks.noConsent' | transloco }}</app-badge>
              }
              @if (check.due_at) {
                <span class="text-fg-subtle">
                  {{ 'recruitment.checks.due' | transloco: { date: (check.due_at | localDate) } }}
                </span>
              }
            </div>
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
              <p class="mt-1 text-[12px] text-fg-subtle">
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
                <label class="sr-only" [attr.for]="'chk-' + check.id">{{
                  'recruitment.fields.status' | transloco
                }}</label>
                <select
                  [id]="'chk-' + check.id"
                  class="h-8 rounded-[8px] border border-border bg-bg px-2 text-[12.5px] text-fg outline-none focus:border-accent"
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
                    class="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[12.5px] font-semibold text-fg-muted hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    (click)="remove(check)"
                  >
                    <app-icon name="trash" [size]="13" />
                    {{ 'recruitment.common.delete' | transloco }}
                  </button>
                }
              </div>
            }
          </li>
        } @empty {
          <li class="text-[13px] text-fg-muted">{{ 'recruitment.checks.none' | transloco }}</li>
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
      [confirmLabel]="'recruitment.checkStatus.waived' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      (confirmed)="waive($event)"
      (cancelled)="waiving.set(null)"
    />

    <app-slide-over
      [open]="formOpen()"
      [title]="'recruitment.checks.add' | transloco"
      [closeLabel]="'recruitment.common.close' | transloco"
      (closed)="formOpen.set(false)"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()">
        <app-form-field [label]="'recruitment.fields.checkType' | transloco" inputId="chk-type">
          <select id="chk-type" (change)="set('check_type', $any($event.target).value)">
            @for (t of types; track t) {
              <option [value]="t" [selected]="t === draft().check_type">
                {{ 'recruitment.checkType.' + t | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <label class="flex items-center gap-2 text-[13.5px] text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="draft().required"
            (change)="set('required', $any($event.target).checked)"
          />
          {{ 'recruitment.checks.required' | transloco }}
        </label>
        <label class="flex items-start gap-2 text-[13.5px] text-fg">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            [checked]="draft().consent_obtained"
            (change)="set('consent_obtained', $any($event.target).checked)"
          />
          <span>{{ 'recruitment.checks.consentObtained' | transloco }}</span>
        </label>
        <app-form-field [label]="'recruitment.fields.refereeName' | transloco" inputId="chk-ref">
          <input
            id="chk-ref"
            maxlength="200"
            [value]="draft().referee_name"
            (input)="set('referee_name', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          [label]="'recruitment.fields.refereeContact' | transloco"
          inputId="chk-contact"
        >
          <input
            id="chk-contact"
            maxlength="320"
            [value]="draft().referee_contact"
            (input)="set('referee_contact', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'recruitment.fields.dueAt' | transloco" inputId="chk-due">
          <input
            id="chk-due"
            type="datetime-local"
            [value]="draft().due_at"
            (input)="set('due_at', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'recruitment.fields.checkNotes' | transloco" inputId="chk-notes">
          <textarea
            id="chk-notes"
            rows="3"
            maxlength="5000"
            [value]="draft().notes"
            (input)="set('notes', $any($event.target).value)"
          ></textarea>
        </app-form-field>
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

  readonly applicationId = input.required<string>();
  readonly checks = input<readonly Check[]>([]);
  readonly required = input<readonly CheckType[]>([]);
  readonly canEdit = input(false);
  readonly canManage = input(false);
  readonly changed = output<void>();

  protected readonly types = CHECK_TYPES;
  protected readonly statuses = CHECK_STATUSES;
  protected readonly statusTone = checkStatusTone;
  protected readonly saving = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly waiving = signal<Check | null>(null);
  protected readonly draft = signal<CheckDraft>(emptyDraft());
  protected readonly pending = computed(() =>
    pendingRequiredChecks(this.required(), this.checks()),
  );

  protected openForm(): void {
    this.draft.set(emptyDraft());
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
    const d = this.draft();
    this.run(
      this.api.addCheck(orgId, this.applicationId(), {
        check_type: d.check_type,
        required: d.required,
        consent_obtained: d.consent_obtained,
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

  protected remove(check: Check): void {
    const orgId = this.orgId();
    if (orgId) {
      this.run(this.api.deleteCheck(orgId, check.id), 'recruitment.checks.deleted');
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
