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
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RequirementLink } from '../../../core/standards/standards.models';
import { OutputsPanel } from '../../../shared/outputs';
import { WatchButton } from '../../../shared/activity/watch-button';
import { Term } from '../../../shared/guidance/term';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import { Consultation, ConsultationHoldAction, UserRef } from '../data/hse.models';
import {
  consultationStatusValue,
  dayEndToWire,
  localInputToWire,
  textOrNull,
  wireToLocalInput,
} from '../hse-format';
import { HsePeoplePicker, NO_PEOPLE, PeopleValue, peopleCount } from '../shared/people-picker';
import {
  HSE_CRUMBS,
  HSE_MODULE,
  HSE_NAV,
  HSE_ROOT_CRUMB,
  HseAskButton,
  HseDirectorySelect,
  HseField,
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
];

/** The current local time as a `datetime-local` value. */
function nowLocalInput(): string {
  return wireToLocalInput(new Date().toISOString().slice(0, 19));
}

/** One decision row in the "mark as held" panel; it becomes a follow-up task. */
export interface ActionDraft {
  readonly key: number;
  title: string;
  assignee: string;
  due: string;
}

let nextKey = 0;
export function actionDraft(): ActionDraft {
  return { key: ++nextKey, title: '', assignee: '', due: '' };
}

/** Decision rows with a title -> the hold request's `actions`. */
export function actionsFromDrafts(drafts: readonly ActionDraft[]): ConsultationHoldAction[] {
  return drafts
    .filter((d) => d.title.trim())
    .map((d) => ({
      title: d.title.trim(),
      assignee_user_id: d.assignee || null,
      due_at: dayEndToWire(d.due),
    }));
}

/** Members and external names as one display list. */
export function peopleNames(users: readonly UserRef[] | undefined, names: readonly string[]) {
  return [...(users ?? []).map((u) => u.name), ...names];
}

/**
 * `/hse/consultations/:id`: a worker consultation ("medvirkningsmøte"). Follows
 * the route id. Header: code, kind and status; "Mark as held" as primary while
 * planned, Edit, "Lag ny fra denne" (task, deviation, risk), cancel and delete
 * under "Mer". Body: when, where and who (members and worker representatives),
 * the topics, and once held the summary, the decisions and their follow-up
 * tasks (open / overdue / done). The "mark as held" panel records who took part
 * and turns each decision into a task with an owner and a due date.
 */
@Component({
  selector: 'app-consultation-detail',
  imports: [
    OutputsPanel,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    SlideOver,
    StatusBadge,
    RecordDetailLayout,
    EntityTasks,
    SupportsRequirements,
    Term,
    WatchButton,
    WhyItMatters,
    HseAskButton,
    HseDirectorySelect,
    HseField,
    HsePeoplePicker,
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
            <a
              routerLink="/hse/consultations"
              class="text-ui font-semibold text-accent hover:underline"
              >{{ 'hse.consultation.list.back' | transloco }}</a
            >
          </p>
        </div>
      }
      @case ('ready') {
        @if (record(); as c) {
          <app-record-detail-layout
            entityType="worker_consultation"
            [entityId]="c.id"
            [title]="c.title"
            [breadcrumbs]="breadcrumbs()"
            [tabs]="tabs"
            [counts]="{ tasks: c.actions?.total ?? 0 }"
            [canEdit]="perms.write()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ c.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'hse.consultation.kind.' + c.kind | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="statusValue(c.status)"
                [labelKey]="'hse.consultation.status.' + c.status"
              />
            </ng-container>

            @if (perms.write() && c.status === 'planned') {
              <app-button primary (click)="openHold(c)" data-testid="wc-hold">
                {{ 'hse.consultation.actions.hold' | transloco }}
              </app-button>
            }
            @if (perms.write() && c.status === 'planned') {
              <app-button secondary variant="secondary" (click)="edit(c)" data-testid="wc-edit">
                {{ 'hse.common.edit' | transloco }}
              </app-button>
            } @else if (perms.write() && c.status === 'held') {
              <app-button primary variant="secondary" (click)="edit(c)" data-testid="wc-edit">
                {{ 'hse.common.edit' | transloco }}
              </app-button>
            }
            @if (perms.write() && c.status === 'planned') {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="cancelOpen.set(true)"
                data-testid="wc-cancel"
              >
                {{ 'hse.consultation.actions.cancel' | transloco }}
              </button>
            }
            @if (perms.manage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="deleteOpen.set(true)"
                data-testid="wc-delete"
              >
                {{ 'hse.common.delete' | transloco }}
              </button>
            }

            <app-module-nav nav class="mb-4 block" [items]="nav" labelKey="modules.names.hse" />
            <app-help-strip
              help
              scope="hse"
              page="consultation-detail"
              lesson="worker-participation"
              [subject]="c.title"
            />

            <div class="flex flex-col gap-5">
              @if (c.status === 'held' && !c.worker_representative_present) {
                <p
                  class="flex gap-2 rounded-tile border border-warn/40 bg-warn-soft px-4 py-3 text-ui text-warn-ink"
                  role="status"
                >
                  <app-icon name="alert" [size]="15" class="mt-0.5 flex-none" />
                  <span>{{ 'hse.consultation.detail.noRepWarning' | transloco }}</span>
                </p>
              }
              @if (c.status === 'planned' && scheduledPassed()) {
                <p
                  class="flex gap-2 rounded-tile border border-warn/40 bg-warn-soft px-4 py-3 text-ui text-warn-ink"
                  role="status"
                  data-testid="wc-unrecorded"
                >
                  <app-icon name="clock" [size]="15" class="mt-0.5 flex-none" />
                  <span>{{ 'hse.consultation.detail.unrecorded' | transloco }}</span>
                </p>
              }

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'hse.consultation.detail.aboutTitle' | transloco }}
                </h2>
                <app-field-list>
                  <app-field-item labelKey="hse.consultation.fields.scheduled_at">
                    @if (c.scheduled_at) {
                      {{ c.scheduled_at | localDate }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="hse.consultation.fields.held_at">
                    @if (c.held_at) {
                      {{ c.held_at | localDate }}
                    }
                  </app-field-item>
                  <app-field-item
                    labelKey="hse.consultation.fields.location"
                    [value]="c.location"
                  />
                  <app-field-item
                    labelKey="hse.consultation.fields.owner"
                    [value]="c.owner?.name"
                  />
                  <app-field-item labelKey="hse.common.department" [value]="department()" />
                  <app-field-item labelKey="hse.consultation.detail.repPresent">
                    <app-term key="worker-representative" scope="hse">{{
                      (c.worker_representative_present ? 'hse.common.yes' : 'hse.common.no')
                        | transloco
                    }}</app-term>
                  </app-field-item>
                  <app-field-item
                    labelKey="hse.consultation.fields.participants"
                    empty="none"
                    [wide]="true"
                  >
                    @if (participantNames().length) {
                      {{ participantNames().join(', ') }}
                    }
                  </app-field-item>
                  <app-field-item
                    labelKey="hse.consultation.fields.worker_representatives"
                    empty="none"
                    [wide]="true"
                  >
                    @if (repNames().length) {
                      {{ repNames().join(', ') }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="hse.consultation.fields.topics" [wide]="true">
                    @if (c.topics) {
                      <div class="cf-prose" [innerHTML]="c.topics | appMarkdown"></div>
                    }
                  </app-field-item>
                </app-field-list>
              </app-card>

              @if (c.status === 'held') {
                <app-card data-testid="wc-outcome">
                  <h2 class="mb-2 font-display text-card font-bold text-fg">
                    {{ 'hse.consultation.fields.summary' | transloco }}
                  </h2>
                  @if (c.summary) {
                    <div
                      class="cf-prose text-ui text-fg"
                      [innerHTML]="c.summary | appMarkdown"
                    ></div>
                  } @else {
                    <p class="text-ui text-fg-muted">{{ 'hse.common.notSet' | transloco }}</p>
                  }
                  <h2 class="mt-5 mb-2 font-display text-card font-bold text-fg">
                    {{ 'hse.consultation.fields.decisions' | transloco }}
                  </h2>
                  @if (c.decisions) {
                    <div
                      class="cf-prose text-ui text-fg"
                      [innerHTML]="c.decisions | appMarkdown"
                    ></div>
                  } @else {
                    <p class="text-ui text-fg-muted">{{ 'hse.common.notSet' | transloco }}</p>
                  }
                  <div class="mt-4 rounded-tile border border-border bg-surface-2 px-3 py-2.5">
                    <h3 class="text-ui font-semibold text-fg">
                      {{ 'hse.consultation.detail.followUp' | transloco }}
                    </h3>
                    @if (c.actions?.total) {
                      <p class="mt-0.5 text-meta text-fg-muted" data-testid="wc-action-counts">
                        {{
                          'hse.consultation.detail.actionCounts'
                            | transloco
                              : {
                                  open: c.actions.open,
                                  overdue: c.actions.overdue,
                                  done: c.actions.done,
                                }
                        }}
                      </p>
                    } @else {
                      <p class="mt-0.5 text-meta text-fg-muted">
                        {{ 'hse.consultation.detail.noActions' | transloco }}
                      </p>
                    }
                  </div>
                </app-card>
              }

              <div
                class="flex flex-wrap gap-2"
                role="group"
                [attr.aria-label]="'hse.common.askGroup' | transloco"
              >
                <app-hse-ask-button
                  labelKey="hse.common.summarise"
                  promptKey="hse.consultation.ai.summarisePrompt"
                  [params]="{ code: c.code }"
                  [requirements]="confirmedRefs()"
                />
              </div>
            </div>

            <section class="mt-6" data-testid="consultation-documents">
              <h2 class="font-display text-card font-bold text-fg">
                {{ 'hse.common.documentsTitle' | transloco }}
              </h2>
              <p class="mt-0.5 mb-3 text-ui text-fg-muted">
                {{ 'hse.common.documentsHint' | transloco }}
              </p>
              <app-outputs-panel entityType="worker_consultation" [entityId]="c.id" />
            </section>

            <div tasks>
              <app-entity-tasks
                entityType="worker_consultation"
                [entityId]="c.id"
                [canCreate]="perms.write()"
                [entityLabel]="c.code + ' ' + c.title"
              />
            </div>

            <app-supports-requirements
              aside-requirements
              entityType="worker_consultation"
              [entityId]="c.id"
              [canEdit]="perms.write()"
              [frameworks]="frameworks"
              (linksChange)="onLinks($event)"
            />

            <div aside>
              <app-card>
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'hse.common.summaryTitle' | transloco }}
                  </h2>
                  <app-watch-button entityType="worker_consultation" [entityId]="c.id" />
                </div>
                <app-field-list [columns]="1">
                  <app-field-item labelKey="hse.common.createdBy">
                    {{
                      'hse.common.byOn'
                        | transloco
                          : {
                              name: c.created_by?.name || ('hse.common.unknown' | transloco),
                              date: (c.created_at | localDay),
                            }
                    }}
                  </app-field-item>
                  <app-field-item
                    labelKey="hse.common.updated"
                    [value]="c.updated_at | localDate"
                  />
                </app-field-list>
              </app-card>
            </div>

            <div aside-learn>
              <app-why-it-matters scope="hse" page="consultation-detail" />
            </div>
          </app-record-detail-layout>

          <app-slide-over
            [open]="holdOpen()"
            [title]="'hse.consultation.hold.title' | transloco"
            [subtitle]="c.code + ' · ' + c.title"
            [closeLabel]="'hse.common.close' | transloco"
            [width]="560"
            (closed)="holdOpen.set(false)"
          >
            <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); hold()" novalidate>
              <app-hse-field labelKey="hse.consultation.fields.held_at" inputId="hold-at">
                <input
                  id="hold-at"
                  type="datetime-local"
                  [value]="heldAt()"
                  (input)="heldAt.set($any($event.target).value)"
                />
              </app-hse-field>
              <app-hse-field
                labelKey="hse.consultation.fields.participants"
                inputId="hold-participants"
                hintKey="hse.people.hint"
              >
                <app-hse-people-picker
                  inputId="hold-participants"
                  labelKey="hse.consultation.fields.participants"
                  [value]="participants()"
                  [known]="c.participant_users ?? []"
                  (valueChange)="participants.set($event)"
                />
              </app-hse-field>
              <app-hse-field
                labelKey="hse.consultation.fields.worker_representatives"
                inputId="hold-reps"
                hintKey="hse.consultation.edit.repsHint"
              >
                <app-hse-people-picker
                  inputId="hold-reps"
                  labelKey="hse.consultation.fields.worker_representatives"
                  [value]="reps()"
                  [known]="c.representative_users ?? []"
                  (valueChange)="reps.set($event)"
                  testId="hold-reps-picker"
                />
              </app-hse-field>
              <label class="flex min-h-8 items-start gap-2 text-body text-fg">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                  [checked]="repPresentShown()"
                  [disabled]="hasReps()"
                  (change)="repPresent.set($any($event.target).checked)"
                />
                <span>
                  {{ 'hse.consultation.fields.worker_representative_present' | transloco }}
                  @if (hasReps()) {
                    <span class="block text-meta text-fg-muted">{{
                      'hse.consultation.edit.repAuto' | transloco
                    }}</span>
                  }
                </span>
              </label>
              <app-hse-field
                labelKey="hse.consultation.fields.summary"
                inputId="hold-summary"
                page="consultation-detail"
                help="summary"
              >
                <textarea
                  id="hold-summary"
                  rows="4"
                  [value]="summary()"
                  (input)="summary.set($any($event.target).value)"
                ></textarea>
              </app-hse-field>
              <app-hse-field
                labelKey="hse.consultation.fields.decisions"
                inputId="hold-decisions"
                page="consultation-detail"
                help="decisions"
              >
                <textarea
                  id="hold-decisions"
                  rows="3"
                  [value]="decisions()"
                  (input)="decisions.set($any($event.target).value)"
                ></textarea>
              </app-hse-field>
              <fieldset class="rounded-tile border border-border p-3" data-testid="hold-actions">
                <legend class="px-1 text-ui font-semibold text-fg-muted">
                  {{ 'hse.consultation.hold.actionsTitle' | transloco }}
                </legend>
                <p class="mb-3 text-meta text-fg-muted">
                  {{ 'hse.consultation.hold.actionsHint' | transloco }}
                </p>
                <ul class="flex flex-col gap-3">
                  @for (a of actionRows(); track a.key; let i = $index) {
                    <li
                      class="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0"
                    >
                      <label class="sr-only" [attr.for]="'act-title-' + a.key">{{
                        'hse.consultation.hold.actionN' | transloco: { n: i + 1 }
                      }}</label>
                      <div class="flex gap-2">
                        <input
                          class="cf-input min-w-0 flex-1"
                          [id]="'act-title-' + a.key"
                          type="text"
                          maxlength="255"
                          [placeholder]="'hse.consultation.hold.actionPlaceholder' | transloco"
                          [value]="a.title"
                          (input)="patchAction(i, { title: $any($event.target).value })"
                        />
                        <button
                          type="button"
                          class="inline-flex h-10 w-10 flex-none items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fail"
                          [attr.aria-label]="
                            'hse.consultation.hold.removeAction' | transloco: { n: i + 1 }
                          "
                          (click)="removeAction(i)"
                        >
                          <app-icon name="x" [size]="14" />
                        </button>
                      </div>
                      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <app-hse-directory-select
                          class="cf-select"
                          [inputId]="'act-who-' + a.key"
                          kind="user"
                          noneKey="hse.consultation.hold.noAssignee"
                          [ariaLabel]="'hse.consultation.hold.assigneeN' | transloco: { n: i + 1 }"
                          [value]="a.assignee"
                          (valueChange)="patchAction(i, { assignee: $event })"
                        />
                        <input
                          class="cf-input"
                          type="date"
                          [attr.aria-label]="'hse.consultation.hold.dueN' | transloco: { n: i + 1 }"
                          [value]="a.due"
                          (input)="patchAction(i, { due: $any($event.target).value })"
                        />
                      </div>
                    </li>
                  }
                </ul>
                <div class="mt-2">
                  <app-button variant="ghost" size="sm" (click)="addAction()">
                    <app-icon name="plus" [size]="13" />
                    {{ 'hse.consultation.hold.addAction' | transloco }}
                  </app-button>
                </div>
              </fieldset>
              <div class="flex justify-end gap-2">
                <app-button variant="secondary" (click)="holdOpen.set(false)">{{
                  'hse.common.cancel' | transloco
                }}</app-button>
                <app-button type="submit" [loading]="busy()" [disabled]="busy()">{{
                  'hse.consultation.actions.hold' | transloco
                }}</app-button>
              </div>
            </form>
          </app-slide-over>

          <app-confirm-dialog
            [open]="cancelOpen()"
            [title]="'hse.consultation.cancelTitle' | transloco"
            [message]="'hse.consultation.cancelMessage' | transloco: { code: c.code }"
            [confirmLabel]="'hse.consultation.actions.cancel' | transloco"
            [cancelLabel]="'hse.common.keep' | transloco"
            [busy]="busy()"
            (confirmed)="cancel()"
            (cancelled)="cancelOpen.set(false)"
          />
          <app-confirm-dialog
            [open]="deleteOpen()"
            [title]="'hse.consultation.deleteTitle' | transloco"
            [message]="'hse.consultation.deleteMessage' | transloco: { code: c.code }"
            [confirmLabel]="'hse.common.delete' | transloco"
            [cancelLabel]="'hse.common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="deleteOpen.set(false)"
          />
        }
      }
    }
  `,
  styles: [
    `
      .cf-input,
      .cf-select ::ng-deep select {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
      }
      .cf-input:focus,
      .cf-select ::ng-deep select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class ConsultationDetail {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly directory = inject(AssigneeOptionsService);

  /** Route param (component input binding): follows navigation between records. */
  readonly id = input.required<string>();

  protected readonly perms = injectHsePermissions();
  protected readonly nav = HSE_NAV;
  protected readonly tabs = TABS;
  protected readonly frameworks: readonly string[] = ['iso45001'];
  protected readonly statusValue = consultationStatusValue;

  protected readonly record = signal<Consultation | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly busy = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly confirmedRefs = signal<readonly string[]>([]);

  protected readonly holdOpen = signal(false);
  protected readonly heldAt = signal('');
  protected readonly summary = signal('');
  protected readonly decisions = signal('');
  protected readonly participants = signal<PeopleValue>(NO_PEOPLE);
  protected readonly reps = signal<PeopleValue>(NO_PEOPLE);
  protected readonly repPresent = signal(false);
  protected readonly actionRows = signal<ActionDraft[]>([actionDraft()]);

  protected readonly hasReps = computed(() => peopleCount(this.reps()) > 0);
  protected readonly repPresentShown = computed(() => this.hasReps() || this.repPresent());

  protected readonly breadcrumbs = computed(() => [
    HSE_ROOT_CRUMB,
    HSE_CRUMBS.consultations,
    { label: this.record()?.code ?? '' },
  ]);
  protected readonly department = computed(() =>
    departmentName(this.directory, this.record()?.department_id ?? null),
  );
  protected readonly participantNames = computed(() => {
    const c = this.record();
    return c ? peopleNames(c.participant_users, c.participants) : [];
  });
  protected readonly repNames = computed(() => {
    const c = this.record();
    return c ? peopleNames(c.representative_users, c.worker_representatives) : [];
  });
  /** A planned consultation whose date has passed: it should be recorded as held. */
  protected readonly scheduledPassed = computed(() => {
    const at = this.record()?.scheduled_at;
    return !!at && new Date(/[zZ]$/.test(at) ? at : `${at}Z`).getTime() < Date.now();
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'worker_consultation',
      entityId: this.id(),
      view: 'detail',
      title: this.record()?.title ?? null,
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
    if (this.record()?.id !== id) {
      this.record.set(null);
      this.confirmedRefs.set([]);
      this.state.set('loading');
    }
    this.request = this.api.getConsultation(orgId, id).subscribe({
      next: (c) => {
        this.record.set(c);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected onLinks(links: readonly RequirementLink[]): void {
    this.confirmedRefs.set(
      links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
    );
  }

  protected edit(c: Consultation): void {
    void this.router.navigate(['/hse/consultations', c.id, 'edit']);
  }

  protected openHold(c: Consultation): void {
    this.heldAt.set(nowLocalInput());
    this.summary.set(c.summary ?? '');
    this.decisions.set(c.decisions ?? '');
    this.participants.set({
      userIds: (c.participant_users ?? []).map((u) => u.id),
      names: [...(c.participants ?? [])],
    });
    this.reps.set({
      userIds: (c.representative_users ?? []).map((u) => u.id),
      names: [...(c.worker_representatives ?? [])],
    });
    this.repPresent.set(c.worker_representative_present);
    this.actionRows.set([actionDraft()]);
    this.holdOpen.set(true);
  }

  protected addAction(): void {
    this.actionRows.update((rows) => [...rows, actionDraft()]);
  }

  protected removeAction(index: number): void {
    this.actionRows.update((rows) => {
      const next = rows.filter((_, i) => i !== index);
      return next.length ? next : [actionDraft()];
    });
  }

  protected patchAction(index: number, patch: Partial<Omit<ActionDraft, 'key'>>): void {
    this.actionRows.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  protected hold(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.record();
    if (!orgId || !c || this.busy()) {
      return;
    }
    const people = this.participants();
    const reps = this.reps();
    const actions = actionsFromDrafts(this.actionRows());
    this.busy.set(true);
    this.api
      .holdConsultation(orgId, c.id, {
        held_at: localInputToWire(this.heldAt()),
        summary: textOrNull(this.summary()),
        decisions: textOrNull(this.decisions()),
        participants: [...people.names],
        participant_user_ids: [...people.userIds],
        worker_representatives: [...reps.names],
        representative_user_ids: [...reps.userIds],
        worker_representative_present: this.repPresentShown(),
        actions: actions.length ? actions : undefined,
      })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.holdOpen.set(false);
          this.record.set(updated);
          this.notifications.success(
            actions.length ? 'hse.consultation.done.heldWithActions' : 'hse.consultation.done.held',
            { code: updated.code, count: actions.length },
          );
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  protected cancel(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.record();
    if (!orgId || !c || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.cancelConsultation(orgId, c.id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.cancelOpen.set(false);
        this.record.set(updated);
        this.notifications.success('hse.consultation.done.cancelled', { code: updated.code });
      },
      error: (error: unknown) => {
        this.cancelOpen.set(false);
        this.fail(error);
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.record();
    if (!orgId || !c || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteConsultation(orgId, c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.notifications.success('hse.common.deleted', { code: c.code });
        void this.router.navigate(['/hse/consultations']);
      },
      error: (error: unknown) => {
        this.deleteOpen.set(false);
        this.fail(error);
      },
    });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.notifications.error(hseErrorKey(error));
  }
}
