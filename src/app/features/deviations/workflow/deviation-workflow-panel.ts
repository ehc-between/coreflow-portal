import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { hasAnyPermission } from '../../../core/auth/permission';
import { DeviationDetail } from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { localize } from '../../../core/records/localized';
import {
  Approval,
  FieldSpec,
  LocalizedText,
  TransitionOption,
} from '../../../core/records/record.models';
import {
  guardLabelKey,
  recordsErrorDetail,
  recordsErrorMessage,
} from '../../../core/records/records-errors';
import { RecordsApi } from '../../../core/records/records-api';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { DynamicForm } from '../../../shared/records/dynamic-form';
import { PickOption } from '../../../shared/records/form-model';
import { categoryTone, needsPrompt } from '../../../shared/records/workflow-panel';
import { RelativeTimePipe } from '../../../shared/relative-time/relative-time';
import { Badge, BadgeTone } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import {
  coreFieldSpecs,
  missingFieldSpecs,
  missingFieldsPatch,
  unrenderableFields,
} from './workflow-run';

/**
 * The F4 workflow of a record-typed deviation, driven by the deviation's own
 * endpoints (`POST deviations/{id}/transitions/{key}`, which can also reopen a
 * closed deviation). Shows the current state with its category, the SLA and the
 * definition version, the transitions the caller may run (blocked ones say why)
 * and the approval requests (approve / reject / withdraw through F4).
 *
 * A transition that needs a comment, an approval note or missing required
 * fields opens an inline step first; values for missing fields are saved on the
 * deviation (core columns top-level, record fields into `data`) before the
 * transition runs, since the endpoint reads the saved record. Emits the
 * refreshed deviation in `changed`.
 */
@Component({
  selector: 'app-deviation-workflow-panel',
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
    @if (workflow(); as wf) {
      <section
        class="rounded-card border border-border bg-surface p-4 shadow-card"
        [attr.aria-label]="'records.panel.title' | transloco"
        data-testid="deviation-workflow-panel"
      >
        <h2 class="mb-3 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
          {{ 'records.panel.title' | transloco }}
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          <app-badge [tone]="tone(wf.state_category)" data-testid="workflow-state">{{
            label(wf.state_label)
          }}</app-badge>
          <span class="text-[12px] text-fg-subtle">
            {{
              'records.panel.since'
                | transloco: { when: wf.state_entered_at | relativeTime: lang() }
            }}
          </span>
        </div>
        @if (wf.sla_due_at && !wf.closed_at) {
          <p
            class="mt-2 inline-flex items-center gap-1.5 text-[12.5px]"
            [class.text-fail]="overdue()"
            [class.text-fg-muted]="!overdue()"
          >
            <app-icon name="clock" [size]="14" />
            {{
              (overdue() ? 'records.panel.slaOverdue' : 'records.panel.slaDue')
                | transloco: { when: wf.sla_due_at | localDate: 'medium' }
            }}
          </p>
        }
        <p class="mt-1 text-[11.5px] text-fg-subtle">
          {{
            'records.panel.definition'
              | transloco
                : { name: wf.definition_version.name, version: wf.definition_version.version }
          }}
        </p>

        @if (canWrite() && wf.transitions.length) {
          <div
            class="mt-4 flex flex-col gap-2"
            role="group"
            [attr.aria-label]="'records.panel.actions' | transloco"
          >
            @for (option of wf.transitions; track option.key) {
              <div>
                <app-button
                  [variant]="option.to_category === 'cancelled' ? 'secondary' : 'primary'"
                  size="sm"
                  [full]="true"
                  [disabled]="!!option.blocked_by || busy()"
                  [loading]="busy() && active()?.key === option.key"
                  [attr.data-transition]="option.key"
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
                } @else if (option.missing_fields.length) {
                  <p class="mt-1 text-[11.5px] text-fg-subtle">
                    {{
                      'deviations.wf.needsFields'
                        | transloco: { count: option.missing_fields.length }
                    }}
                  </p>
                }
              </div>
            }
          </div>
        } @else if (!wf.closed_at) {
          <p class="mt-4 text-[12.5px] text-fg-subtle">
            {{ 'records.panel.noActions' | transloco }}
          </p>
        } @else {
          <p class="mt-4 text-[12.5px] text-fg-subtle">{{ 'deviations.wf.closed' | transloco }}</p>
        }

        @if (active(); as option) {
          <div
            class="mt-4 rounded-tile border border-accent-border bg-accent-soft/40 p-3"
            role="region"
            [attr.aria-label]="label(option.label)"
            data-testid="transition-step"
          >
            <p class="mb-2 text-[13px] font-semibold text-fg">{{ label(option.label) }}</p>
            @if (option.needs_approval) {
              <p class="mb-2 text-[12.5px] text-fg-muted">
                {{ 'records.panel.approvalExplain' | transloco }}
              </p>
            }
            @if (missing().length) {
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
              }
              @if (unrenderable().length) {
                <p class="mt-2 text-[12.5px] text-fail">
                  {{
                    'records.panel.missingList' | transloco: { fields: unrenderable().join(', ') }
                  }}
                </p>
              }
            }
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
                  maxlength="2000"
                  [ngModel]="comment()"
                  (ngModelChange)="comment.set($event)"
                  [attr.aria-required]="option.require_comment || null"
                ></textarea>
              </app-form-field>
            </div>
            <div class="mt-3 flex justify-end gap-2">
              <app-button variant="ghost" size="sm" [disabled]="busy()" (click)="cancel()">
                {{ 'common.cancel' | transloco }}
              </app-button>
              <app-button
                size="sm"
                [loading]="busy()"
                [disabled]="option.require_comment && !comment().trim()"
                (click)="run(option)"
                data-testid="transition-confirm"
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
                  <p class="mt-0.5 text-[11.5px] text-fg-subtle">{{ approverText(approval) }}</p>
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
      </section>
    }
  `,
})
export class DeviationWorkflowPanel {
  private readonly api = inject(DeviationsApi);
  private readonly records = inject(RecordsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly deviation = input.required<DeviationDetail>();
  /** The pinned record type version's fields (to fill missing required fields in place). */
  readonly fields = input<readonly FieldSpec[]>([]);
  readonly people = input<readonly PickOption[]>([]);
  readonly departments = input<readonly PickOption[]>([]);
  /** The caller holds `deviations:write` (the server still checks edit reach). */
  readonly canWrite = input(false);

  /** The refreshed deviation after a transition, a decision or a withdrawal. */
  readonly changed = output<DeviationDetail>();

  protected readonly lang = this.language.active;
  protected readonly commentId = `dev-wf-comment-${Math.random().toString(36).slice(2, 9)}`;

  protected readonly workflow = computed(() => this.deviation().workflow ?? null);
  protected readonly busy = signal(false);
  protected readonly active = signal<TransitionOption | null>(null);
  protected readonly comment = signal('');
  protected readonly extra = signal<Record<string, unknown>>({});
  protected readonly fieldErrors = signal<Record<string, string>>({});
  /** Missing fields reported by the server on the last attempt (overrides the option's). */
  private readonly serverMissing = signal<readonly string[] | null>(null);

  protected readonly pending = computed(
    () => this.workflow()?.approvals.filter((a) => a.decision === 'pending') ?? [],
  );
  protected readonly decided = computed(
    () => this.workflow()?.approvals.filter((a) => a.decision !== 'pending') ?? [],
  );
  protected readonly overdue = computed(() => {
    const due = this.workflow()?.sla_due_at;
    return !!due && new Date(due.endsWith('Z') ? due : `${due}Z`).getTime() < Date.now();
  });
  protected readonly missing = computed(
    () => this.serverMissing() ?? this.active()?.missing_fields ?? [],
  );
  private readonly coreSpecs = computed(() => {
    this.lang();
    return coreFieldSpecs((key, params) => this.language.translate(key, params));
  });
  protected readonly missingSpecs = computed(() =>
    missingFieldSpecs(this.missing(), this.fields(), this.coreSpecs()),
  );
  protected readonly unrenderable = computed(() =>
    unrenderableFields(this.missing(), this.missingSpecs()),
  );
  private readonly isRecordsAdmin = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'records:admin'),
  );

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
    const t = this.workflow()?.definition.transitions.find((tr) => tr.key === key);
    return localize(t?.label, this.lang()) || key;
  }

  protected approverText(approval: Approval): string {
    const roles = approval.approver_role_key
      ? [approval.approver_role_key]
      : approval.eligible_roles;
    return roles.join(', ');
  }

  protected canWithdraw(approval: Approval): boolean {
    return approval.requested_by === this.auth.user()?.id || this.isRecordsAdmin();
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
    const dev = this.deviation();
    if (!orgId || this.busy()) {
      return;
    }
    const patch = this.missing().length
      ? missingFieldsPatch(this.extra(), dev.data ?? {}, this.fields())
      : null;
    const lang = this.lang() === 'nb' ? 'nb' : 'en';
    const save$: Observable<unknown> = patch
      ? this.api.updateDeviation(orgId, dev.id, patch)
      : of(null);
    this.busy.set(true);
    this.active.set(option);
    save$
      .pipe(
        switchMap(() =>
          this.api.transition(orgId, dev.id, option.key, {
            comment: this.comment().trim() || null,
            lang,
          }),
        ),
      )
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.active.set(null);
          this.serverMissing.set(null);
          this.notifications.success(
            option.needs_approval
              ? 'records.panel.approvalRequestedToast'
              : 'records.panel.transitionedToast',
          );
          this.changed.emit(updated);
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
          if (detail.code === 'invalid_data' && detail.extra['errors']) {
            this.fieldErrors.set(detail.extra['errors'] as Record<string, string>);
            this.active.set(option);
            this.notifications.error('deviations.create.validationToast');
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
    this.records.decide(orgId, approval.id, { approve }).subscribe({
      next: () => {
        this.notifications.success(
          approve ? 'records.panel.approvedToast' : 'records.panel.rejectedToast',
        );
        this.refresh(orgId);
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
    this.records.withdraw(orgId, approval.id).subscribe({
      next: () => {
        this.notifications.success('records.panel.withdrawnToast');
        this.refresh(orgId);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast(error);
      },
    });
  }

  private refresh(orgId: string): void {
    this.api.getDeviation(orgId, this.deviation().id).subscribe({
      next: (fresh) => {
        this.busy.set(false);
        this.changed.emit(fresh);
      },
      error: () => this.busy.set(false),
    });
  }

  private toast(error: unknown): void {
    const detail = recordsErrorDetail(error);
    if (detail.code === 'workflow_managed' || detail.code === 'not_workflow_managed') {
      this.notifications.error(`deviations.apiErrors.${detail.code}`);
      return;
    }
    const message = recordsErrorMessage(error);
    if (message) {
      this.notifications.error(message.key, message.params);
    }
  }
}
