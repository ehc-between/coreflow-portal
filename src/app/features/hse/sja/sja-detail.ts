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
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RequirementLink } from '../../../core/standards/standards.models';
import { AskPanelService } from '../../ask/ask-panel.service';
import { OutputsPanel } from '../../../shared/outputs';
import { Term } from '../../../shared/guidance/term';
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
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import {
  SJA_REASON_ACTIONS,
  Sja,
  SjaAction,
  SjaSignOff,
  SjaStep,
  SjaWarning,
} from '../data/hse.models';
import { sjaMissing, sjaStatusSentence } from '../hse-anatomy';
import { controlTypeOf, periodKind, ppeStatusValue } from '../hse-format';
import {
  HSE_CRUMBS,
  HSE_MODULE,
  HSE_ROOT_CRUMB,
  departmentName,
  injectHsePermissions,
} from '../shared/hse-shared';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Snapshot field -> label key, for the revisions tab. */
export const SJA_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'hse.sja.fields.title',
  job_description: 'hse.sja.fields.job_description',
  location: 'hse.sja.fields.location',
  work_start_at: 'hse.sja.fields.work_start_at',
  work_end_at: 'hse.sja.fields.work_end_at',
  owner_user_id: 'hse.sja.fields.owner',
  department_id: 'hse.common.department',
  participants: 'hse.sja.fields.participants',
  participant_user_ids: 'hse.sja.fields.participants',
  sign_offs: 'hse.sja.signOff.title',
  steps: 'hse.sja.edit.stepsSection',
  required_ppe: 'hse.sja.fields.required_ppe',
  risk_level: 'hse.sja.fields.risk_level',
  residual_risk_level: 'hse.sja.fields.residual_risk_level',
  emergency_measures: 'hse.sja.fields.emergency_measures',
  status: 'hse.common.status',
};

/** The header actions of an SJA: one primary, Edit as secondary, the rest under "Mer". */
export interface SjaHeaderActions {
  readonly primary: SjaAction | 'edit' | null;
  readonly secondary: readonly 'edit'[];
  readonly overflow: readonly SjaAction[];
}

/**
 * Place the allowed lifecycle actions (docs/ux-guide.md §2.1): the next step
 * (submit, approve, complete) is primary, else Edit; Edit is otherwise the one
 * secondary action; return, revise and cancel go in "Mer" (Delete is added there
 * by the page).
 */
export function placeSjaActions(
  allowed: readonly SjaAction[],
  editable: boolean,
): SjaHeaderActions {
  const next = (['submit', 'approve', 'complete'] as const).find((a) => allowed.includes(a));
  const primary = next ?? (editable ? 'edit' : null);
  const secondary: 'edit'[] = editable && primary !== 'edit' ? ['edit'] : [];
  const overflow = (['return', 'revise', 'cancel'] as const).filter((a) => allowed.includes(a));
  // A second "forward" step (e.g. complete while approve is primary) also goes in "Mer".
  const others = (['approve', 'complete'] as const).filter(
    (a) => allowed.includes(a) && a !== primary,
  );
  return { primary, secondary, overflow: [...others, ...overflow] };
}

/** One participant of an SJA with their sign-off (if any). */
export interface ParticipantRow {
  readonly key: string;
  readonly name: string;
  readonly userId: string | null;
  readonly member: boolean;
  readonly signOff: SjaSignOff | null;
  /** Position in `sign_offs` (for removal); -1 when not signed. */
  readonly signOffIndex: number;
}

/** Members first, then external names; each matched with its sign-off by user id or name. */
export function participantRows(sja: Sja): ParticipantRow[] {
  const signOffs = sja.sign_offs ?? [];
  const find = (userId: string | null, name: string) =>
    signOffs.findIndex((s) =>
      userId ? s.user_id === userId : !s.user_id && s.name.toLowerCase() === name.toLowerCase(),
    );
  const rows: ParticipantRow[] = [];
  for (const u of sja.participant_users ?? []) {
    const i = find(u.id, u.name);
    rows.push({
      key: `u:${u.id}`,
      name: u.name,
      userId: u.id,
      member: true,
      signOff: i >= 0 ? signOffs[i] : null,
      signOffIndex: i,
    });
  }
  for (const name of sja.participants ?? []) {
    const i = find(null, name);
    rows.push({
      key: `n:${name}`,
      name,
      userId: null,
      member: false,
      signOff: i >= 0 ? signOffs[i] : null,
      signOffIndex: i,
    });
  }
  return rows;
}

/** The translation key and params of a backend warning on the SJA. */
export function warningText(
  w: SjaWarning,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  switch (w.key) {
    case 'residual_high_approved':
      return t('hse.sja.warnings.residual_high_approved', {
        level: t(`hse.risk.${w.level ?? 'high'}`),
      });
    case 'ppe_only_controls':
      return t('hse.sja.warnings.ppe_only_controls', {
        steps: (w.steps ?? []).map((i) => i + 1).join(', '),
      });
    case 'sign_offs_missing':
      return t('hse.sja.warnings.sign_offs_missing', { count: w.count ?? 0 });
    case 'residual_not_lower':
    case 'self_approved':
      return t(`hse.sja.warnings.${w.key}`);
    default:
      return '';
  }
}

/**
 * `/hse/sja/:id`: a safe job analysis, on the detail-page anatomy
 * (docs/ux-guide.md §2.7). The page follows the route id (moving to another SJA
 * loads it, never shows the old one). Header: code · type · status; the next
 * step as the one primary action, Edit, "Spør KI" and the rest under "Mer".
 * "Hovedinformasjon": where the analysis stands, the job, where and when, the
 * risk before and after the controls, and how many have signed. Details tab: the
 * steps with hazards and controls, participants and their sign-off, required PPE
 * matched to the PPE register, the other fields with the empty ones hidden. One
 * "Oppfølging" card: what is missing, requirements, connections, and the approval
 * trail (who created, submitted, approved with role, completed) as metadata.
 */
@Component({
  selector: 'app-sja-detail',
  imports: [
    OutputsPanel,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PromptDialog,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    EntityTasks,
    StatusBadge,
    SupportsRequirements,
    Term,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-error-state
            titleKey="hse.common.notFoundTitle"
            bodyKey="hse.common.notFound"
            (retry)="reload()"
          />
          <p class="mt-3 text-center">
            <a routerLink="/hse/sja" class="text-ui font-semibold text-accent hover:underline">{{
              'hse.sja.list.back' | transloco
            }}</a>
          </p>
        </div>
      }
      @case ('ready') {
        @if (sja(); as s) {
          @let placed = actions();
          <app-record-detail-layout
            [anatomy]="true"
            entityType="sja"
            [entityId]="s.id"
            [title]="s.title"
            [breadcrumbs]="breadcrumbs()"
            [tabs]="tabs"
            [canEdit]="perms.write()"
            [fieldLabels]="fieldLabels"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ s.code }}</span>
              <span aria-hidden="true">·</span>
              <app-term key="sja" scope="hse">{{ 'hse.sja.one' | transloco }}</app-term>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="s.status"
                [labelKey]="'hse.sja.status.' + s.status"
              />
            </ng-container>

            @if (placed.primary; as action) {
              <app-button
                primary
                [variant]="action === 'edit' ? 'secondary' : 'primary'"
                [loading]="busy() === action"
                [disabled]="!!busy()"
                (click)="start(action)"
                [attr.data-testid]="'sja-action-' + action"
              >
                {{ actionLabel(action) | transloco }}
              </app-button>
            }
            @for (action of placed.secondary; track action) {
              <app-button
                secondary
                variant="secondary"
                [disabled]="!!busy()"
                (click)="start(action)"
                data-testid="sja-action-edit"
              >
                {{ 'hse.common.edit' | transloco }}
              </app-button>
            }
            @for (action of placed.overflow; track action) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="action === 'cancel'"
                [disabled]="!!busy()"
                (click)="start(action)"
                [attr.data-testid]="'sja-action-' + action"
              >
                {{ actionLabel(action) | transloco }}
              </button>
            }
            @if (canDelete()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                [disabled]="!!busy()"
                (click)="deleteOpen.set(true)"
                data-testid="sja-delete"
              >
                {{ 'hse.common.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAi('summarise')">
              <app-icon name="spark" [size]="15" />
              {{ 'hse.common.summarise' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('check')">
              <app-icon name="spark" [size]="15" />
              {{ 'hse.sja.ai.check' | transloco }}
            </button>

            <app-help-strip
              help
              scope="hse"
              page="sja-detail"
              lesson="sja-basics"
              [subject]="s.title"
            />

            <app-record-lead record-lead [fillLink]="editable() ? editLink() : null">
              @let line = statusLine();
              <app-record-status-line status [tone]="line.tone">
                {{ line.key | transloco: line.params }}
              </app-record-status-line>
              @if (warnings().length) {
                <ul
                  status
                  class="-mt-2 mb-4 flex flex-col gap-1 text-ui text-warn-ink"
                  role="status"
                  data-testid="sja-warnings"
                >
                  @for (w of warnings(); track w) {
                    <li class="flex gap-2">
                      <app-icon name="alert" [size]="14" class="mt-0.5 flex-none" />
                      <span>{{ w }}</span>
                    </li>
                  }
                </ul>
              }
              <app-field-item
                size="lead"
                labelKey="hse.sja.lead.job"
                [wide]="true"
                data-testid="sja-lead-job"
              >
                @if (s.job_description) {
                  <div class="cf-prose" [innerHTML]="s.job_description | appMarkdown"></div>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="hse.sja.lead.whereWhen">
                @if (s.location || period() !== 'none') {
                  @if (s.location) {
                    <span class="block">{{ s.location }}</span>
                  }
                  <span class="block text-ui font-normal text-fg-muted">
                    @switch (period()) {
                      @case ('range') {
                        {{
                          'hse.sja.detail.periodRange'
                            | transloco
                              : {
                                  start: (s.work_start_at | localDate),
                                  end: (s.work_end_at | localDate),
                                }
                        }}
                      }
                      @case ('from') {
                        {{
                          'hse.sja.detail.periodFrom'
                            | transloco: { start: (s.work_start_at | localDate) }
                        }}
                      }
                      @case ('until') {
                        {{
                          'hse.sja.detail.periodUntil'
                            | transloco: { end: (s.work_end_at | localDate) }
                        }}
                      }
                    }
                  </span>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="hse.sja.lead.risk" data-testid="sja-lead-risk">
                @if (s.risk_level || s.residual_risk_level) {
                  <span class="flex flex-wrap items-center gap-2">
                    @if (s.risk_level) {
                      <app-status-badge
                        meaning="severity"
                        [value]="s.risk_level"
                        labelKey="hse.sja.lead.before"
                        [labelParams]="{ level: ('hse.risk.' + s.risk_level | transloco) }"
                      />
                    }
                    @if (s.risk_level && s.residual_risk_level) {
                      <app-icon name="arrow" [size]="14" class="text-fg-subtle" />
                    }
                    @if (s.residual_risk_level) {
                      <app-status-badge
                        meaning="severity"
                        [value]="s.residual_risk_level"
                        labelKey="hse.sja.lead.after"
                        [labelParams]="{ level: ('hse.risk.' + s.residual_risk_level | transloco) }"
                      />
                    }
                  </span>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="hse.sja.lead.signed">
                @if (s.sign_off; as so) {
                  @if (so.expected > 0) {
                    <span [class.text-warn-ink]="signable() && !so.complete">{{
                      'hse.sja.signOff.progress'
                        | transloco: { signed: so.signed, expected: so.expected }
                    }}</span>
                  }
                }
              </app-field-item>
            </app-record-lead>

            <div class="flex flex-col gap-6">
              <section data-testid="sja-steps" aria-labelledby="sja-steps-title">
                <h2
                  id="sja-steps-title"
                  class="mb-3 flex flex-wrap items-baseline gap-2 font-display text-card font-bold text-fg"
                >
                  {{ 'hse.sja.edit.stepsSection' | transloco }}
                  <span class="text-meta font-semibold text-fg-muted">
                    {{
                      'hse.sja.list.counts'
                        | transloco: { hazards: s.hazard_count, controls: s.control_count }
                    }}
                  </span>
                </h2>
                @if (s.steps.length) {
                  <ol class="flex flex-col gap-3">
                    @for (step of s.steps; track $index; let i = $index) {
                      <li
                        class="rounded-tile border border-border bg-surface p-3"
                        [attr.data-testid]="'sja-step-' + i"
                      >
                        <div class="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface-2 text-meta font-bold text-fg-muted"
                            >{{ i + 1 }}</span
                          >
                          <span class="min-w-0 flex-1 font-semibold text-fg">{{
                            step.description
                          }}</span>
                          @if (step.risk_level) {
                            <app-status-badge
                              meaning="severity"
                              [value]="step.risk_level"
                              [labelKey]="'hse.risk.' + step.risk_level"
                            />
                          }
                        </div>
                        <div class="grid grid-cols-1 gap-3 text-ui sm:grid-cols-2">
                          <div>
                            <h3 class="text-meta font-semibold text-fg-subtle">
                              {{ 'hse.sja.detail.hazards' | transloco }}
                            </h3>
                            <ul class="mt-1 list-disc pl-5 text-fg">
                              @for (h of step.hazards; track $index) {
                                <li>{{ h }}</li>
                              } @empty {
                                <li class="list-none text-warn-ink">
                                  {{ 'hse.sja.detail.noneYet' | transloco }}
                                </li>
                              }
                            </ul>
                          </div>
                          <div>
                            <h3 class="text-meta font-semibold text-fg-subtle">
                              {{ 'hse.sja.detail.controls' | transloco }}
                            </h3>
                            <ul class="mt-1 flex flex-col gap-1 text-fg">
                              @for (c of step.controls; track $index; let ci = $index) {
                                <li class="flex flex-wrap items-baseline gap-1.5">
                                  <span aria-hidden="true" class="text-fg-subtle">•</span>
                                  <span class="min-w-0 flex-1">{{ c }}</span>
                                  @if (controlType(step, ci); as type) {
                                    <app-badge [tone]="type === 'ppe' ? 'warn' : 'neutral'">{{
                                      'hse.controlType.' + type | transloco
                                    }}</app-badge>
                                  }
                                </li>
                              } @empty {
                                <li class="text-warn-ink">
                                  {{ 'hse.sja.detail.noneYet' | transloco }}
                                </li>
                              }
                            </ul>
                          </div>
                        </div>
                        @if (responsibleName(step); as name) {
                          <p class="mt-2 text-meta text-fg-muted">
                            {{ 'hse.sja.detail.responsible' | transloco: { name } }}
                          </p>
                        }
                      </li>
                    }
                  </ol>
                } @else {
                  <p class="text-ui text-fg-muted">{{ 'hse.sja.detail.noStepsYet' | transloco }}</p>
                }
              </section>

              <app-card id="sja-participants" data-testid="sja-participants">
                <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'hse.sja.signOff.title' | transloco }}
                  </h2>
                  @if (s.sign_off; as so) {
                    @if (so.expected > 0) {
                      <app-status-badge
                        meaning="progress"
                        [value]="so.complete ? '100' : '50'"
                        labelKey="hse.sja.signOff.progress"
                        [labelParams]="{ signed: so.signed, expected: so.expected }"
                      />
                    }
                  }
                </div>
                <p class="mb-3 text-meta text-fg-muted">
                  {{ 'hse.sja.signOff.hint' | transloco }}
                </p>
                @if (participants().length) {
                  <ul class="divide-y divide-border">
                    @for (p of participants(); track p.key) {
                      <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-ui">
                        <span
                          class="flex h-6 w-6 flex-none items-center justify-center rounded-full"
                          [class]="
                            p.signOff ? 'bg-pass-soft text-pass' : 'bg-surface-2 text-fg-subtle'
                          "
                          aria-hidden="true"
                        >
                          <app-icon [name]="p.signOff ? 'check' : 'clock'" [size]="13" />
                        </span>
                        <span class="min-w-0 flex-1">
                          <span class="font-semibold text-fg">{{ p.name }}</span>
                          @if (!p.member) {
                            <span class="text-meta text-fg-subtle">
                              · {{ 'hse.people.externalShort' | transloco }}</span
                            >
                          }
                          <span class="block text-meta text-fg-muted">
                            @if (p.signOff; as so) {
                              {{
                                'hse.sja.signOff.signedAt'
                                  | transloco: { date: (so.signed_at | localDate) }
                              }}
                              @if (so.recorded_by && so.recorded_by.id !== p.userId) {
                                ·
                                {{
                                  'hse.sja.signOff.recordedBy'
                                    | transloco: { name: so.recorded_by.name }
                                }}
                              }
                            } @else {
                              {{ 'hse.sja.signOff.notYet' | transloco }}
                            }
                          </span>
                        </span>
                        @if (!p.signOff && signable()) {
                          @if (p.userId && p.userId === myId()) {
                            <app-button
                              size="sm"
                              [loading]="busy() === 'sign:' + p.key"
                              [disabled]="!!busy()"
                              (click)="signOff(p)"
                              data-testid="sja-sign-self"
                            >
                              {{ 'hse.sja.signOff.confirmSelf' | transloco }}
                            </app-button>
                          } @else if (perms.write()) {
                            <app-button
                              size="sm"
                              variant="secondary"
                              [loading]="busy() === 'sign:' + p.key"
                              [disabled]="!!busy()"
                              (click)="signOff(p)"
                              [attr.aria-label]="
                                'hse.sja.signOff.recordFor' | transloco: { name: p.name }
                              "
                            >
                              {{ 'hse.sja.signOff.record' | transloco }}
                            </app-button>
                          }
                        }
                        @if (p.signOff && perms.write()) {
                          <button
                            type="button"
                            class="inline-flex h-8 items-center rounded-tile px-2 text-meta font-semibold text-fg-muted hover:bg-surface-2 hover:text-fail"
                            [disabled]="!!busy()"
                            [attr.aria-label]="
                              'hse.sja.signOff.undoFor' | transloco: { name: p.name }
                            "
                            (click)="undoSignOff(p)"
                          >
                            {{ 'hse.sja.signOff.undo' | transloco }}
                          </button>
                        }
                      </li>
                    }
                  </ul>
                  @if (!signable() && s.status === 'draft') {
                    <p class="mt-2 text-meta text-fg-subtle">
                      {{ 'hse.sja.signOff.afterSubmit' | transloco }}
                    </p>
                  }
                } @else {
                  <p class="text-ui text-fg-muted">
                    {{ 'hse.sja.signOff.noParticipants' | transloco }}
                  </p>
                }
              </app-card>

              <app-card data-testid="sja-ppe">
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'hse.sja.fields.required_ppe' | transloco }}
                </h2>
                @if (s.required_ppe.length) {
                  <p class="mb-3 text-meta text-fg-muted">{{ 'hse.sja.ppe.hint' | transloco }}</p>
                  @if (coverage().length) {
                    <ul class="flex flex-col gap-3">
                      @for (c of coverage(); track c.category) {
                        <li class="rounded-tile border border-border p-3">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="font-semibold text-fg">{{
                              'hse.ppeCategory.' + c.category | transloco
                            }}</span>
                            @if (perms.write() && c.warning === 'none') {
                              <a
                                routerLink="/hse/ppe/new"
                                class="text-meta font-semibold text-accent hover:underline"
                                >{{ 'hse.sja.ppe.register' | transloco }}</a
                              >
                            } @else if (perms.write() && c.issue_url) {
                              <a
                                [routerLink]="issuePath(c.issue_url)"
                                [queryParams]="issueQuery(c.issue_url)"
                                class="text-meta font-semibold text-accent hover:underline"
                                >{{ 'hse.sja.ppe.issue' | transloco }}</a
                              >
                            }
                          </div>
                          @if (c.warning) {
                            <p class="mt-1 text-meta font-semibold text-warn-ink" role="status">
                              {{ 'hse.sja.ppe.warning.' + c.warning | transloco }}
                            </p>
                          }
                          @if (c.items.length) {
                            <ul class="mt-2 divide-y divide-border">
                              @for (item of c.items; track item.id) {
                                <li
                                  class="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-ui"
                                >
                                  <app-icon
                                    name="hardhat"
                                    [size]="14"
                                    class="flex-none text-fg-subtle"
                                  />
                                  <span class="font-mono text-meta text-fg-subtle">{{
                                    item.code
                                  }}</span>
                                  <a
                                    [routerLink]="item.url"
                                    class="min-w-0 flex-1 truncate font-semibold text-fg hover:text-accent hover:underline"
                                    >{{ item.name }}</a
                                  >
                                  <span class="text-meta text-fg-muted">
                                    @if (item.holder?.name || item.holder_name; as holder) {
                                      {{ 'hse.ppe.list.heldBy' | transloco: { name: holder } }}
                                    } @else {
                                      {{
                                        'hse.sja.ppe.quantity' | transloco: { count: item.quantity }
                                      }}
                                    }
                                  </span>
                                  @if (item.overdue) {
                                    <app-status-badge
                                      meaning="severity"
                                      value="high"
                                      labelKey="hse.ppe.badge.inspectionOverdue"
                                    />
                                  } @else {
                                    <app-status-badge
                                      meaning="lifecycle"
                                      [value]="ppeValue(item.status)"
                                      [labelKey]="'hse.ppe.status.' + item.status"
                                    />
                                  }
                                </li>
                              }
                            </ul>
                          }
                        </li>
                      }
                    </ul>
                  } @else {
                    <div class="flex flex-wrap gap-1.5">
                      @for (p of s.required_ppe; track p) {
                        <app-badge tone="accent">{{
                          'hse.ppeCategory.' + p | transloco
                        }}</app-badge>
                      }
                    </div>
                  }
                } @else {
                  <p class="text-ui text-fg-muted">{{ 'hse.sja.ppe.none' | transloco }}</p>
                }
              </app-card>

              <app-record-details [columns]="2" [fillLink]="editable() ? editLink() : null">
                <app-field-item
                  labelKey="hse.sja.fields.emergency_measures"
                  [wide]="true"
                  data-testid="sja-emergency"
                >
                  @if (s.emergency_measures) {
                    <div class="cf-prose" [innerHTML]="s.emergency_measures | appMarkdown"></div>
                  }
                </app-field-item>
                <app-field-item labelKey="hse.common.department" [value]="department()" />
              </app-record-details>

              <section data-testid="sja-documents">
                <h2 class="font-display text-card font-bold text-fg">
                  {{ 'hse.common.documentsTitle' | transloco }}
                </h2>
                <p class="mt-0.5 mb-3 text-ui text-fg-muted">
                  {{ 'hse.common.documentsHint' | transloco }}
                </p>
                <app-outputs-panel entityType="sja" [entityId]="s.id" />
              </section>
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="sja"
                [entityId]="s.id"
                [canCreate]="perms.write()"
                [entityLabel]="s.code + ' ' + s.title"
              />
            </div>

            <app-supports-requirements
              aside-requirements
              entityType="sja"
              [entityId]="s.id"
              [canEdit]="perms.write()"
              [frameworks]="frameworks"
              (linksChange)="onLinks($event)"
            />

            <app-record-meta follow-up-meta data-testid="sja-approval">
              <app-field-item
                layout="inline"
                labelKey="hse.sja.fields.owner"
                [value]="s.owner?.name"
              />
              @for (step of trail(); track step.key) {
                <app-field-item layout="inline" [labelKey]="'hse.sja.trail.' + step.key">
                  @if (step.by) {
                    {{
                      'hse.sja.trail.byOn'
                        | transloco: { name: step.by, date: (step.at | localDay) }
                    }}
                  } @else {
                    {{ step.at | localDay }}
                  }
                  @if (step.key === 'approved' && s.approver_role) {
                    <span class="block text-fg-muted" data-testid="sja-approver-role">
                      {{ 'hse.sja.trail.role' | transloco: { role: s.approver_role } }}
                    </span>
                  }
                </app-field-item>
              }
              <app-field-item
                layout="inline"
                labelKey="hse.common.updated"
                [value]="s.updated_at | localDate"
              />
            </app-record-meta>

            <div aside-learn>
              <app-why-it-matters scope="hse" page="sja-detail" />
            </div>
          </app-record-detail-layout>

          <app-prompt-dialog
            [open]="reasonAction() !== null"
            [title]="'hse.sja.actions.' + (reasonAction() ?? 'cancel') | transloco"
            [message]="'hse.sja.reasonMessage.' + (reasonAction() ?? 'cancel') | transloco"
            [label]="'hse.common.reason' | transloco"
            [required]="true"
            [busy]="!!busy()"
            [confirmVariant]="reasonAction() === 'cancel' ? 'danger' : 'primary'"
            [confirmLabel]="'hse.sja.actions.' + (reasonAction() ?? 'cancel') | transloco"
            [cancelLabel]="'hse.common.cancel' | transloco"
            (confirmed)="run(reasonAction()!, $event)"
            (cancelled)="reasonAction.set(null)"
          />
          <app-confirm-dialog
            [open]="completeOpen()"
            [title]="'hse.sja.completeCheck.title' | transloco"
            [message]="
              'hse.sja.completeCheck.message'
                | transloco: { count: s.sign_off?.missing?.length ?? 0 }
            "
            [confirmLabel]="'hse.sja.completeCheck.confirm' | transloco"
            [cancelLabel]="'hse.common.cancel' | transloco"
            confirmVariant="primary"
            [busy]="!!busy()"
            (confirmed)="completeOpen.set(false); run('complete', null)"
            (cancelled)="completeOpen.set(false)"
          />
          <app-confirm-dialog
            [open]="deleteOpen()"
            [title]="'hse.sja.deleteTitle' | transloco"
            [message]="'hse.sja.deleteMessage' | transloco: { code: s.code }"
            [confirmLabel]="'hse.common.delete' | transloco"
            [cancelLabel]="'hse.common.cancel' | transloco"
            [busy]="busy() === 'delete'"
            (confirmed)="remove()"
            (cancelled)="deleteOpen.set(false)"
          />
        }
      }
    }
  `,
})
export class SjaDetail {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly directory = inject(AssigneeOptionsService);
  private readonly ask = inject(AskPanelService);

  /** Route param (component input binding): follows navigation between SJAs. */
  readonly id = input.required<string>();

  protected readonly perms = injectHsePermissions();
  protected readonly tabs = TABS;
  protected readonly fieldLabels = SJA_FIELD_LABELS;
  protected readonly frameworks: readonly string[] = ['iso45001'];
  protected readonly controlType = controlTypeOf;
  protected readonly ppeValue = ppeStatusValue;

  protected readonly sja = signal<Sja | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly busy = signal<string | null>(null);
  protected readonly reasonAction = signal<SjaAction | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly completeOpen = signal(false);
  protected readonly confirmedRefs = signal<readonly string[]>([]);

  protected readonly myId = computed(() => this.auth.user()?.id ?? null);
  protected readonly breadcrumbs = computed(() => [
    HSE_ROOT_CRUMB,
    HSE_CRUMBS.sja,
    { label: this.sja()?.code ?? '' },
  ]);
  protected readonly editable = computed(() => {
    const s = this.sja();
    return (
      !!s && s.can_edit && (s.status === 'draft' || s.status === 'in_review') && this.perms.write()
    );
  });
  protected readonly actions = computed(() =>
    placeSjaActions(this.sja()?.allowed_actions ?? [], this.editable()),
  );
  protected readonly canDelete = computed(() => {
    const s = this.sja();
    if (!s) {
      return false;
    }
    if (this.perms.manage()) {
      return true;
    }
    return this.perms.write() && s.status === 'draft' && s.created_by?.id === this.myId();
  });
  protected readonly participants = computed(() => {
    const s = this.sja();
    return s ? participantRows(s) : [];
  });
  /** Sign-off is possible while the SJA is in review or approved (409 otherwise). */
  protected readonly signable = computed(() => {
    const status = this.sja()?.status;
    return status === 'in_review' || status === 'approved';
  });
  protected readonly coverage = computed(() => this.sja()?.ppe_coverage ?? []);
  protected readonly period = computed(() =>
    periodKind(this.sja()?.work_start_at, this.sja()?.work_end_at),
  );
  protected readonly department = computed(() =>
    departmentName(this.directory, this.sja()?.department_id ?? null),
  );

  protected readonly editLink = computed<readonly unknown[]>(() => ['/hse/sja', this.id(), 'edit']);
  protected readonly statusLine = computed(() =>
    sjaStatusSentence(this.sja() ?? { status: 'draft' }),
  );

  /**
   * The backend's checks an auditor would look for (residual risk, PPE-only
   * controls, self-approval). Missing sign-offs are a to-do in "Oppfølging".
   */
  protected readonly warnings = computed(() => {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    return (this.sja()?.warnings ?? [])
      .filter((w) => w.key !== 'sign_offs_missing')
      .map((w) => warningText(w, t))
      .filter((text) => !!text);
  });

  /** What the analysis still needs ("Oppfølging", docs/ux-guide.md §2.7). */
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const s = this.sja();
    if (!s) {
      return [];
    }
    return sjaMissing(s, {
      editLink: this.editLink(),
      editable: this.editable(),
      canWrite: this.perms.write(),
      showParticipants: () =>
        document
          .getElementById('sja-participants')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    });
  });

  /** Created → submitted → approved → completed, with who and when. */
  protected readonly trail = computed(() => {
    const s = this.sja();
    if (!s) {
      return [];
    }
    const steps = [
      { key: 'created', done: true, by: s.created_by?.name ?? null, at: s.created_at },
      {
        key: 'submitted',
        done: !!s.submitted_at,
        by: s.submitted_by?.name ?? null,
        at: s.submitted_at,
      },
      {
        key: 'approved',
        done: !!s.approved_at,
        by: s.approved_by?.name ?? null,
        at: s.approved_at,
      },
      { key: 'completed', done: !!s.completed_at, by: null, at: s.completed_at },
    ];
    const done = steps.filter((x) => x.done);
    return s.status === 'cancelled'
      ? [...done, { key: 'cancelled', done: true, by: null, at: s.updated_at }]
      : done;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'sja',
      entityId: this.id(),
      view: 'detail',
      title: this.sja()?.title ?? null,
      requirements: this.confirmedRefs().length ? this.confirmedRefs() : null,
    }));
    this.directory.ensureLoaded();

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId || !id) {
      return;
    }
    if (this.sja()?.id !== id) {
      // Another SJA: never show the previous one while the new one loads.
      this.sja.set(null);
      this.confirmedRefs.set([]);
      this.state.set('loading');
    }
    this.request = this.api.getSja(orgId, id).subscribe({
      next: (sja) => {
        this.sja.set(sja);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected actionLabel(action: SjaAction | 'edit'): string {
    return action === 'edit' ? 'hse.common.edit' : `hse.sja.actions.${action}`;
  }

  protected responsibleName(step: SjaStep): string | null {
    return step.responsible_user?.name || step.responsible || null;
  }

  protected issuePath(url: string): string {
    return url.split('?')[0];
  }

  protected issueQuery(url: string): Record<string, string> | null {
    const search = url.split('?')[1];
    if (!search) {
      return null;
    }
    const out: Record<string, string> = {};
    new URLSearchParams(search).forEach((v, k) => (out[k] = v));
    return out;
  }

  protected askAi(kind: 'summarise' | 'check'): void {
    const s = this.sja();
    if (!s) {
      return;
    }
    const key = kind === 'check' ? 'hse.sja.ai.checkPrompt' : 'hse.sja.ai.summarisePrompt';
    this.ask.askAbout(this.language.translate(key, { code: s.code }), undefined, {
      requirements: this.confirmedRefs(),
    });
  }

  protected onLinks(links: readonly RequirementLink[]): void {
    this.confirmedRefs.set(
      links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
    );
  }

  protected start(action: SjaAction | 'edit'): void {
    const s = this.sja();
    if (!s) {
      return;
    }
    if (action === 'edit') {
      void this.router.navigate(['/hse/sja', s.id, 'edit']);
      return;
    }
    if (SJA_REASON_ACTIONS.includes(action)) {
      this.reasonAction.set(action);
      return;
    }
    if (action === 'complete' && s.sign_off && !s.sign_off.complete && s.sign_off.expected > 0) {
      // Sign-off is not required by the backend; ask before completing without it.
      this.completeOpen.set(true);
      return;
    }
    this.run(action, null);
  }

  protected run(action: SjaAction, reason: string | null): void {
    const orgId = this.selectedOrg.currentOrgId();
    const s = this.sja();
    if (!orgId || !s || this.busy()) {
      return;
    }
    this.busy.set(action);
    this.api.transitionSja(orgId, s.id, action, reason).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.reasonAction.set(null);
        this.sja.set(updated);
        this.notifications.success(`hse.sja.done.${action}`, { code: updated.code });
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }

  protected signOff(p: ParticipantRow): void {
    const orgId = this.selectedOrg.currentOrgId();
    const s = this.sja();
    if (!orgId || !s || this.busy()) {
      return;
    }
    this.busy.set(`sign:${p.key}`);
    this.api
      .signOffSja(orgId, s.id, p.userId ? { user_id: p.userId } : { name: p.name })
      .subscribe({
        next: (updated) => {
          this.busy.set(null);
          this.sja.set(updated);
          this.notifications.success('hse.sja.signOff.done', { name: p.name });
        },
        error: (error: unknown) => {
          this.busy.set(null);
          this.notifications.error(hseErrorKey(error));
        },
      });
  }

  protected undoSignOff(p: ParticipantRow): void {
    const orgId = this.selectedOrg.currentOrgId();
    const s = this.sja();
    if (!orgId || !s || this.busy() || p.signOffIndex < 0) {
      return;
    }
    this.busy.set(`undo:${p.key}`);
    this.api.removeSignOff(orgId, s.id, p.signOffIndex).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.sja.set(updated);
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const s = this.sja();
    if (!orgId || !s || this.busy()) {
      return;
    }
    this.busy.set('delete');
    this.api.deleteSja(orgId, s.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.deleteOpen.set(false);
        this.notifications.success('hse.common.deleted', { code: s.code });
        void this.router.navigate(['/hse/sja']);
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.deleteOpen.set(false);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }
}
