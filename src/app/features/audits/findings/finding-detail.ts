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
import { LanguageService } from '../../../core/i18n/language.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import {
  findingStatusBadge,
  findingTypeBadge,
  fromDateInput,
  textOrNull,
} from '../data/audit-display';
import {
  EFFECTIVENESS_RESULTS,
  Effectiveness,
  EntityRef,
  FindingAction,
  FindingDetail,
  NC_TYPES,
  REASON_REQUIRED,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditField } from '../shared/audit-field';
import { AuditsNav } from '../shared/audits-nav';
import { AuditClauseRefs } from '../shared/clause-refs';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditRecordPicker } from '../shared/record-picker';
import { AuditUserSelect } from '../shared/user-select';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];
/** The actions that move a finding forward, in order; the first available is the primary button. */
export const FINDING_FORWARD: readonly FindingAction[] = ['start', 'submit', 'verify', 'close'];
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
  decision: 'audits.fields.decision',
  verification_notes: 'audits.fields.verificationNotes',
  effectiveness: 'audits.fields.effectiveness',
};

/** Whether the caller may write the auditee response (the finding owner, or `audits:write`). */
export function canRespond(f: FindingDetail, userId: string | null, canWrite: boolean): boolean {
  return RESPONSE_OPEN.includes(f.status) && (canWrite || (!!userId && f.owner?.id === userId));
}

/** Nonconformities need root cause, correction and verification; the others only a decision. */
export function isNonconformity(
  f: Pick<FindingDetail, 'finding_type' | 'is_nonconformity'>,
): boolean {
  return f.is_nonconformity ?? NC_TYPES.includes(f.finding_type);
}

/** The one next step of a finding (primary button) and the rest (the "Mer" menu). */
export function splitFindingActions(actions: readonly FindingAction[]): {
  readonly primary: FindingAction | null;
  readonly rest: readonly FindingAction[];
} {
  const primary = FINDING_FORWARD.find((a) => actions.includes(a)) ?? null;
  return { primary, rest: actions.filter((a) => a !== primary) };
}

/**
 * `/audits/findings/:id`: a finding and what is done about it. A nonconformity
 * gets the auditee's response (root cause, correction, a summary of the corrective
 * action), corrective-action tasks or the deviation that holds them, verification
 * by the auditor and, after closure, the effectiveness check. An observation or
 * improvement suggestion only needs a decision. "Lag ny fra denne" in the header
 * creates a deviation or risk from the finding (linked both ways).
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
    AiAssistButton,
    AskAbout,
    WhyItMatters,
    EntityChip,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    MenuItem,
    PromptDialog,
    StatusBadge,
    AuditField,
    AuditsNav,
    AuditClauseRefs,
    AuditLoadState,
    AuditRecordPicker,
    AuditUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.value(); as f) {
      @let tb = typeBadge(f.finding_type);
      @let sb = statusBadge(f.status);
      @let acts = actions();
      <app-record-detail-layout
        entityType="audit_finding"
        [entityId]="f.id"
        [title]="f.title"
        [breadcrumbs]="[
          { labelKey: 'modules.names.audits', link: '/audits' },
          { labelKey: 'audits.findings.title', link: '/audits/findings' },
          { label: f.code },
        ]"
        [tabs]="tabs"
        [requirementsPanel]="true"
        [canEdit]="access.canWrite()"
        [includeAudit]="access.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/audits/findings"
        backLabelKey="audits.findings.back"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="finding-code">{{ f.code }}</span>
          <app-status-badge [meaning]="tb.meaning" [value]="tb.value" [labelKey]="tb.labelKey" />
          <app-status-badge [meaning]="sb.meaning" [value]="sb.value" [labelKey]="sb.labelKey" />
          @if (f.overdue) {
            <app-badge tone="warn">{{ 'common.status.overdue' | transloco }}</app-badge>
          }
          <app-ask-about
            [prompt]="'audits.findingDetail.askAbout' | transloco: { code: f.code }"
            [requirements]="f.clause_ref ? [f.clause_ref] : null"
          />
          <app-watch-button entityType="audit_finding" [entityId]="f.id" />
        </ng-container>

        @if (acts.primary; as a) {
          <app-button primary size="sm" [disabled]="saving.busy()" (click)="transition(a)">
            {{ 'audits.findingAction.' + a | transloco }}
          </app-button>
        }
        @if (access.canWrite() && f.status !== 'closed' && f.status !== 'cancelled') {
          <a
            secondary
            [routerLink]="['/audits/findings', f.id, 'edit']"
            class="inline-flex h-8 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {{ 'audits.common.edit' | transloco }}
          </a>
        }
        @for (a of acts.rest; track a) {
          <button appMenuItem overflow [disabled]="saving.busy()" (click)="transition(a)">
            {{ 'audits.findingAction.' + a | transloco }}
          </button>
        }
        @if (access.canManage()) {
          <button appMenuItem overflow [danger]="true" (click)="deleting.set(true)">
            {{ 'audits.common.delete' | transloco }}
          </button>
        }

        <app-audits-nav nav />
        <app-help-strip help scope="audits" page="findingDetail" lesson="findings-and-capa" />

        <div class="flex flex-col gap-5">
          @if (f.status_reason) {
            <app-alert tone="info">
              {{ 'audits.planDetail.statusReason' | transloco: { reason: f.status_reason } }}
            </app-alert>
          }

          <app-card data-testid="finding-next-step">
            <p class="text-meta font-semibold tracking-wide text-fg-subtle uppercase">
              {{ 'audits.planDetail.nowTitle' | transloco }}
            </p>
            <p class="mt-1 text-body text-fg">{{ nextStepKey() | transloco }}</p>
          </app-card>

          <app-card>
            <h2 class="mb-4 font-display text-section font-bold text-fg">
              {{ 'audits.findingDetail.about' | transloco }}
            </h2>
            <app-field-list>
              <app-field-item
                labelKey="audits.fields.description"
                [value]="f.description"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item
                labelKey="audits.fields.evidence"
                [value]="f.evidence"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item labelKey="audits.fields.audit">
                <a
                  [routerLink]="['/audits/plans', f.plan.id]"
                  class="font-semibold text-accent hover:underline"
                >
                  <span class="font-mono text-meta">{{ f.plan.code }}</span> {{ f.plan.title }}
                </a>
              </app-field-item>
              <app-field-item labelKey="audits.fields.clauseRef" empty="notSet">
                @if (f.clause_ref) {
                  <app-audit-clause-refs [refs]="[f.clause_ref]" [suggested]="nc()" />
                  @if (nc()) {
                    <p class="mt-1 text-meta text-fg-muted">
                      {{ 'audits.findingDetail.clauseWeak' | transloco }}
                    </p>
                  }
                }
              </app-field-item>
              <app-field-item labelKey="audits.fields.findingOwner" [value]="f.owner?.name" />
              <app-field-item labelKey="audits.fields.department" [value]="f.department_name" />
              <app-field-item labelKey="audits.fields.responseDue">
                @if (f.response_due_at) {
                  <span [class]="f.overdue ? 'font-semibold text-warn-ink' : ''">
                    {{ f.response_due_at | localDay }}
                    @if (f.overdue) {
                      · {{ 'common.status.overdue' | transloco }}
                    }
                  </span>
                }
              </app-field-item>
              @if (f.plan.lead_auditor?.name) {
                <app-field-item
                  labelKey="audits.fields.leadAuditor"
                  [value]="f.plan.lead_auditor?.name"
                />
              }
            </app-field-list>
          </app-card>

          <app-card data-testid="finding-response">
            <div class="mb-1 flex items-center gap-2">
              <h2 class="font-display text-section font-bold text-fg">
                {{
                  (nc() ? 'audits.findingDetail.response' : 'audits.findingDetail.decisionTitle')
                    | transloco
                }}
              </h2>
              <app-ask-about
                [field]="nc() ? 'root_cause' : 'decision'"
                [fieldLabel]="
                  (nc() ? 'audits.fields.rootCause' : 'audits.fields.decision') | transloco
                "
                [prompt]="
                  (nc() ? 'audits.findingDetail.askRootCause' : 'audits.findingDetail.askDecision')
                    | transloco: { code: f.code }
                "
              />
            </div>
            <p class="mb-4 text-meta text-fg-muted">
              {{
                (nc() ? 'audits.findingDetail.responseHint' : 'audits.findingDetail.decisionHint')
                  | transloco
              }}
            </p>
            @if (respondable()) {
              <div class="flex flex-col gap-4">
                @if (nc()) {
                  <app-audit-field
                    inputId="fd-root"
                    labelKey="audits.fields.rootCause"
                    helpPage="findingDetail"
                    helpField="rootCause"
                  >
                    <app-ai-assist-button
                      ask
                      assist="audits.suggest_root_cause"
                      labelKey="audits.ai.suggestRootCause"
                      variant="ghost"
                      entityType="audit_finding"
                      [entityId]="f.id"
                      [input]="{ finding_id: f.id }"
                      (result)="applyRootCause($event)"
                    />
                    <textarea
                      id="fd-root"
                      rows="3"
                      [value]="rootCause()"
                      (input)="rootCause.set($any($event.target).value)"
                    ></textarea>
                  </app-audit-field>
                  <app-audit-field
                    inputId="fd-correction"
                    labelKey="audits.fields.correction"
                    helpPage="findingDetail"
                    helpField="correction"
                  >
                    <textarea
                      id="fd-correction"
                      rows="2"
                      [value]="correction()"
                      (input)="correction.set($any($event.target).value)"
                    ></textarea>
                  </app-audit-field>
                  <app-audit-field
                    inputId="fd-ca"
                    labelKey="audits.fields.correctiveAction"
                    helpPage="findingDetail"
                    helpField="correctiveAction"
                  >
                    <textarea
                      id="fd-ca"
                      rows="3"
                      [value]="correctiveAction()"
                      (input)="correctiveAction.set($any($event.target).value)"
                    ></textarea>
                    <span hint>{{ 'audits.findingDetail.correctiveHint' | transloco }}</span>
                  </app-audit-field>
                } @else {
                  <app-audit-field
                    inputId="fd-decision"
                    labelKey="audits.fields.decision"
                    helpPage="findingDetail"
                    helpField="decision"
                  >
                    <textarea
                      id="fd-decision"
                      rows="4"
                      [value]="decision()"
                      (input)="decision.set($any($event.target).value)"
                    ></textarea>
                  </app-audit-field>
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
              <app-field-list [columns]="1">
                @if (nc()) {
                  <app-field-item
                    labelKey="audits.fields.rootCause"
                    [value]="f.root_cause"
                    [multiline]="true"
                  />
                  <app-field-item
                    labelKey="audits.fields.correction"
                    [value]="f.correction"
                    [multiline]="true"
                  />
                  <app-field-item
                    labelKey="audits.fields.correctiveAction"
                    [value]="f.corrective_action"
                    [multiline]="true"
                  />
                } @else {
                  <app-field-item
                    labelKey="audits.fields.decision"
                    [value]="f.decision ?? f.corrective_action"
                    [multiline]="true"
                  />
                }
              </app-field-list>
            }
            @if (f.responded_at) {
              <p class="mt-3 text-meta text-fg-muted">
                {{
                  'audits.findingDetail.respondedAt'
                    | transloco: { date: (f.responded_at | localDate) }
                }}
              </p>
            }
          </app-card>

          @if (nc()) {
            <app-card data-testid="finding-verification">
              <h2 class="mb-1 font-display text-section font-bold text-fg">
                {{ 'audits.findingDetail.verification' | transloco }}
              </h2>
              <p class="mb-4 text-meta text-fg-muted">
                {{ 'audits.findingDetail.verificationHint' | transloco }}
              </p>
              @if (verifiable()) {
                <app-audit-field
                  inputId="fd-verify"
                  labelKey="audits.fields.verificationNotes"
                  helpPage="findingDetail"
                  helpField="verificationNotes"
                >
                  <textarea
                    id="fd-verify"
                    rows="3"
                    [value]="verificationNotes()"
                    (input)="verificationNotes.set($any($event.target).value)"
                  ></textarea>
                </app-audit-field>
                <div class="mt-2 flex justify-end">
                  <app-button
                    size="sm"
                    variant="secondary"
                    [disabled]="
                      verificationNotes() === (f.verification_notes ?? '') || saving.busy()
                    "
                    (click)="saveVerification()"
                  >
                    {{ 'audits.findingDetail.saveNotes' | transloco }}
                  </app-button>
                </div>
              } @else {
                <app-field-list [columns]="1">
                  <app-field-item
                    labelKey="audits.fields.verificationNotes"
                    [value]="f.verification_notes"
                    [multiline]="true"
                  />
                </app-field-list>
              }
              @if (f.verified_at) {
                <p class="mt-2 text-meta text-fg-muted">
                  {{
                    'audits.findingDetail.verifiedBy'
                      | transloco
                        : {
                            name: f.verified_by?.name || ('audits.common.someone' | transloco),
                            date: (f.verified_at | localDate),
                          }
                  }}
                </p>
              }

              @if (f.status === 'closed') {
                <div class="mt-4 border-t border-border pt-4" data-testid="finding-effectiveness">
                  <h3 class="text-card font-bold text-fg">
                    {{ 'audits.findingDetail.effectiveness' | transloco }}
                  </h3>
                  <p class="mt-0.5 mb-3 text-meta text-fg-muted">
                    {{ 'audits.findingDetail.effectivenessHint' | transloco }}
                  </p>
                  @if (access.canWrite()) {
                    <div
                      class="flex flex-wrap gap-2"
                      role="group"
                      [attr.aria-label]="'audits.fields.effectiveness' | transloco"
                    >
                      @for (e of effectivenessResults; track e) {
                        <app-button
                          size="sm"
                          [variant]="f.effectiveness === e ? 'primary' : 'secondary'"
                          [attr.aria-pressed]="f.effectiveness === e"
                          [disabled]="saving.busy()"
                          (click)="setEffectiveness(e)"
                        >
                          {{ 'audits.effectiveness.' + e | transloco }}
                        </app-button>
                      }
                    </div>
                  } @else {
                    <p class="text-body text-fg">
                      {{
                        f.effectiveness
                          ? ('audits.effectiveness.' + f.effectiveness | transloco)
                          : ('common.empty.notSet' | transloco)
                      }}
                    </p>
                  }
                  @if (f.effectiveness_checked_at) {
                    <p class="mt-2 text-meta text-fg-muted">
                      {{
                        'audits.findingDetail.checkedBy'
                          | transloco
                            : {
                                name:
                                  f.effectiveness_checked_by?.name ||
                                  ('audits.common.someone' | transloco),
                                date: (f.effectiveness_checked_at | localDate),
                              }
                      }}
                    </p>
                  }
                </div>
              }
            </app-card>

            <app-card data-testid="finding-actions">
              <h2 class="mb-1 font-display text-section font-bold text-fg">
                {{ 'audits.findingDetail.actions' | transloco }}
              </h2>
              <p class="mb-3 text-meta text-fg-muted">
                {{
                  (f.deviations.length
                    ? 'audits.findingDetail.actionsInDeviation'
                    : 'audits.findingDetail.actionsHint'
                  ) | transloco
                }}
              </p>
              @if (f.actions.length) {
                <ul class="divide-y divide-border">
                  @for (t of f.actions; track t.id) {
                    <li class="flex flex-wrap items-center gap-2 py-2 text-body">
                      <a
                        [routerLink]="['/tasks', t.id]"
                        class="min-w-0 flex-1 basis-[200px] font-semibold text-fg hover:text-accent"
                        >{{ t.title }}</a
                      >
                      <span class="text-meta text-fg-muted">{{
                        t.assignee?.name || ('common.empty.notSet' | transloco)
                      }}</span>
                      @if (t.due_at) {
                        <span
                          class="text-meta"
                          [class]="t.overdue ? 'font-semibold text-warn-ink' : 'text-fg-muted'"
                          >{{ t.due_at | localDay }}</span
                        >
                      }
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="t.status"
                        [labelKey]="'audits.taskStatus.' + t.status"
                      />
                    </li>
                  }
                </ul>
              } @else if (!f.deviations.length) {
                <p class="text-body text-fg-muted">
                  {{ 'audits.findingDetail.noActions' | transloco }}
                </p>
              }
              @if (canAddAction() && !f.deviations.length) {
                @if (!addingAction()) {
                  <app-button
                    class="mt-3 inline-block"
                    variant="secondary"
                    size="sm"
                    (click)="addingAction.set(true)"
                  >
                    <app-icon name="plus" [size]="13" />
                    {{ 'audits.findingDetail.addAction' | transloco }}
                  </app-button>
                } @else {
                  <form
                    class="mt-3 grid grid-cols-1 gap-3 rounded-tile border border-border bg-surface-2 p-3 sm:grid-cols-2"
                    (submit)="$event.preventDefault(); addAction()"
                  >
                    <app-audit-field
                      class="sm:col-span-2"
                      inputId="fa-title"
                      labelKey="audits.findingDetail.actionTitle"
                      [required]="true"
                    >
                      <input
                        id="fa-title"
                        maxlength="255"
                        [value]="actionTitle()"
                        (input)="actionTitle.set($any($event.target).value)"
                      />
                    </app-audit-field>
                    <app-audit-field
                      inputId="fa-assignee"
                      labelKey="audits.findingDetail.actionAssignee"
                    >
                      <app-audit-user-select
                        inputId="fa-assignee"
                        [value]="actionAssignee()"
                        (valueChange)="actionAssignee.set($event)"
                      />
                    </app-audit-field>
                    <app-audit-field inputId="fa-due" labelKey="audits.findingDetail.actionDue">
                      <input
                        id="fa-due"
                        type="date"
                        [attr.lang]="lang()"
                        [value]="actionDue()"
                        (input)="actionDue.set($any($event.target).value)"
                      />
                    </app-audit-field>
                    <div class="flex justify-end gap-2 sm:col-span-2">
                      <app-button variant="secondary" size="sm" (click)="addingAction.set(false)">
                        {{ 'audits.common.cancel' | transloco }}
                      </app-button>
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
              }
            </app-card>
          }

          <app-card data-testid="finding-deviations">
            <h2 class="mb-1 font-display text-section font-bold text-fg">
              {{ 'audits.findingDetail.deviations' | transloco }}
            </h2>
            <p class="mb-3 text-meta text-fg-muted">
              {{ 'audits.findingDetail.deviationsHint' | transloco }}
            </p>
            @if (f.deviations.length) {
              <div class="flex flex-wrap gap-2">
                @for (d of f.deviations; track d.entity_id) {
                  <app-entity-chip [ref]="d" [statusText]="true" />
                }
              </div>
            } @else {
              <p class="text-body text-fg-muted">
                {{ 'audits.findingDetail.noDeviations' | transloco }}
              </p>
            }
            @if (canLinkDeviation()) {
              <div class="mt-3">
                <app-audit-record-picker
                  [types]="['deviation']"
                  [excluded]="deviationIds()"
                  placeholderKey="audits.findingDetail.searchDeviation"
                  (picked)="linkDeviation($event)"
                />
              </div>
            }
          </app-card>
        </div>

        <div aside-learn>
          <app-why-it-matters scope="audits" page="findingDetail" />
        </div>
      </app-record-detail-layout>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-audit-load-state [state]="data.state()" [rows]="6" (retry)="load()" />
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
  private readonly language = inject(LanguageService);
  protected readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = FINDING_FIELD_LABELS;
  protected readonly effectivenessResults = EFFECTIVENESS_RESULTS;
  protected readonly typeBadge = findingTypeBadge;
  protected readonly statusBadge = findingStatusBadge;
  protected readonly lang = this.language.active;
  protected readonly data = loadable<FindingDetail>();
  protected readonly saving = mutator();
  protected readonly pending = signal<FindingAction | null>(null);
  protected readonly deleting = signal(false);
  protected readonly addingAction = signal(false);

  protected readonly rootCause = linkedSignal(() => this.data.value()?.root_cause ?? '');
  protected readonly correction = linkedSignal(() => this.data.value()?.correction ?? '');
  protected readonly correctiveAction = linkedSignal(
    () => this.data.value()?.corrective_action ?? '',
  );
  protected readonly decision = linkedSignal(
    () => this.data.value()?.decision ?? this.data.value()?.corrective_action ?? '',
  );
  protected readonly verificationNotes = linkedSignal(
    () => this.data.value()?.verification_notes ?? '',
  );
  protected readonly actionTitle = signal('');
  protected readonly actionAssignee = signal('');
  protected readonly actionDue = signal('');

  protected readonly nc = computed(() => {
    const f = this.data.value();
    return !!f && isNonconformity(f);
  });
  protected readonly actions = computed(() =>
    splitFindingActions(this.data.value()?.available_actions ?? []),
  );
  protected readonly nextStepKey = computed(() => {
    const f = this.data.value();
    if (!f) {
      return '';
    }
    return `audits.findingDetail.next.${this.nc() ? 'nc' : 'other'}.${f.status}`;
  });
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
    () =>
      this.access.canWrite() &&
      this.access.canReadDeviations() &&
      this.data.value()?.status !== 'cancelled',
  );
  protected readonly deviationIds = computed(() =>
    (this.data.value()?.deviations ?? []).map((d) => d.entity_id),
  );
  protected readonly responseDirty = computed(() => {
    const f = this.data.value();
    if (!f) {
      return false;
    }
    if (!this.nc()) {
      return this.decision() !== (f.decision ?? f.corrective_action ?? '');
    }
    return (
      this.rootCause() !== (f.root_cause ?? '') ||
      this.correction() !== (f.correction ?? '') ||
      this.correctiveAction() !== (f.corrective_action ?? '')
    );
  });

  constructor() {
    providePageContext(() => {
      const f = this.data.value();
      return {
        module: 'audits',
        entityType: 'audit_finding',
        entityId: this.id(),
        view: 'detail',
        title: f?.title ?? null,
        requirements: f?.clause_ref ? [f.clause_ref] : [],
      };
    });
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
    if (!this.nc()) {
      this.update({ decision: textOrNull(this.decision()) }, 'audits.notices.responseSaved');
      return;
    }
    this.update(
      {
        root_cause: textOrNull(this.rootCause()),
        correction: textOrNull(this.correction()),
        corrective_action: textOrNull(this.correctiveAction()),
      },
      'audits.notices.responseSaved',
    );
  }

  /** Take the first suggested cause into empty fields (the user still edits and saves). */
  protected applyRootCause(data: unknown): void {
    const causes = (data as { causes?: unknown } | null)?.causes;
    const first = Array.isArray(causes) ? (causes[0] as Record<string, unknown> | undefined) : null;
    if (!first) {
      return;
    }
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const why = Array.isArray(first['why_chain'])
      ? (first['why_chain'] as unknown[]).map(text).filter(Boolean)
      : [];
    const cause = [text(first['cause']), ...why.map((w, i) => `${i + 1}. ${w}`)]
      .filter(Boolean)
      .join('\n');
    if (!this.rootCause().trim() && cause) {
      this.rootCause.set(cause);
    }
    if (!this.correction().trim() && text(first['correction'])) {
      this.correction.set(text(first['correction']));
    }
    if (!this.correctiveAction().trim() && text(first['corrective_action'])) {
      this.correctiveAction.set(text(first['corrective_action']));
    }
  }

  protected saveVerification(): void {
    this.update(
      { verification_notes: textOrNull(this.verificationNotes()) },
      'audits.notices.saved',
    );
  }

  protected setEffectiveness(value: Effectiveness): void {
    this.update({ effectiveness: value }, 'audits.notices.effectivenessSaved');
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
          this.addingAction.set(false);
          this.data.set(f);
        },
      },
    );
  }

  protected linkDeviation(ref: EntityRef): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(this.api.linkDeviation(orgId, this.id(), ref.entity_id), {
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
