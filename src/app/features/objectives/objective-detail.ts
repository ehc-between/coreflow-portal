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
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AssigneeIn } from '../../core/tasks/task.models';
import { AskPanelService } from '../ask/ask-panel.service';
import { Term } from '../../shared/guidance/term';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { ObjectiveProgress } from './components/objective-progress';
import { departmentName } from './components/owner-select';
import { ObjectivesApi } from './data/objectives-api';
import { objectivesErrorKey } from './data/objectives-errors';
import {
  CLOSED_OBJECTIVE_STATUSES,
  ManagementSystem,
  ObjectiveDetail as ObjectiveDetailDto,
  ObjectiveStatus,
} from './data/objectives.models';
import {
  OBJECTIVES_MODULE,
  OBJECTIVES_SCOPE,
  OBJECTIVE_STATUS_TONE,
  countKey,
  healthKey,
  healthSpec,
  isClosedObjective,
  managementSystemKey,
  needsAttention,
  objectiveStatusKey,
  objectiveSystems,
  textOrNull,
  todayIso,
  isMissingRecord,
} from './objectives-display';
import { OBJECTIVES_ROOT_CRUMB } from './objectives-nav';

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
export const OBJECTIVE_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'objectives.fields.title',
  description: 'objectives.fields.description',
  management_system: 'objectives.fields.managementSystem',
  management_systems: 'objectives.fields.managementSystems',
  status: 'objectives.fields.status',
  owner_user_id: 'objectives.fields.owner',
  department_id: 'objectives.fields.department',
  target: 'objectives.fields.target',
  plan: 'objectives.fields.plan',
  resources: 'objectives.fields.resources',
  evaluation_method: 'objectives.fields.evaluationMethod',
  start_date: 'objectives.fields.startDate',
  due_date: 'objectives.fields.dueDate',
  progress: 'objectives.fields.progressOverride',
  progress_note: 'objectives.fields.progressNote',
  period_year: 'objectives.fields.periodYear',
  approved_by: 'objectives.fields.approvedBy',
  communicated_to: 'objectives.fields.communicatedTo',
  last_communicated_on: 'objectives.fields.lastCommunicatedOn',
  closing_note: 'objectives.fields.closingNote',
};

/** ISO systems an objective documents clause 6.2 of (the backend links them). */
const ISO_SYSTEMS: readonly ManagementSystem[] = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso42001',
  'iso45001',
];

/** A state-driven next step on the objective (finding 21). */
export interface NextStep {
  readonly key:
    | 'activate'
    | 'addKpi'
    | 'close'
    | 'origins'
    | 'systems'
    | 'communicate'
    | 'attention';
  readonly params?: Record<string, unknown>;
}

/** What the owner should do next, most important first (at most three). */
export function nextSteps(o: ObjectiveDetailDto, today: string = todayIso()): NextStep[] {
  if (isClosedObjective(o.status)) {
    return [];
  }
  const steps: NextStep[] = [];
  if (o.due_date && o.due_date < today) {
    steps.push({ key: 'close' });
  }
  if (o.status === 'draft') {
    steps.push({ key: 'activate' });
  }
  if (o.kpi_items.length === 0) {
    steps.push({ key: 'addKpi' });
  }
  const attention = needsAttention(o.kpis);
  if (attention > 0) {
    steps.push({ key: 'attention', params: { count: attention } });
  }
  if (objectiveSystems(o).length === 0) {
    steps.push({ key: 'systems' });
  }
  if (o.origins !== undefined && o.origins.length === 0) {
    steps.push({ key: 'origins' });
  }
  if (o.status === 'active' && o.last_communicated_on === null) {
    steps.push({ key: 'communicate' });
  }
  return steps.slice(0, 3);
}

/**
 * The status sentence of an objective ("Aktiv – alle KPI-ene er på sporet."):
 * the status word, a dash, and what it means. Open work is a to-do (`warn`),
 * never red; done is green; a closed objective that was not reached is neutral.
 */
export function objectiveStatusLine(
  o: ObjectiveDetailDto,
  today: string = todayIso(),
): { key: string; tone: StatusLineTone; params: Record<string, unknown> } {
  const base = 'objectives.detail.statusLine.';
  switch (o.status) {
    case 'achieved':
      return { key: `${base}achieved`, tone: 'pass', params: {} };
    case 'not_achieved':
      return { key: `${base}notAchieved`, tone: 'neutral', params: {} };
    case 'cancelled':
      return { key: `${base}cancelled`, tone: 'neutral', params: {} };
    case 'draft':
      return { key: `${base}draft`, tone: 'warn', params: {} };
  }
  if (o.overdue || (o.due_date !== null && o.due_date < today)) {
    return { key: `${base}overdue`, tone: 'warn', params: {} };
  }
  const total = o.kpis.total;
  if (total === 0) {
    return { key: `${base}noKpis`, tone: 'warn', params: {} };
  }
  const attention = needsAttention(o.kpis);
  if (attention > 0) {
    return {
      key: countKey(`${base}attention`, attention),
      tone: 'warn',
      params: { count: attention, total },
    };
  }
  if (o.kpis.on_track === total) {
    return { key: `${base}onTrack`, tone: 'pass', params: {} };
  }
  return {
    key: countKey(`${base}partly`, total),
    tone: 'info',
    params: { count: o.kpis.on_track, total },
  };
}

/**
 * What the objective still needs ("Oppfølging", docs/ux-guide.md §2.7): the
 * next steps as actionable lines, each a link (edit page, new KPI, the KPI that
 * needs attention) or an action (activate, close).
 */
export function objectiveMissing(
  o: ObjectiveDetailDto,
  actions: { activate: () => void; close: () => void },
  today: string = todayIso(),
): RecordMissingItem[] {
  const edit = ['/objectives', o.id, 'edit'];
  const items: RecordMissingItem[] = [];
  for (const step of nextSteps(o, today)) {
    const labelKey = `objectives.detail.missing.${step.key}`;
    switch (step.key) {
      case 'activate':
        if (o.can_edit) {
          items.push({ key: step.key, labelKey, action: actions.activate });
        }
        break;
      case 'close':
        if (o.can_edit) {
          items.push({ key: step.key, labelKey, action: actions.close });
        }
        break;
      case 'addKpi':
        if (o.can_edit) {
          items.push({
            key: step.key,
            labelKey,
            link: ['/objectives/kpis/new'],
            queryParams: { objective: o.id },
          });
        }
        break;
      case 'attention': {
        const kpi = o.kpi_items.find(
          (k) => k.last_status === 'at_risk' || k.last_status === 'off_track',
        );
        const count = Number(step.params?.['count'] ?? 0);
        items.push({
          key: step.key,
          labelKey: countKey(labelKey, count),
          params: { count },
          link: kpi ? ['/objectives/kpis', kpi.id] : undefined,
        });
        break;
      }
      default:
        if (o.can_edit) {
          items.push({
            key: step.key,
            labelKey,
            link: edit,
            queryParams: { focus: step.key === 'communicate' ? 'communication' : step.key },
          });
        }
    }
  }
  return items;
}

/**
 * `/objectives/:id`: an objective on the detail-page anatomy (docs/ux-guide.md
 * §2.7). Header: code · Mål · status, Rediger, the next lifecycle step
 * (activate a draft, close an active objective) and "Spør KI".
 * "Hovedinformasjon": a status sentence, what the objective should achieve, its
 * progress, the deadline and the KPIs that measure it (linked, with their latest
 * value and status). Details tab: why we have it (the policy, risks, … it comes
 * from, as linked chips), the plan, how it was communicated and the other facts,
 * with the empty ones hidden. The "Oppfølging" card lists the next steps, the
 * requirements it documents, its connections and owner / approval / changes.
 */
@Component({
  selector: 'app-objective-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    MarkdownPipe,
    Term,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    EntityTasks,
    Button,
    ConfirmDialog,
    EmptyState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    ErrorState,
    MenuItem,
    StatusBadge,
    ObjectiveProgress,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8"><app-loading-state [rows]="6" /></div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-7 sm:px-8" data-testid="objective-not-found">
          <app-empty-state
            icon="search"
            titleKey="objectives.common.notFoundTitle"
            bodyKey="objectives.common.notFound"
            ctaKey="objectives.common.backToList"
            ctaLink="/objectives"
            ctaVariant="secondary"
          />
        </div>
      }
      @case ('failed') {
        <div class="mx-auto max-w-[760px] px-4 pt-7 sm:px-8">
          <app-error-state (retry)="retry()" />
        </div>
      }
      @case ('ready') {
        @if (objective(); as o) {
          @let line = statusLine();
          <app-record-detail-layout
            [anatomy]="true"
            entityType="objective"
            [entityId]="o.id"
            [title]="o.title"
            [breadcrumbs]="breadcrumbs()"
            [tabs]="tabs"
            [requirementsPanel]="true"
            [canEdit]="o.can_edit"
            [fieldLabels]="fieldLabels"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ o.code }}</span>
              <span aria-hidden="true">·</span>
              <app-term key="objective" [scope]="scope">{{
                'modules.entities.objective' | transloco
              }}</app-term>
              <span aria-hidden="true">·</span>
              <app-status-badge
                [meaning]="statusTone[o.status].meaning"
                [value]="statusTone[o.status].value"
                [labelKey]="statusKey(o.status)"
              />
              @if (o.overdue) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="objectives.common.overdue"
                />
              }
            </ng-container>

            @if (o.can_edit) {
              <app-button primary (click)="edit()" data-testid="objective-edit">
                {{ 'objectives.detail.edit' | transloco }}
              </app-button>
            }
            @if (o.can_edit && o.status === 'draft') {
              <app-button
                secondary
                variant="secondary"
                (click)="confirmActivate.set(true)"
                data-testid="objective-activate"
              >
                <app-icon name="check" [size]="15" />
                {{ 'objectives.next.activate.cta' | transloco }}
              </app-button>
            } @else if (o.can_edit && !closed()) {
              <app-button
                secondary
                variant="secondary"
                (click)="openClose()"
                data-testid="objective-close"
              >
                <app-icon name="check" [size]="15" />
                {{ 'objectives.close.action' | transloco }}
              </app-button>
            }
            @if (o.can_edit && o.status === 'draft') {
              <button appMenuItem overflow type="button" (click)="openClose()">
                {{ 'objectives.close.action' | transloco }}
              </button>
            }
            @if (o.can_delete) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="confirmDelete.set(true)"
              >
                {{ 'objectives.detail.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAi()" data-testid="objective-ask">
              <app-icon name="spark" [size]="15" />
              {{ 'objectives.ai.summariseObjective' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askTarget()">
              <app-icon name="spark" [size]="15" />
              {{ 'objectives.ai.askTarget' | transloco }}
            </button>

            <app-help-strip help [scope]="scope" page="detail" lesson="smart-objectives" />

            <app-record-lead record-lead [fillLink]="o.can_edit ? editLink() : null">
              <app-record-status-line status [tone]="line.tone">
                {{ line.key | transloco: line.params }}
              </app-record-status-line>
              <app-field-item
                size="lead"
                labelKey="objectives.detail.lead.target"
                [value]="o.target"
                [multiline]="true"
                [wide]="true"
                data-testid="objective-target"
              />
              <app-field-item size="lead" labelKey="objectives.detail.lead.progress">
                <app-objective-progress [objective]="o" />
                @if (o.progress_source === 'manual' && o.progress_note) {
                  <span class="mt-1 block text-meta font-normal text-fg-muted">
                    {{ 'objectives.progress.reason' | transloco: { note: o.progress_note } }}
                  </span>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="objectives.detail.lead.due">
                @if (o.due_date) {
                  <span [class.text-warn-ink]="o.overdue">
                    {{ o.due_date | localDay }}
                    @if (o.overdue) {
                      · {{ 'objectives.common.overdue' | transloco }}
                    }
                  </span>
                }
              </app-field-item>
              @if (closed() && o.closing_note) {
                <app-field-item
                  size="lead"
                  [wide]="true"
                  [multiline]="true"
                  labelKey="objectives.detail.lead.closing"
                  [value]="o.closing_note"
                />
              }
              <app-field-item size="lead" [wide]="true" labelKey="objectives.detail.lead.kpis">
                <span class="mt-1 block text-ui font-normal">
                  @if (o.kpi_items.length === 0) {
                    <span class="text-fg-muted">{{ 'objectives.detail.noKpis' | transloco }}</span>
                  } @else {
                    <ul
                      class="divide-y divide-border rounded-tile border border-border"
                      data-testid="objective-kpis"
                    >
                      @for (k of o.kpi_items; track k.id) {
                        @let h = health(k.last_status);
                        <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                          <a
                            [routerLink]="['/objectives/kpis', k.id]"
                            class="group flex min-w-0 basis-full items-baseline gap-2 sm:basis-0 sm:flex-1"
                          >
                            <span
                              class="flex-none text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase"
                              >{{ 'modules.entities.kpi' | transloco }}</span
                            >
                            <span class="flex-none font-mono text-meta text-fg-muted">{{
                              k.code
                            }}</span>
                            <span
                              class="min-w-0 font-semibold text-fg group-hover:text-accent group-hover:underline"
                              >{{ k.name }}</span
                            >
                          </a>
                          <span class="text-ui text-fg">
                            @if (k.last_value !== null) {
                              {{ k.last_value | localNumber: '1.0-2' }} {{ k.unit }}
                            } @else {
                              <span class="text-fg-muted">{{
                                'objectives.common.noValue' | transloco
                              }}</span>
                            }
                            @if (k.target_value !== null) {
                              <span class="text-meta text-fg-subtle">
                                ·
                                {{
                                  'objectives.kpiList.target'
                                    | transloco
                                      : {
                                          value:
                                            (k.target_value | localNumber: '1.0-2') +
                                            (k.unit ? ' ' + k.unit : ''),
                                        }
                                }}
                              </span>
                            }
                          </span>
                          <app-status-badge
                            [meaning]="h.meaning"
                            [value]="h.value"
                            [labelKey]="healthKey(k.last_status)"
                          />
                        </li>
                      }
                    </ul>
                  }
                  @if (o.can_edit) {
                    <a
                      [routerLink]="['/objectives/kpis/new']"
                      [queryParams]="{ objective: o.id }"
                      class="mt-2 flex min-h-8 w-fit items-center gap-1 text-ui font-semibold text-accent hover:underline"
                      data-testid="objective-add-kpi"
                    >
                      <app-icon name="plus" [size]="13" />
                      {{ 'objectives.detail.addKpi' | transloco }}
                    </a>
                  }
                </span>
              </app-field-item>
            </app-record-lead>

            <app-record-details [columns]="2" [fillLink]="o.can_edit ? editLink() : null">
              <app-field-item
                labelKey="objectives.detail.why"
                [wide]="true"
                data-testid="objective-origins"
              >
                @if (o.origins?.length) {
                  <ul class="mt-1 flex flex-col gap-3">
                    @for (ref of o.origins; track ref.entity_type + ref.entity_id) {
                      <li><app-entity-chip [ref]="ref" [statusText]="true" [stacked]="true" /></li>
                    }
                  </ul>
                }
              </app-field-item>
              <app-field-item labelKey="objectives.detail.about" [wide]="true">
                @if (o.description) {
                  <div class="cf-markdown" [innerHTML]="o.description | appMarkdown"></div>
                }
              </app-field-item>
              <app-field-item
                labelKey="objectives.detail.plan"
                [wide]="true"
                [multiline]="true"
                [value]="o.plan"
              />
              <app-field-item
                labelKey="objectives.fields.resources"
                [multiline]="true"
                [value]="o.resources"
              />
              <app-field-item
                labelKey="objectives.detail.evaluation"
                [multiline]="true"
                [value]="o.evaluation_method"
              />
              <app-field-item
                labelKey="objectives.detail.communicatedTo"
                [multiline]="true"
                [value]="o.communicated_to ?? null"
              />
              <app-field-item
                labelKey="objectives.fields.lastCommunicatedOn"
                [value]="o.last_communicated_on | localDay"
              />
              <app-field-item labelKey="objectives.detail.systems">
                @if (systems().length) {
                  {{ systemNames() }}
                }
              </app-field-item>
              <app-field-item labelKey="objectives.fields.department" [value]="department()" />
              <app-field-item
                labelKey="objectives.fields.periodYear"
                [value]="o.period_year ?? null"
              />
              <app-field-item
                labelKey="objectives.fields.startDate"
                [value]="o.start_date | localDay"
              />
            </app-record-details>

            <div tasks>
              <app-entity-tasks
                entityType="objective"
                [entityId]="o.id"
                [canCreate]="o.can_edit"
                [defaultAssignee]="defaultAssignee()"
                [entityLabel]="o.code + ' ' + o.title"
              />
            </div>

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="objectives.fields.owner"
                [keepEmpty]="true"
                emptyKey="objectives.common.noOwner"
                [emptyLink]="o.can_edit ? editLink() : null"
                [value]="o.owner?.name"
              />
              <app-field-item layout="inline" labelKey="objectives.fields.approvedBy">
                @if (o.approved_by; as by) {
                  {{
                    o.approved_at
                      ? ('objectives.detail.approvedOn'
                        | transloco
                          : { name: by.name, date: (o.approved_at | localDate: 'mediumDate') })
                      : by.name
                  }}
                }
              </app-field-item>
              @if (o.closed_at) {
                <app-field-item
                  layout="inline"
                  labelKey="objectives.detail.closedOn"
                  [value]="o.closed_at | localDate: 'mediumDate'"
                />
              }
              <app-field-item
                layout="inline"
                labelKey="objectives.detail.updated"
                [value]="o.updated_at | localDate: 'mediumDate'"
              />
            </app-record-meta>

            <div aside-learn>
              <app-why-it-matters [scope]="scope" page="detail" />
            </div>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'objectives.detail.deleteTitle' | transloco"
            [message]="'objectives.detail.deleteMessage' | transloco: { code: o.code }"
            [confirmLabel]="'objectives.detail.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="confirmDelete.set(false)"
          />

          <app-confirm-dialog
            [open]="confirmActivate()"
            confirmVariant="primary"
            [title]="'objectives.activate.title' | transloco"
            [message]="'objectives.activate.message' | transloco: { code: o.code }"
            [confirmLabel]="'objectives.activate.confirm' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="activate()"
            (cancelled)="confirmActivate.set(false)"
          />

          <app-confirm-dialog
            [open]="closeOpen()"
            confirmVariant="primary"
            [title]="'objectives.close.title' | transloco"
            [message]="'objectives.close.message' | transloco: { code: o.code }"
            [confirmLabel]="'objectives.close.confirm' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            [confirmDisabled]="!closeStatus()"
            initialFocus="input[name=close-status]"
            (confirmed)="close()"
            (cancelled)="closeOpen.set(false)"
          >
            <fieldset class="mt-4" data-testid="close-dialog">
              <legend class="mb-2 text-ui font-semibold text-fg">
                {{ 'objectives.close.outcome' | transloco }}
              </legend>
              <div class="flex flex-col gap-1.5">
                @for (s of closedStatuses; track s) {
                  <label
                    class="flex min-h-9 items-center gap-2 rounded-tile border border-border px-3 py-2 text-ui text-fg has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                  >
                    <input
                      type="radio"
                      name="close-status"
                      [value]="s"
                      [checked]="closeStatus() === s"
                      (change)="closeStatus.set(s)"
                    />
                    {{ statusKey(s) | transloco }}
                  </label>
                }
              </div>
            </fieldset>
            <label class="mt-3 block text-ui font-semibold text-fg-muted" for="obj-close-note">
              {{ 'objectives.fields.closingNote' | transloco }}
            </label>
            <textarea
              id="obj-close-note"
              rows="3"
              maxlength="5000"
              class="mt-1 w-full rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
              [placeholder]="'objectives.close.notePlaceholder' | transloco"
              [value]="closeNote()"
              (input)="closeNote.set($any($event.target).value)"
            ></textarea>
          </app-confirm-dialog>
        }
      }
    }
  `,
})
export class ObjectiveDetail {
  private readonly api = inject(ObjectivesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly options = inject(AssigneeOptionsService);

  readonly id = input.required<string>();

  protected readonly scope = OBJECTIVES_SCOPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = OBJECTIVE_FIELD_LABELS;
  protected readonly statusKey = objectiveStatusKey;
  protected readonly statusTone = OBJECTIVE_STATUS_TONE;
  protected readonly healthKey = healthKey;
  protected readonly health = healthSpec;
  protected readonly closedStatuses = CLOSED_OBJECTIVE_STATUSES;

  /** `error`: not found / no access; `failed`: could not load (server or network). */
  protected readonly state = signal<'loading' | 'error' | 'failed' | 'ready'>('loading');
  protected readonly objective = signal<ObjectiveDetailDto | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly confirmActivate = signal(false);
  protected readonly closeOpen = signal(false);
  protected readonly closeStatus = signal<ObjectiveStatus | null>(null);
  protected readonly closeNote = signal('');
  protected readonly busy = signal(false);

  protected readonly closed = computed(() => {
    const o = this.objective();
    return !!o && isClosedObjective(o.status);
  });
  protected readonly systems = computed(() => {
    const o = this.objective();
    return o ? objectiveSystems(o) : [];
  });
  protected readonly systemNames = computed(() =>
    this.systems()
      .map((s) => this.language.translate(managementSystemKey(s)))
      .join(', '),
  );
  /** The clauses the objective documents through its systems (sent to the assistant). */
  protected readonly requirementRefs = computed(() =>
    this.systems()
      .filter((s) => ISO_SYSTEMS.includes(s))
      .map((s) => `${s}:6.2`),
  );
  protected readonly statusLine = computed(() => {
    const o = this.objective();
    return o ? objectiveStatusLine(o) : { key: '', tone: 'neutral' as StatusLineTone, params: {} };
  });
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const o = this.objective();
    return o
      ? objectiveMissing(o, {
          activate: () => this.confirmActivate.set(true),
          close: () => this.openClose(),
        })
      : [];
  });
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/objectives',
    this.id(),
    'edit',
  ]);
  protected readonly breadcrumbs = computed(() => [
    OBJECTIVES_ROOT_CRUMB,
    { label: this.objective()?.code ?? '' },
  ]);
  protected readonly department = computed(() =>
    departmentName(this.options, this.objective()?.department_id ?? null),
  );
  protected readonly defaultAssignee = computed<AssigneeIn | null>(() => {
    const owner = this.objective()?.owner;
    return owner ? { type: 'user', value: owner.id } : null;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    this.options.ensureLoaded();
    providePageContext(() => ({
      module: OBJECTIVES_MODULE,
      entityType: 'objective',
      entityId: this.id(),
      view: 'detail',
      title: this.objective()?.title ?? null,
      requirements: this.requirementRefs(),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected edit(): void {
    void this.router.navigate(this.editLink());
  }

  protected openClose(): void {
    const o = this.objective();
    this.closeStatus.set(null);
    this.closeNote.set(o?.closing_note ?? '');
    this.closeOpen.set(true);
  }

  protected askAi(): void {
    const o = this.objective();
    if (o) {
      this.ask.showWith(
        this.language.translate('objectives.ai.prompts.summariseObjective', {
          code: o.code,
          title: o.title,
        }),
      );
    }
  }

  /** "Is the result measurable?" (SMART check of the target). */
  protected askTarget(): void {
    const o = this.objective();
    if (o) {
      this.ask.showWith(
        this.language.translate('objectives.ai.prompts.askTarget', {
          title: o.title,
          target: o.target ?? '-',
        }),
      );
    }
  }

  protected activate(): void {
    this.patch({ status: 'active' }, 'objectives.notices.activated', () =>
      this.confirmActivate.set(false),
    );
  }

  protected close(): void {
    const status = this.closeStatus();
    if (!status) {
      return;
    }
    this.patch(
      { status, closing_note: textOrNull(this.closeNote()) },
      'objectives.notices.closed',
      () => this.closeOpen.set(false),
    );
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.delete(orgId, this.id()).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('objectives.notices.deleted');
        void this.router.navigate(['/objectives']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(objectivesErrorKey(error));
      },
    });
  }

  private patch(
    body: Parameters<ObjectivesApi['update']>[2],
    notice: string,
    done: () => void,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.update(orgId, this.id(), body).subscribe({
      next: (o) => {
        this.busy.set(false);
        done();
        this.objective.set(o);
        this.notifications.success(notice);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(objectivesErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, id).subscribe({
      next: (o) => {
        this.objective.set(o);
        this.state.set('ready');
      },
      error: (error: unknown) => this.state.set(isMissingRecord(error) ? 'error' : 'failed'),
    });
  }

  protected retry(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }
}
