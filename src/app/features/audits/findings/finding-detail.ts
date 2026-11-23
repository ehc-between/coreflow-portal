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
import { EntityTypesService } from '../../../core/kit/entity-types.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
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
  planStatusBadge,
  textOrNull,
} from '../data/audit-display';
import {
  EFFECTIVENESS_RESULTS,
  Effectiveness,
  EntityRef,
  FindingAction,
  FindingDetail,
  FindingStatus,
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
import { AuditRecordLink, RecordLinkStatus } from '../shared/record-link';
import { AuditRecordPicker } from '../shared/record-picker';
import { showSection } from '../shared/show-section';
import { AuditUserSelect } from '../shared/user-select';
import { DateInput } from '../../../shared/ui/date-input/date-input';

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

/** Section ids on the finding page that "Oppfølging" lines point at. */
export const FINDING_SECTIONS = {
  response: 'finding-response',
  verification: 'finding-verification',
  actions: 'finding-actions',
} as const;

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

/** Tone of the status sentence: open work is a to-do (amber), never red. */
export function findingStatusTone(status: FindingStatus): StatusLineTone {
  switch (status) {
    case 'closed':
      return 'pass';
    case 'cancelled':
      return 'neutral';
    case 'pending_verification':
      return 'info';
    default:
      return 'warn';
  }
}

/** What a finding still needs ("Oppfølging", docs/ux-guide.md §2.7). */
export function findingMissing(
  f: FindingDetail,
  opts: {
    readonly canEdit: boolean;
    readonly respondable: boolean;
    readonly verifiable: boolean;
    readonly canAddAction: boolean;
    readonly canCheckEffect: boolean;
    readonly editLink: readonly unknown[];
    readonly show: (section: string) => void;
  },
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  const nc = isNonconformity(f);
  const show = (key: string, labelKey: string, section: string) =>
    items.push({ key, labelKey, action: () => opts.show(section) });
  if (opts.canEdit && !f.description?.trim()) {
    items.push({
      key: 'description',
      labelKey: 'audits.findingDetail.missing.description',
      link: opts.editLink,
    });
  }
  if (opts.canEdit && !f.owner) {
    items.push({
      key: 'owner',
      labelKey: 'audits.findingDetail.missing.owner',
      link: opts.editLink,
    });
  }
  if (opts.canEdit && nc && !f.response_due_at && RESPONSE_OPEN.includes(f.status)) {
    items.push({ key: 'due', labelKey: 'audits.findingDetail.missing.due', link: opts.editLink });
  }
  if (opts.respondable) {
    const answered = nc ? !!f.root_cause?.trim() : !!(f.decision ?? f.corrective_action)?.trim();
    if (!answered) {
      show(
        'response',
        nc ? 'audits.findingDetail.missing.response' : 'audits.findingDetail.missing.decision',
        FINDING_SECTIONS.response,
      );
    }
  }
  if (nc && opts.canAddAction && !f.actions.length && !f.deviations.length) {
    show('actions', 'audits.findingDetail.missing.actions', FINDING_SECTIONS.actions);
  }
  if (nc && opts.verifiable) {
    show('verify', 'audits.findingDetail.missing.verify', FINDING_SECTIONS.verification);
  }
  if (nc && opts.canCheckEffect && f.status === 'closed' && !f.effectiveness) {
    show('effect', 'audits.findingDetail.missing.effectiveness', FINDING_SECTIONS.verification);
  }
  return items;
}

/**
 * `/audits/findings/:id`: a finding and what is done about it, on the
 * detail-page anatomy (docs/ux-guide.md §2.7). "Hovedinformasjon": where the
 * finding stands, what was found, the evidence and the requirement. Below: the
 * auditee's response (root cause, correction, a summary of the corrective
 * action; a decision for an observation or improvement suggestion), the
 * auditor's verification and, after closure, the effectiveness check, and the
 * corrective-action tasks. The "Oppfølging" card names what is missing, the
 * audit the finding belongs to and the deviations that follow it up. "Lag ny
 * fra denne" in "Mer" creates a deviation or risk from the finding (linked both
 * ways).
 */
@Component({
  selector: 'app-audit-finding-detail',
  imports: [
    DateInput,
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalDatePipe,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    AiAssistButton,
    WhyItMatters,
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
    AuditRecordLink,
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
        [anatomy]="true"
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
        [missing]="missing()"
        backLink="/audits/findings"
        backLabelKey="audits.findings.back"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono" data-testid="finding-code">{{ f.code }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge [meaning]="tb.meaning" [value]="tb.value" [labelKey]="tb.labelKey" />
          <span aria-hidden="true">·</span>
          <app-status-badge [meaning]="sb.meaning" [value]="sb.value" [labelKey]="sb.labelKey" />
          @if (f.overdue) {
            <app-badge tone="warn">{{ 'common.status.overdue' | transloco }}</app-badge>
          }
        </ng-container>

        @if (acts.primary; as a) {
          <app-button primary [disabled]="saving.busy()" (click)="transition(a)">
            {{ 'audits.findingAction.' + a | transloco }}
          </app-button>
        } @else if (canEdit()) {
          <app-button primary (click)="edit()">{{ 'audits.common.edit' | transloco }}</app-button>
        }
        @if (acts.primary && canEdit()) {
          <a
            secondary
            [routerLink]="editLink()"
            class="inline-flex h-9 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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

        <button appMenuItem ask type="button" (click)="askAi('explain')">
          <app-icon name="spark" [size]="15" />
          {{ 'audits.detail.ask.finding' | transloco }}
        </button>
        <button appMenuItem ask type="button" (click)="askAi('response')">
          <app-icon name="spark" [size]="15" />
          {{ (nc() ? 'audits.detail.ask.rootCause' : 'audits.detail.ask.decision') | transloco }}
        </button>

        <app-audits-nav nav />
        <app-help-strip help scope="audits" page="findingDetail" lesson="findings-and-capa" />

        <app-record-lead record-lead [fillLink]="canEdit() ? editLink() : null">
          <app-record-status-line status [tone]="statusTone()">
            {{ nextStepKey() | transloco }}
            @if (f.status_reason) {
              <span class="mt-0.5 block font-normal">
                {{ 'audits.planDetail.statusReason' | transloco: { reason: f.status_reason } }}
              </span>
            }
          </app-record-status-line>
          <app-field-item
            size="lead"
            [wide]="true"
            labelKey="audits.findingDetail.lead.what"
            [value]="f.description"
            [multiline]="true"
          />
          <app-field-item
            size="lead"
            labelKey="audits.findingDetail.lead.evidence"
            [value]="f.evidence"
            [multiline]="true"
          />
          <app-field-item
            size="lead"
            [labelKey]="
              nc()
                ? 'audits.findingDetail.lead.requirementNc'
                : 'audits.findingDetail.lead.requirement'
            "
          >
            @if (f.clause_ref) {
              <app-audit-clause-refs [refs]="[f.clause_ref]" [suggested]="nc()" />
              @if (nc()) {
                <p class="mt-1.5 text-meta text-fg-muted">
                  {{ 'audits.findingDetail.clauseWeak' | transloco }}
                </p>
              }
            }
          </app-field-item>
          @let pb = planBadge(f.plan.status ?? '');
          <app-field-item size="lead" labelKey="audits.findingDetail.lead.audit">
            <app-audit-record-link
              class="mt-1"
              icon="audit"
              [type]="'audits.detail.types.plan' | transloco"
              [code]="f.plan.code"
              [title]="f.plan.title"
              [status]="f.plan.status ? pb : null"
              [link]="['/audits/plans', f.plan.id]"
            />
          </app-field-item>
        </app-record-lead>

        <div class="flex flex-col gap-6">
          <app-record-details [columns]="3" [fillLink]="canEdit() ? editLink() : null">
            <app-field-item labelKey="audits.fields.department" [value]="f.department_name" />
            <app-field-item
              labelKey="audits.fields.leadAuditor"
              [value]="f.plan.lead_auditor?.name"
            />
          </app-record-details>

          <app-card
            [id]="sections.response"
            tabindex="-1"
            class="outline-none"
            data-testid="finding-response"
          >
            <h2 class="mb-1 font-display text-section font-bold text-fg">
              {{
                (nc() ? 'audits.findingDetail.response' : 'audits.findingDetail.decisionTitle')
                  | transloco
              }}
            </h2>
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
            <app-card
              [id]="sections.actions"
              tabindex="-1"
              class="outline-none"
              data-testid="finding-actions"
            >
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
                      <app-date-input
                        inputId="fa-due"
                        [value]="actionDue()"
                        (valueChange)="actionDue.set($event ?? '')"
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

            <app-card
              [id]="sections.verification"
              tabindex="-1"
              class="outline-none"
              data-testid="finding-verification"
            >
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
              } @else if (f.verification_notes) {
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
          }
        </div>

        <div
          follow-up-connections
          class="mt-4 flex flex-col gap-3 border-t border-border pt-3"
          data-testid="finding-follow-up"
        >
          <h3 class="text-meta font-semibold text-fg-muted" data-testid="finding-deviations">
            {{ 'audits.findingDetail.deviationsTitle' | transloco }}
          </h3>
          @for (d of f.deviations; track d.entity_id) {
            <app-audit-record-link
              icon="alert"
              [type]="'audits.detail.types.deviation' | transloco"
              [code]="d.code"
              [title]="d.title"
              [status]="deviationStatus(d.status)"
              [link]="d.url || ['/deviations', d.entity_id]"
            />
          } @empty {
            <p class="text-meta text-fg-muted">
              {{ 'audits.findingDetail.noDeviations' | transloco }}
            </p>
          }
          @if (canLinkDeviation()) {
            @if (linkingDeviation()) {
              <app-audit-record-picker
                [types]="['deviation']"
                [excluded]="deviationIds()"
                placeholderKey="audits.findingDetail.searchDeviation"
                (picked)="linkDeviation($event)"
              />
            } @else {
              <button
                type="button"
                class="inline-flex min-h-6 items-center gap-1 self-start text-meta font-semibold text-accent hover:underline"
                (click)="linkingDeviation.set(true)"
                data-testid="finding-link-deviation"
              >
                <app-icon name="link" [size]="13" />
                {{ 'audits.findingDetail.linkDeviation' | transloco }}
              </button>
            }
          }
        </div>

        <app-record-meta follow-up-meta>
          <app-field-item
            layout="inline"
            labelKey="audits.fields.findingOwner"
            [value]="f.owner?.name"
          />
          <app-field-item layout="inline" labelKey="audits.fields.responseDue">
            @if (f.response_due_at) {
              <span [class.text-warn-ink]="f.overdue">{{ f.response_due_at | localDay }}</span>
            }
          </app-field-item>
          <app-field-item
            layout="inline"
            labelKey="audits.findingDetail.meta.responded"
            [value]="f.responded_at | localDate"
          />
          <app-field-item
            layout="inline"
            labelKey="audits.findingDetail.meta.closed"
            [value]="f.closed_at | localDate"
          />
          <app-field-item
            layout="inline"
            labelKey="audits.detail.meta.updated"
            [value]="f.updated_at | localDate"
          />
        </app-record-meta>

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
  private readonly ask = inject(AskPanelService);
  private readonly types = inject(EntityTypesService);
  protected readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly sections = FINDING_SECTIONS;
  protected readonly fieldLabels = FINDING_FIELD_LABELS;
  protected readonly effectivenessResults = EFFECTIVENESS_RESULTS;
  protected readonly typeBadge = findingTypeBadge;
  protected readonly statusBadge = findingStatusBadge;
  protected readonly planBadge = planStatusBadge;
  protected readonly lang = this.language.active;
  protected readonly data = loadable<FindingDetail>();
  protected readonly saving = mutator();
  protected readonly pending = signal<FindingAction | null>(null);
  protected readonly deleting = signal(false);
  protected readonly addingAction = signal(false);
  protected readonly linkingDeviation = signal(false);

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
  protected readonly canEdit = computed(() => {
    const status = this.data.value()?.status;
    return this.access.canWrite() && status !== 'closed' && status !== 'cancelled';
  });
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/audits/findings',
    this.id(),
    'edit',
  ]);
  protected readonly statusTone = computed(() =>
    findingStatusTone(this.data.value()?.status ?? 'open'),
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
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const f = this.data.value();
    if (!f) {
      return [];
    }
    return findingMissing(f, {
      canEdit: this.canEdit(),
      respondable: this.respondable(),
      verifiable: this.verifiable(),
      canAddAction: this.canAddAction(),
      canCheckEffect: this.access.canWrite(),
      editLink: this.editLink(),
      show: (section) => showSection(this.router, section),
    });
  });
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

  protected deviationStatus(status: string | null | undefined): RecordLinkStatus | null {
    return status
      ? { meaning: 'lifecycle', value: status, label: this.types.statusLabel(status, 'deviations') }
      : null;
  }

  protected edit(): void {
    void this.router.navigate(this.editLink());
  }

  protected askAi(kind: 'explain' | 'response'): void {
    const f = this.data.value();
    if (!f) {
      return;
    }
    const key =
      kind === 'explain'
        ? 'audits.findingDetail.askAbout'
        : this.nc()
          ? 'audits.findingDetail.askRootCause'
          : 'audits.findingDetail.askDecision';
    this.ask.askAbout(this.language.translate(key, { code: f.code }), undefined, {
      requirements: f.clause_ref ? [f.clause_ref] : null,
    });
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
      next: (f) => {
        this.linkingDeviation.set(false);
        this.data.set(f);
      },
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
