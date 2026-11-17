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
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { Term } from '../../shared/guidance/term';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
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
 * `/objectives/:id`: an objective on the shared detail frame. What to do next,
 * the measurable result, progress (computed from the KPIs unless overridden),
 * where the objective comes from (policy, risks, …), the plan, how it was
 * communicated, its KPIs and how they are doing; closing as achieved / not
 * achieved from a dialog; and the shared tabs and aside (requirements it
 * documents, connections, create from here).
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
    WatchButton,
    AskAbout,
    Term,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    EntityTasks,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    FieldItem,
    FieldList,
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
          <app-record-detail-layout
            entityType="objective"
            [entityId]="o.id"
            [title]="o.title"
            [breadcrumbs]="breadcrumbs()"
            [tabs]="tabs"
            [requirementsPanel]="true"
            [canEdit]="o.can_edit"
            [fieldLabels]="fieldLabels"
          >
            <ng-container meta>
              <span class="font-mono">{{ o.code }}</span>
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
              @for (s of systems(); track s) {
                <span
                  class="rounded-full border border-border px-2 py-px text-micro font-semibold text-fg-muted"
                >
                  {{ 'objectives.managementSystemsShort.' + s | transloco }}
                </span>
              }
              @if (o.period_year) {
                <span class="text-meta text-fg-muted">
                  {{ 'objectives.filters.planYear' | transloco: { year: o.period_year } }}
                </span>
              }
            </ng-container>

            @if (o.can_edit) {
              <app-button primary (click)="edit()" data-testid="objective-edit">
                {{ 'objectives.detail.edit' | transloco }}
              </app-button>
            }
            @if (o.can_edit && !closed()) {
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
            <app-watch-button secondary entityType="objective" [entityId]="o.id" />
            <button appMenuItem overflow type="button" (click)="askAi()">
              {{ 'objectives.ai.summariseObjective' | transloco }}
            </button>
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

            <app-help-strip help [scope]="scope" page="detail" lesson="smart-objectives" />

            <div class="flex flex-col gap-4">
              @if (steps().length > 0 && o.can_edit) {
                <section
                  class="rounded-card border border-accent/30 bg-accent-soft p-4"
                  [attr.aria-label]="'objectives.next.label' | transloco"
                  data-testid="objective-next-steps"
                >
                  <h2 class="mb-2 font-display text-card font-bold text-fg">
                    {{ 'objectives.next.label' | transloco }}
                  </h2>
                  <ul class="flex flex-col gap-2">
                    @for (step of steps(); track step.key) {
                      <li
                        class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span class="text-ui text-fg">
                          {{ stepTextKey(step) | transloco: step.params ?? {} }}
                        </span>
                        <app-button
                          size="sm"
                          variant="secondary"
                          class="flex-none"
                          [attr.data-testid]="'next-' + step.key"
                          (click)="runStep(step)"
                        >
                          {{ 'objectives.next.' + step.key + '.cta' | transloco }}
                        </app-button>
                      </li>
                    }
                  </ul>
                </section>
              }

              <app-card>
                <div class="flex items-start justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'objectives.detail.targetHeading' | transloco }}
                  </h2>
                  <app-ask-about
                    field="target"
                    [fieldLabel]="'objectives.detail.targetHeading' | transloco"
                    labelKey="objectives.ai.askTarget"
                    [prompt]="askTargetPrompt()"
                    [requirements]="requirementRefs()"
                  />
                </div>
                @if (o.target) {
                  <p
                    class="mt-1 text-body whitespace-pre-line text-fg"
                    data-testid="objective-target"
                  >
                    {{ o.target }}
                  </p>
                } @else {
                  <p class="mt-1 text-body text-fg-muted">
                    {{ 'objectives.detail.noTarget' | transloco }}
                  </p>
                }
                @if (o.description) {
                  <div
                    class="cf-markdown mt-3 text-body text-fg-muted"
                    [innerHTML]="o.description | appMarkdown"
                  ></div>
                }
                <div class="mt-4 border-t border-border pt-3">
                  <p class="mb-1.5 text-meta font-semibold text-fg-muted">
                    {{ 'objectives.fields.progress' | transloco }}
                  </p>
                  <app-objective-progress [objective]="o" />
                  @if (o.progress_source === 'manual' && o.progress_note) {
                    <p class="mt-1 text-meta text-fg-muted">
                      {{ 'objectives.progress.reason' | transloco: { note: o.progress_note } }}
                    </p>
                  }
                </div>
              </app-card>

              <app-card [padded]="false">
                <div class="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2">
                  <div>
                    <h2 class="font-display text-card font-bold text-fg">
                      {{
                        'objectives.detail.kpisHeading' | transloco: { count: o.kpi_items.length }
                      }}
                    </h2>
                    <p class="text-meta text-fg-muted">
                      <app-term key="kpi" [scope]="scope">{{
                        'objectives.detail.kpisTerm' | transloco
                      }}</app-term>
                      {{ 'objectives.detail.kpisHint' | transloco }}
                    </p>
                  </div>
                  @if (o.can_edit) {
                    <a
                      [routerLink]="['/objectives/kpis/new']"
                      [queryParams]="{ objective: o.id }"
                      class="inline-flex min-h-9 items-center gap-1 rounded-tile px-2.5 py-1 text-ui font-semibold text-accent hover:bg-accent-soft"
                      data-testid="objective-add-kpi"
                    >
                      <app-icon name="plus" [size]="13" />
                      {{ 'objectives.detail.addKpi' | transloco }}
                    </a>
                  }
                </div>
                @if (o.kpi_items.length === 0) {
                  <p class="px-5 pb-4 text-body text-fg-muted">
                    {{ 'objectives.detail.noKpis' | transloco }}
                  </p>
                } @else {
                  <ul
                    class="divide-y divide-border border-t border-border"
                    data-testid="objective-kpis"
                  >
                    @for (k of o.kpi_items; track k.id) {
                      @let h = health(k.last_status);
                      <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                        <a
                          [routerLink]="['/objectives/kpis', k.id]"
                          class="min-w-0 flex-1 text-body font-semibold text-fg hover:underline"
                        >
                          <span class="font-mono text-meta text-fg-subtle">{{ k.code }}</span>
                          {{ k.name }}
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
              </app-card>

              <app-card>
                <app-field-list [columns]="2">
                  <app-field-item labelKey="objectives.fields.owner" [value]="o.owner?.name" />
                  <app-field-item labelKey="objectives.fields.department" [value]="department()" />
                  <app-field-item labelKey="objectives.fields.managementSystems" empty="none">
                    @if (systems().length) {
                      {{ systemNames() }}
                    }
                  </app-field-item>
                  <app-field-item
                    labelKey="objectives.fields.periodYear"
                    [value]="o.period_year ?? null"
                  />
                  <app-field-item
                    labelKey="objectives.fields.startDate"
                    [value]="o.start_date | localDay"
                  />
                  <app-field-item labelKey="objectives.fields.dueDate">
                    @if (o.due_date) {
                      <span [class.text-warn-ink]="o.overdue" [class.font-semibold]="o.overdue">
                        {{ o.due_date | localDay }}
                        @if (o.overdue) {
                          · {{ 'objectives.common.overdue' | transloco }}
                        }
                      </span>
                    }
                  </app-field-item>
                  <app-field-item labelKey="objectives.fields.approvedBy">
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
                </app-field-list>
              </app-card>

              <app-card data-testid="objective-origins">
                <h2 class="font-display text-card font-bold text-fg">
                  {{ 'objectives.origins.heading' | transloco }}
                </h2>
                <p class="mt-0.5 text-meta text-fg-muted">
                  {{ 'objectives.origins.hint' | transloco }}
                </p>
                @if (o.origins?.length) {
                  <ul class="mt-3 flex flex-col gap-1.5">
                    @for (ref of o.origins; track ref.entity_type + ref.entity_id) {
                      <li><app-entity-chip [ref]="ref" /></li>
                    }
                  </ul>
                } @else {
                  <p class="mt-3 text-ui text-fg-muted">
                    {{ 'objectives.origins.empty' | transloco }}
                  </p>
                  @if (o.can_edit) {
                    <app-button size="sm" variant="ghost" class="mt-2" (click)="edit('origins')">
                      <app-icon name="plus" [size]="14" />
                      {{ 'objectives.origins.addCta' | transloco }}
                    </app-button>
                  }
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'objectives.detail.planHeading' | transloco }}
                </h2>
                <app-field-list [columns]="1">
                  <app-field-item
                    labelKey="objectives.detail.planActions"
                    [value]="o.plan"
                    [multiline]="true"
                  />
                  <app-field-item
                    labelKey="objectives.detail.planResources"
                    [value]="o.resources"
                    [multiline]="true"
                  />
                  <app-field-item
                    labelKey="objectives.detail.planEvaluation"
                    [value]="o.evaluation_method"
                    [multiline]="true"
                  />
                </app-field-list>
              </app-card>

              <app-card>
                <h2 class="font-display text-card font-bold text-fg">
                  {{ 'objectives.detail.communicationHeading' | transloco }}
                </h2>
                <p class="mt-0.5 mb-3 text-meta text-fg-muted">
                  {{ 'objectives.detail.communicationHint' | transloco }}
                </p>
                <app-field-list [columns]="2">
                  <app-field-item
                    labelKey="objectives.fields.communicatedTo"
                    [value]="o.communicated_to ?? null"
                    [multiline]="true"
                  />
                  <app-field-item
                    labelKey="objectives.fields.lastCommunicatedOn"
                    [value]="o.last_communicated_on | localDay"
                  />
                </app-field-list>
              </app-card>

              @if (o.closed_at || o.closing_note) {
                <app-card>
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'objectives.fields.closingNote' | transloco }}
                  </h2>
                  @if (o.closed_at) {
                    <p class="text-meta text-fg-subtle">
                      {{
                        'objectives.detail.closedAt'
                          | transloco: { date: (o.closed_at | localDate) }
                      }}
                    </p>
                  }
                  <p class="mt-1 text-body whitespace-pre-line text-fg">
                    {{ o.closing_note || ('common.empty.notSet' | transloco) }}
                  </p>
                </app-card>
              }
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="objective"
                [entityId]="o.id"
                [canCreate]="o.can_edit"
                [defaultAssignee]="defaultAssignee()"
                [entityLabel]="o.code + ' ' + o.title"
              />
            </div>

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
  protected readonly steps = computed(() => {
    const o = this.objective();
    return o ? nextSteps(o) : [];
  });
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
  protected readonly askTargetPrompt = computed(() =>
    this.language.translate('objectives.ai.prompts.askTarget', {
      title: this.objective()?.title ?? '-',
      target: this.objective()?.target ?? '-',
    }),
  );

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

  protected edit(focus?: string): void {
    void this.router.navigate(['/objectives', this.id(), 'edit'], {
      queryParams: focus ? { focus } : {},
    });
  }

  protected runStep(step: NextStep): void {
    switch (step.key) {
      case 'activate':
        this.confirmActivate.set(true);
        break;
      case 'close':
        this.openClose();
        break;
      case 'addKpi':
        void this.router.navigate(['/objectives/kpis/new'], {
          queryParams: { objective: this.id() },
        });
        break;
      case 'attention': {
        const kpi = this.objective()?.kpi_items.find(
          (k) => k.last_status === 'at_risk' || k.last_status === 'off_track',
        );
        if (kpi) {
          void this.router.navigate(['/objectives/kpis', kpi.id]);
        }
        break;
      }
      case 'origins':
        this.edit('origins');
        break;
      case 'systems':
        this.edit('systems');
        break;
      case 'communicate':
        this.edit('communication');
        break;
    }
  }

  protected stepTextKey(step: NextStep): string {
    const base = `objectives.next.${step.key}.text`;
    return step.key === 'attention' ? countKey(base, Number(step.params?.['count'])) : base;
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
