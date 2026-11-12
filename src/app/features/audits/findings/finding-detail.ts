import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { ClauseChips } from '../../../shared/guidance/clause-chips';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { AuditAccess } from '../data/audit-access';
import {
  findingStatusTone,
  findingTypeTone,
  fromDateInput,
  textOrNull,
} from '../data/audit-display';
import { FindingAction, FindingDetail, NC_TYPES, REASON_REQUIRED } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditUserSelect } from '../shared/user-select';
import { DeviationPicker } from './deviation-picker';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];
const FORWARD: ReadonlySet<FindingAction> = new Set(['start', 'submit', 'verify', 'close']);
const RESPONSE_OPEN: readonly string[] = ['open', 'in_progress'];

export const FINDING_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'audits.fields.title',
  finding_type: 'audits.fields.findingType',
  status: 'audits.fields.status',
  description: 'audits.fields.description',
  evidence: 'audits.fields.evidence',
  clause_ref: 'audits.fields.clauseRef',
  owner_user_id: 'audits.fields.findingOwner',
  response_due_at: 'audits.fields.responseDue',
  root_cause: 'audits.fields.rootCause',
  correction: 'audits.fields.correction',
  corrective_action: 'audits.fields.correctiveAction',
  verification_notes: 'audits.fields.verificationNotes',
};

/** Whether the caller may write the auditee response (the finding owner, or `audits:write`). */
export function canRespond(f: FindingDetail, userId: string | null, canWrite: boolean): boolean {
  return RESPONSE_OPEN.includes(f.status) && (canWrite || (!!userId && f.owner?.id === userId));
}

/**
 * `/audits/findings/:id`: a finding with the auditee's response (root cause,
 * correction, corrective action), corrective-action tasks, linked deviations,
 * verification and closure, plus related records, activity and revisions.
 */
@Component({
  selector: 'app-audit-finding-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    RecordDetailLayout,
    WatchButton,
    AskAbout,
    ClauseChips,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    LessonView,
    EntityChip,
    SupportsRequirements,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    PromptDialog,
    AuditLoadState,
    AuditUserSelect,
    DeviationPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.value(); as f) {
      <app-record-detail-layout
        entityType="audit_finding"
        [entityId]="f.id"
        [tabs]="tabs"
        [canEdit]="access.canWrite()"
        [includeAudit]="access.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/audits/findings"
        backLabelKey="audits.findings.back"
      >
        <div header>
          <p class="text-[12.5px] font-semibold text-fg-subtle">{{ f.code }}</p>
          <div class="flex items-start gap-2">
            <h1
              class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            >
              {{ f.title }}
            </h1>
            <app-ask-about
              class="mt-1.5 flex-none"
              [prompt]="'audits.findingDetail.askAbout' | transloco: { code: f.code }"
            />
          </div>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            <app-badge [tone]="typeTone(f.finding_type)">{{
              'audits.findingType.' + f.finding_type | transloco
            }}</app-badge>
            <app-badge [tone]="statusTone(f.status)">{{
              'audits.findingStatus.' + f.status | transloco
            }}</app-badge>
            @if (f.overdue) {
              <app-badge tone="fail">{{ 'audits.common.overdue' | transloco }}</app-badge>
            }
          </div>
        </div>
        <div actions class="flex flex-wrap items-center gap-2">
          <app-watch-button entityType="audit_finding" [entityId]="f.id" />
          @for (a of f.available_actions; track a) {
            <app-button
              size="sm"
              [variant]="forward.has(a) ? 'primary' : 'secondary'"
              [disabled]="saving.busy()"
              (click)="transition(a)"
            >
              {{ 'audits.findingAction.' + a | transloco }}
            </app-button>
          }
          @if (access.canWrite() && f.status !== 'closed' && f.status !== 'cancelled') {
            <a
              [routerLink]="['/audits/findings', f.id, 'edit']"
              class="inline-flex h-8 items-center rounded-[10px] border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
            >
              {{ 'audits.common.edit' | transloco }}
            </a>
          }
          @if (access.canManage()) {
            <app-button size="sm" variant="ghost" (click)="deleting.set(true)">{{
              'audits.common.delete' | transloco
            }}</app-button>
          }
        </div>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="audits" page="findingDetail" />
          @if (f.status_reason) {
            <p
              class="rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[13px] text-fg-muted"
            >
              {{ 'audits.planDetail.statusReason' | transloco: { reason: f.status_reason } }}
            </p>
          }
          <app-card>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.description' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ f.description || '–' }}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.evidence' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ f.evidence || '–' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.audit' | transloco }}
                </dt>
                <dd>
                  <a
                    [routerLink]="['/audits/plans', f.plan.id]"
                    class="font-semibold text-accent hover:underline"
                  >
                    {{ f.plan.code }} · {{ f.plan.title }}
                  </a>
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.clauseRef' | transloco }}
                </dt>
                <dd>
                  @if (f.clause_ref) {
                    <app-clause-chips [clauses]="[f.clause_ref]" />
                  } @else {
                    –
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.findingOwner' | transloco }}
                </dt>
                <dd class="text-fg">{{ f.owner?.name || '–' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.responseDue' | transloco }}
                </dt>
                <dd [class.text-fail]="f.overdue" class="text-fg">
                  {{ (f.response_due_at | localDay) || '–' }}
                </dd>
              </div>
            </dl>
          </app-card>

          <app-card>
            <div class="mb-3 flex items-center gap-2">
              <h2 class="font-display text-[16px] font-bold text-fg">
                {{ 'audits.findingDetail.response' | transloco }}
              </h2>
              <app-ask-about
                field="root_cause"
                [prompt]="'audits.findingDetail.askRootCause' | transloco: { code: f.code }"
              />
            </div>
            @if (respondable()) {
              <div class="flex flex-col gap-3">
                <app-form-field [label]="'audits.fields.rootCause' | transloco" inputId="fd-root">
                  <textarea
                    id="fd-root"
                    rows="3"
                    [value]="rootCause()"
                    (input)="rootCause.set($any($event.target).value)"
                  ></textarea>
                  <app-field-help scope="audits" page="findingDetail" field="rootCause" />
                </app-form-field>
                <app-form-field
                  [label]="'audits.fields.correction' | transloco"
                  inputId="fd-correction"
                >
                  <textarea
                    id="fd-correction"
                    rows="2"
                    [value]="correction()"
                    (input)="correction.set($any($event.target).value)"
                  ></textarea>
                  <app-field-help scope="audits" page="findingDetail" field="correction" />
                </app-form-field>
                <app-form-field
                  [label]="'audits.fields.correctiveAction' | transloco"
                  inputId="fd-ca"
                >
                  <textarea
                    id="fd-ca"
                    rows="3"
                    [value]="correctiveAction()"
                    (input)="correctiveAction.set($any($event.target).value)"
                  ></textarea>
                  <app-field-help scope="audits" page="findingDetail" field="correctiveAction" />
                </app-form-field>
                @if (isNc()) {
                  <p class="text-[12.5px] text-fg-muted">
                    {{ 'audits.findingDetail.ncHint' | transloco }}
                  </p>
                }
                <div class="flex justify-end">
                  <app-button
                    size="sm"
                    [loading]="saving.busy()"
                    [disabled]="!responseDirty()"
                    (click)="saveResponse()"
                  >
                    {{ 'audits.findingDetail.saveResponse' | transloco }}
                  </app-button>
                </div>
              </div>
            } @else {
              <dl class="flex flex-col gap-3 text-[13.5px]">
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'audits.fields.rootCause' | transloco }}
                  </dt>
                  <dd class="whitespace-pre-line text-fg">{{ f.root_cause || '–' }}</dd>
                </div>
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'audits.fields.correction' | transloco }}
                  </dt>
                  <dd class="whitespace-pre-line text-fg">{{ f.correction || '–' }}</dd>
                </div>
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'audits.fields.correctiveAction' | transloco }}
                  </dt>
                  <dd class="whitespace-pre-line text-fg">{{ f.corrective_action || '–' }}</dd>
                </div>
              </dl>
            }
            @if (f.responded_at) {
              <p class="mt-2 text-[12px] text-fg-muted">
                {{
                  'audits.findingDetail.respondedAt'
                    | transloco: { date: (f.responded_at | localDate: 'medium') }
                }}
              </p>
            }
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'audits.findingDetail.verification' | transloco }}
            </h2>
            @if (verifiable()) {
              <app-form-field
                [label]="'audits.fields.verificationNotes' | transloco"
                inputId="fd-verify"
              >
                <textarea
                  id="fd-verify"
                  rows="3"
                  [value]="verificationNotes()"
                  (input)="verificationNotes.set($any($event.target).value)"
                ></textarea>
                <app-field-help scope="audits" page="findingDetail" field="verificationNotes" />
              </app-form-field>
              <div class="mt-2 flex justify-end">
                <app-button
                  size="sm"
                  variant="secondary"
                  [disabled]="verificationNotes() === (f.verification_notes ?? '') || saving.busy()"
                  (click)="saveVerification()"
                >
                  {{ 'audits.findingDetail.saveNotes' | transloco }}
                </app-button>
              </div>
            } @else {
              <p class="text-[13.5px] whitespace-pre-line text-fg">
                {{ f.verification_notes || '–' }}
              </p>
            }
            @if (f.verified_at) {
              <p class="mt-2 text-[12px] text-fg-muted">
                {{
                  'audits.findingDetail.verifiedBy'
                    | transloco
                      : {
                          name: f.verified_by?.name || '–',
                          date: (f.verified_at | localDate: 'medium'),
                        }
                }}
              </p>
            }
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'audits.findingDetail.actions' | transloco }}
            </h2>
            @if (f.actions.length) {
              <ul class="divide-y divide-border">
                @for (t of f.actions; track t.id) {
                  <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-[13.5px]">
                    <a
                      [routerLink]="['/tasks', t.id]"
                      class="min-w-0 flex-1 font-semibold text-fg hover:text-accent"
                      >{{ t.title }}</a
                    >
                    <span class="text-[12.5px] text-fg-muted">{{ t.assignee?.name || '–' }}</span>
                    <span
                      class="text-[12.5px]"
                      [class.text-fail]="t.overdue"
                      [class.text-fg-muted]="!t.overdue"
                      >{{ t.due_at | localDay }}</span
                    >
                    <app-badge
                      [tone]="
                        t.status === 'done' ? 'pass' : t.status === 'cancelled' ? 'neutral' : 'info'
                      "
                    >
                      {{ 'audits.taskStatus.' + t.status | transloco }}
                    </app-badge>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-[13px] text-fg-muted">
                {{ 'audits.findingDetail.noActions' | transloco }}
              </p>
            }
            @if (canAddAction()) {
              <form
                class="mt-3 grid grid-cols-1 gap-3 rounded-[10px] border border-border bg-surface-2 p-3 sm:grid-cols-2"
                (submit)="$event.preventDefault(); addAction()"
              >
                <app-form-field
                  class="sm:col-span-2"
                  [label]="'audits.findingDetail.actionTitle' | transloco"
                  inputId="fa-title"
                >
                  <input
                    id="fa-title"
                    maxlength="255"
                    [value]="actionTitle()"
                    (input)="actionTitle.set($any($event.target).value)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'audits.findingDetail.actionAssignee' | transloco"
                  inputId="fa-assignee"
                >
                  <app-audit-user-select
                    inputId="fa-assignee"
                    [value]="actionAssignee()"
                    (valueChange)="actionAssignee.set($event)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'audits.findingDetail.actionDue' | transloco"
                  inputId="fa-due"
                >
                  <input
                    id="fa-due"
                    type="date"
                    [value]="actionDue()"
                    (input)="actionDue.set($any($event.target).value)"
                  />
                </app-form-field>
                <div class="flex justify-end sm:col-span-2">
                  <app-button
                    type="submit"
                    size="sm"
                    [disabled]="!actionTitle().trim() || saving.busy()"
                  >
                    {{ 'audits.findingDetail.addAction' | transloco }}
                  </app-button>
                </div>
              </form>
            }
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'audits.findingDetail.deviations' | transloco }}
            </h2>
            @if (f.deviations.length) {
              <div class="flex flex-wrap gap-2">
                @for (d of f.deviations; track d.entity_id) {
                  <app-entity-chip [ref]="d" />
                }
              </div>
            } @else {
              <p class="text-[13px] text-fg-muted">
                {{ 'audits.findingDetail.noDeviations' | transloco }}
              </p>
            }
            @if (canLinkDeviation()) {
              <div class="mt-3">
                <app-audit-deviation-picker
                  [excluded]="deviationIds()"
                  (picked)="linkDeviation($event)"
                />
              </div>
            }
          </app-card>

          <app-card>
            <app-supports-requirements entityType="audit_finding" [entityId]="f.id" />
          </app-card>
        </div>
        <div aside class="flex flex-col gap-4">
          <app-why-it-matters scope="audits" page="findingDetail" />
          <app-lesson scope="audits" lesson="findings-and-capa" />
        </div>
      </app-record-detail-layout>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-audit-load-state [state]="data.state()" (retry)="load()" />
      </div>
    }

    <app-prompt-dialog
      [open]="!!pending()"
      [title]="'audits.findingAction.' + (pending() ?? 'cancel') | transloco"
      [message]="'audits.common.reasonMessage' | transloco"
      [label]="'audits.common.reason' | transloco"
      [required]="true"
      [busy]="saving.busy()"
      [confirmLabel]="'audits.findingAction.' + (pending() ?? 'cancel') | transloco"
      [cancelLabel]="'audits.common.cancel' | transloco"
      (confirmed)="run(pending()!, $event)"
      (cancelled)="pending.set(null)"
    />
    <app-confirm-dialog
      [open]="deleting()"
      [title]="'audits.findingDetail.deleteTitle' | transloco"
      [message]="'audits.findingDetail.deleteMessage' | transloco"
      [confirmLabel]="'audits.common.delete' | transloco"
      [cancelLabel]="'audits.common.cancel' | transloco"
      [busy]="saving.busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(false)"
    />
  `,
})
export class FindingDetailPage {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  protected readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly forward = FORWARD;
  protected readonly fieldLabels = FINDING_FIELD_LABELS;
  protected readonly typeTone = findingTypeTone;
  protected readonly statusTone = findingStatusTone;
  protected readonly data = loadable<FindingDetail>();
  protected readonly saving = mutator();
  protected readonly pending = signal<FindingAction | null>(null);
  protected readonly deleting = signal(false);

  protected readonly rootCause = linkedSignal(() => this.data.value()?.root_cause ?? '');
  protected readonly correction = linkedSignal(() => this.data.value()?.correction ?? '');
  protected readonly correctiveAction = linkedSignal(
    () => this.data.value()?.corrective_action ?? '',
  );
  protected readonly verificationNotes = linkedSignal(
    () => this.data.value()?.verification_notes ?? '',
  );
  protected readonly actionTitle = signal('');
  protected readonly actionAssignee = signal('');
  protected readonly actionDue = signal('');

  protected readonly isNc = computed(() =>
    NC_TYPES.includes(this.data.value()?.finding_type ?? 'ofi'),
  );
  protected readonly respondable = computed(() => {
    const f = this.data.value();
    return !!f && canRespond(f, this.access.userId(), this.access.canWrite());
  });
  protected readonly verifiable = computed(
    () => this.access.canWrite() && this.data.value()?.status === 'pending_verification',
  );
  protected readonly canAddAction = computed(() => {
    const f = this.data.value();
    if (!f || f.status === 'closed' || f.status === 'cancelled') {
      return false;
    }
    return (
      this.access.canWrite() || (!!this.access.userId() && f.owner?.id === this.access.userId())
    );
  });
  protected readonly canLinkDeviation = computed(
    () => this.access.canWrite() && this.access.canReadDeviations(),
  );
  protected readonly deviationIds = computed(() =>
    (this.data.value()?.deviations ?? []).map((d) => d.entity_id),
  );
  protected readonly responseDirty = computed(() => {
    const f = this.data.value();
    return (
      !!f &&
      (this.rootCause() !== (f.root_cause ?? '') ||
        this.correction() !== (f.correction ?? '') ||
        this.correctiveAction() !== (f.corrective_action ?? ''))
    );
  });

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_finding',
      entityId: this.id(),
      view: 'detail',
      title: this.data.value()?.title ?? null,
    }));
    effect(() => {
      this.access.orgId();
      this.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const orgId = this.access.orgId();
    if (orgId) {
      this.data.load(this.api.getFinding(orgId, this.id()), true);
    }
  }

  private update(body: Parameters<AuditsApi['updateFinding']>[2], success: string): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(this.api.updateFinding(orgId, this.id(), body), {
      success,
      next: (f) => this.data.set(f),
    });
  }

  protected saveResponse(): void {
    this.update(
      {
        root_cause: textOrNull(this.rootCause()),
        correction: textOrNull(this.correction()),
        corrective_action: textOrNull(this.correctiveAction()),
      },
      'audits.notices.responseSaved',
    );
  }

  protected saveVerification(): void {
    this.update(
      { verification_notes: textOrNull(this.verificationNotes()) },
      'audits.notices.saved',
    );
  }

  protected transition(action: FindingAction): void {
    if (REASON_REQUIRED.has(`finding:${action}`)) {
      this.pending.set(action);
    } else {
      this.run(action, null);
    }
  }

  protected run(action: FindingAction, reason: string | null): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(this.api.transitionFinding(orgId, this.id(), action, reason), {
      success: 'audits.notices.findingTransitioned',
      next: (f) => {
        this.pending.set(null);
        this.data.set(f);
      },
      error: () => {
        this.pending.set(null);
      },
    });
  }

  protected addAction(): void {
    const orgId = this.access.orgId();
    const title = this.actionTitle().trim();
    if (!orgId || !title) {
      return;
    }
    this.saving.run(
      this.api.createFindingAction(orgId, this.id(), {
        title,
        assignee_user_id: this.actionAssignee() || null,
        due_at: fromDateInput(this.actionDue()),
      }),
      {
        success: 'audits.notices.actionCreated',
        next: (f) => {
          this.actionTitle.set('');
          this.actionAssignee.set('');
          this.actionDue.set('');
          this.data.set(f);
        },
      },
    );
  }

  protected linkDeviation(deviationId: string): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(this.api.linkDeviation(orgId, this.id(), deviationId), {
      success: 'audits.notices.deviationLinked',
      next: (f) => this.data.set(f),
    });
  }

  protected remove(): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(this.api.deleteFinding(orgId, this.id()), {
      success: 'audits.notices.findingDeleted',
      next: () => void this.router.navigate(['/audits/findings']),
      error: () => {
        this.deleting.set(false);
      },
    });
  }
}
