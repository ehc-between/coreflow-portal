import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { hasAnyPermission } from '../../core/auth/permission';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { localize } from '../../core/records/localized';
import {
  Approval,
  FieldSpec,
  LocalizedText,
  RecordData,
  TransitionOption,
  TransitionResult,
  WorkflowInstance,
} from '../../core/records/record.models';
import {
  guardLabelKey,
  recordsErrorDetail,
  recordsErrorMessage,
} from '../../core/records/records-errors';
import { RecordsApi } from '../../core/records/records-api';
import { LocalDatePipe } from '../locale/locale-pipes';
import { RelativeTimePipe } from '../relative-time/relative-time';
import { Badge, BadgeTone } from '../ui/badge/badge';
import { Button } from '../ui/button/button';
import { FormField } from '../ui/form-field/form-field';
import { Icon } from '../ui/icon/icon';
import { DynamicForm } from './dynamic-form';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { PickOption } from './form-model';

/** Badge tone per state category. */
export function categoryTone(category: string): BadgeTone {
  switch (category) {
    case 'done':
      return 'pass';
    case 'in_progress':
      return 'warn';
    case 'cancelled':
      return 'neutral';
    default:
      return 'info';
  }
}

/** Whether a transition needs the inline step (comment, missing fields or approval note). */
export function needsPrompt(option: TransitionOption): boolean {
  return option.require_comment || option.missing_fields.length > 0 || option.needs_approval;
}

/**
 * The workflow of one record (`<app-workflow-panel [entityType] [entityId] [data] (transitioned)>`):
 * the current state, SLA, the transitions the caller may run (blocked ones say
 * why), an inline step that asks for a comment and any missing required fields
 * before running a transition, and the approval requests with approve / reject
 * / withdraw. Pass `fields` (the record type's fields) so missing required
 * fields can be filled in place; their values go out with the transition's
 * `data` and are emitted in `transitioned` for the host to save.
 */
@Component({
  selector: 'app-workflow-panel',
  imports: [
    FormsModule,
    TranslocoPipe,
    Badge,
    Button,
    FormField,
    Icon,
    DynamicForm,
    LocalDatePipe,
    RelativeTimePipe,
  ],
  viewProviders: [provideSharedScope('records')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-card border border-border bg-surface p-4 shadow-card"
      [attr.aria-label]="'records.panel.title' | transloco"
      data-testid="workflow-panel"
    >
      <h2 class="mb-3 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
        {{ 'records.panel.title' | transloco }}
      </h2>

      @if (loading()) {
        <p class="text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else if (notStarted()) {
        <p class="text-[13px] text-fg-muted">{{ 'records.panel.notStarted' | transloco }}</p>
      } @else if (instance(); as inst) {
        <div class="flex flex-wrap items-center gap-2">
          <app-badge [tone]="tone(inst.state_category)">{{ label(inst.state_label) }}</app-badge>
          <span class="text-[12px] text-fg-subtle">
            {{
              'records.panel.since'
                | transloco: { when: inst.state_entered_at | relativeTime: lang() }
            }}
          </span>
        </div>
        @if (inst.sla_due_at && !inst.closed_at) {
          <p
            class="mt-2 inline-flex items-center gap-1.5 text-[12.5px]"
            [class.text-fail]="overdue()"
            [class.text-fg-muted]="!overdue()"
          >
            <app-icon name="clock" [size]="14" />
            {{
              (overdue() ? 'records.panel.slaOverdue' : 'records.panel.slaDue')
                | transloco: { when: inst.sla_due_at | localDate: 'medium' }
            }}
          </p>
        }
        <p class="mt-1 text-[11.5px] text-fg-subtle">
          {{
            'records.panel.definition'
              | transloco
                : { name: inst.definition_version.name, version: inst.definition_version.version }
          }}
        </p>

        @if (inst.transitions.length) {
          <div
            class="mt-4 flex flex-col gap-2"
            role="group"
            [attr.aria-label]="'records.panel.actions' | transloco"
          >
            @for (option of inst.transitions; track option.key) {
              <div>
                <app-button
                  [variant]="option.to_category === 'cancelled' ? 'secondary' : 'primary'"
                  size="sm"
                  [full]="true"
                  [disabled]="!!option.blocked_by || busy()"
                  [loading]="busy() && active()?.key === option.key"
                  (click)="choose(option)"
                >
                  {{ label(option.label) }}
                  @if (option.needs_approval) {
                    <span class="text-[11px] font-medium opacity-80">
                      · {{ 'records.panel.needsApproval' | transloco }}
                    </span>
                  }
                </app-button>
                @if (option.blocked_by) {
                  <p class="mt-1 text-[11.5px] text-fg-subtle">
                    {{ guardKey(option.blocked_by) | transloco }}
                  </p>
                }
              </div>
            }
          </div>
        } @else if (!inst.closed_at) {
          <p class="mt-4 text-[12.5px] text-fg-subtle">
            {{ 'records.panel.noActions' | transloco }}
          </p>
        }

        @if (active(); as option) {
          <div
            class="mt-4 rounded-tile border border-accent-border bg-accent-soft/40 p-3"
            role="region"
            [attr.aria-label]="label(option.label)"
          >
            <p class="mb-2 text-[13px] font-semibold text-fg">{{ label(option.label) }}</p>
            @if (option.needs_approval) {
              <p class="mb-2 text-[12.5px] text-fg-muted">
                {{ 'records.panel.approvalExplain' | transloco }}
              </p>
            }
            @if (missingFields().length) {
              <p class="mb-2 text-[12.5px] text-fg-muted">
                {{ 'records.panel.fillMissing' | transloco }}
              </p>
              @if (missingSpecs().length) {
                <app-dynamic-form
                  [fields]="missingSpecs()"
                  [value]="extra()"
                  [errors]="fieldErrors()"
                  [people]="people()"
                  [departments]="departments()"
                  (valueChange)="extra.set($event)"
                />
              } @else {
                <p class="text-[12.5px] text-fail">
                  {{
                    'records.panel.missingList' | transloco: { fields: missingFields().join(', ') }
                  }}
                </p>
              }
            }
            @if (option.require_comment || option.needs_approval) {
              <div class="mt-3">
                <app-form-field
                  [label]="
                    (option.require_comment
                      ? 'records.panel.commentRequired'
                      : 'records.panel.comment'
                    ) | transloco
                  "
                  [inputId]="commentId"
                >
                  <textarea
                    [id]="commentId"
                    rows="3"
                    maxlength="5000"
                    [ngModel]="comment()"
                    (ngModelChange)="comment.set($event)"
                    [attr.aria-required]="option.require_comment || null"
                  ></textarea>
                </app-form-field>
              </div>
            }
            <div class="mt-3 flex justify-end gap-2">
              <app-button variant="ghost" size="sm" [disabled]="busy()" (click)="cancel()">
                {{ 'common.cancel' | transloco }}
              </app-button>
              <app-button
                size="sm"
                [loading]="busy()"
                [disabled]="option.require_comment && !comment().trim()"
                (click)="run(option)"
              >
                {{
                  (option.needs_approval
                    ? 'records.panel.requestApproval'
                    : 'records.panel.confirm'
                  ) | transloco
                }}
              </app-button>
            </div>
          </div>
        }

        @if (pending().length) {
          <div class="mt-5">
            <h3 class="mb-2 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
              {{ 'records.panel.approvals' | transloco }}
            </h3>
            <ul class="flex flex-col gap-2">
              @for (approval of pending(); track approval.id) {
                <li class="rounded-tile border border-border p-3">
                  <p class="text-[12.5px] text-fg">
                    {{
                      'records.panel.approvalLine'
                        | transloco
                          : {
                              transition: transitionLabel(approval.transition_key),
                              name: approval.requested_by_name ?? '',
                            }
                    }}
                  </p>
                  <p class="mt-0.5 text-[11.5px] text-fg-subtle">
                    {{ approverText(approval) }}
                  </p>
                  @if (approval.can_decide || canWithdraw(approval)) {
                    <div class="mt-2 flex flex-wrap gap-2">
                      @if (approval.can_decide) {
                        <app-button size="sm" [disabled]="busy()" (click)="decide(approval, true)">
                          {{ 'records.panel.approve' | transloco }}
                        </app-button>
                        <app-button
                          size="sm"
                          variant="secondary"
                          [disabled]="busy()"
                          (click)="decide(approval, false)"
                        >
                          {{ 'records.panel.reject' | transloco }}
                        </app-button>
                      }
                      @if (canWithdraw(approval)) {
                        <app-button
                          size="sm"
                          variant="ghost"
                          [disabled]="busy()"
                          (click)="withdraw(approval)"
                        >
                          {{ 'records.panel.withdraw' | transloco }}
                        </app-button>
                      }
                    </div>
                  }
                </li>
              }
            </ul>
          </div>
        }

        @if (decided().length) {
          <details class="mt-4">
            <summary class="cursor-pointer text-[12px] font-semibold text-fg-muted">
              {{ 'records.panel.history' | transloco: { count: decided().length } }}
            </summary>
            <ul class="mt-2 flex flex-col gap-1.5">
              @for (approval of decided(); track approval.id) {
                <li class="text-[12px] text-fg-muted">
                  {{
                    'records.panel.decisionLine.' + approval.decision
                      | transloco
                        : {
                            transition: transitionLabel(approval.transition_key),
                            name: approval.decided_by_name ?? '',
                          }
                  }}
                  @if (approval.comment) {
                    <span class="block text-fg-subtle italic">“{{ approval.comment }}”</span>
                  }
                </li>
              }
            </ul>
          </details>
        }
      }
    </section>
  `,
})
export class WorkflowPanel {
  private readonly api = inject(RecordsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  /** The record's current data (for required-field checks and the transition body). */
  readonly data = input<RecordData>({});
  /** The record type's fields, so missing required fields can be filled in place. */
  readonly fields = input<readonly FieldSpec[]>([]);
  readonly people = input<readonly PickOption[]>([]);
  readonly departments = input<readonly PickOption[]>([]);

  /** After a transition, an approval decision or a withdrawal; carries the merged data. */
  readonly transitioned = output<{
    readonly result: TransitionResult | null;
    readonly data: Record<string, unknown>;
  }>();

  protected readonly lang = this.language.active;
  protected readonly commentId = `wf-comment-${Math.random().toString(36).slice(2, 9)}`;

  protected readonly instance = signal<WorkflowInstance | null>(null);
  protected readonly loading = signal(false);
  protected readonly notStarted = signal(false);
  protected readonly busy = signal(false);
  protected readonly active = signal<TransitionOption | null>(null);
  protected readonly comment = signal('');
  protected readonly extra = signal<Record<string, unknown>>({});
  protected readonly fieldErrors = signal<Record<string, string>>({});
  /** Missing fields reported by the server on the last attempt (overrides the option's). */
  private readonly serverMissing = signal<readonly string[] | null>(null);

  protected readonly pending = computed(
    () => this.instance()?.approvals.filter((a) => a.decision === 'pending') ?? [],
  );
  protected readonly decided = computed(
    () => this.instance()?.approvals.filter((a) => a.decision !== 'pending') ?? [],
  );
  protected readonly overdue = computed(() => {
    const due = this.instance()?.sla_due_at;
    return !!due && new Date(due.endsWith('Z') ? due : `${due}Z`).getTime() < Date.now();
  });
  protected readonly missingFields = computed(
    () => this.serverMissing() ?? this.active()?.missing_fields ?? [],
  );
  protected readonly missingSpecs = computed(() => {
    const keys = new Set(this.missingFields());
    return this.fields()
      .filter((field) => keys.has(field.key))
      .map((field) => ({ ...field, required: true, visible_if: null }));
  });
  private readonly isAdmin = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'records:admin'),
  );

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const entityType = this.entityType();
      const entityId = this.entityId();
      untracked(() => this.load(orgId, entityType, entityId));
    });
  }

  /** Re-read the instance (e.g. after the host saved the record). */
  reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.entityType(), this.entityId());
  }

  protected tone(category: string): BadgeTone {
    return categoryTone(category);
  }

  protected label(value: LocalizedText | null | undefined): string {
    return localize(value, this.lang());
  }

  protected guardKey(guard: string): string {
    return guardLabelKey(guard);
  }

  protected transitionLabel(key: string): string {
    const t = this.instance()?.definition.transitions.find((tr) => tr.key === key);
    return localize(t?.label, this.lang()) || key;
  }

  protected approverText(approval: Approval): string {
    const roles = approval.approver_role_key
      ? [approval.approver_role_key]
      : approval.eligible_roles;
    return roles.join(', ');
  }

  protected canWithdraw(approval: Approval): boolean {
    return approval.requested_by === this.auth.user()?.id || this.isAdmin();
  }

  protected choose(option: TransitionOption): void {
    this.serverMissing.set(null);
    this.fieldErrors.set({});
    this.comment.set('');
    this.extra.set({});
    if (needsPrompt(option)) {
      this.active.set(option);
      return;
    }
    this.run(option);
  }

  protected cancel(): void {
    this.active.set(null);
    this.serverMissing.set(null);
  }

  protected run(option: TransitionOption): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const data = { ...this.data(), ...this.extra() };
    const lang = this.lang() === 'nb' ? 'nb' : 'en';
    this.busy.set(true);
    this.active.set(option);
    this.api
      .transition(orgId, this.entityType(), this.entityId(), option.key, {
        data,
        comment: this.comment().trim() || null,
        lang,
      })
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.active.set(null);
          this.instance.set(result.instance);
          this.notifications.success(
            result.pending_approval_ids.length
              ? 'records.panel.approvalRequestedToast'
              : 'records.panel.transitionedToast',
          );
          this.transitioned.emit({ result, data });
        },
        error: (error: unknown) => {
          this.busy.set(false);
          const detail = recordsErrorDetail(error);
          if (detail.code === 'required_fields' && Array.isArray(detail.extra['fields'])) {
            const fields = detail.extra['fields'] as string[];
            this.serverMissing.set(fields);
            this.fieldErrors.set(Object.fromEntries(fields.map((f) => [f, 'required'])));
            this.active.set(option);
            return;
          }
          if (!needsPrompt(option) && detail.code !== 'comment_required') {
            this.active.set(null);
          }
          this.toast(error);
        },
      });
  }

  protected decide(approval: Approval, approve: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.decide(orgId, approval.id, { approve }).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success(
          approve ? 'records.panel.approvedToast' : 'records.panel.rejectedToast',
        );
        this.reload();
        this.transitioned.emit({ result: null, data: { ...this.data() } });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast(error);
      },
    });
  }

  protected withdraw(approval: Approval): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.withdraw(orgId, approval.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('records.panel.withdrawnToast');
        this.reload();
        this.transitioned.emit({ result: null, data: { ...this.data() } });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast(error);
      },
    });
  }

  private toast(error: unknown): void {
    const message = recordsErrorMessage(error);
    if (message) {
      this.notifications.error(message.key, message.params);
    }
  }

  private load(orgId: string | null, entityType: string, entityId: string): void {
    this.instance.set(null);
    this.notStarted.set(false);
    this.active.set(null);
    if (!orgId || !entityType || !entityId) {
      return;
    }
    this.loading.set(true);
    this.api.getInstance(orgId, entityType, entityId).subscribe({
      next: (instance) => {
        this.instance.set(instance);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        if (recordsErrorDetail(error).code === 'workflow_not_started') {
          this.notStarted.set(true);
          return;
        }
        this.toast(error);
      },
    });
  }
}
