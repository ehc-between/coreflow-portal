import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import {
  OPEN_TASK_STATUSES,
  TASK_PRIORITIES,
  Task,
  TaskPriority,
  TaskStatus,
} from '../../../core/tasks/task.models';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { AssigneeSelect } from '../../../shared/tasks/assignee-select';
import { RecurrencePicker } from '../../../shared/tasks/recurrence-picker';
import {
  decodeAssignee,
  dueAtFromDay,
  startOfDay,
  todayDay,
} from '../../../shared/tasks/task-display';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import { HseLang, SafetyRoundCreate, SafetyWalk, SafetyWalkList } from '../data/hse.models';
import { linesToList, listToLines, roundStatusValue, textOrNull } from '../hse-format';
import {
  HSE_MODULE,
  HSE_NAV,
  HSE_ROOT_CRUMB,
  HseField,
  injectHsePermissions,
} from '../shared/hse-shared';
import { DateInput } from '../../../shared/ui/date-input/date-input';

const PAGE_SIZE = 25;
type RoundFilter = 'open' | 'all';
type Schedule = 'once' | 'recurring';

/** The plan form -> the create request (one-off with a due date, or recurring). */
export function safetyRoundBody(form: {
  title: string;
  description: string;
  location: string;
  assignee: string;
  schedule: Schedule;
  dueDay: string;
  rrule: string;
  startDay: string;
  leadDays: number;
  checklist: string;
  priority: TaskPriority;
  lang: HseLang;
}): SafetyRoundCreate {
  const checklist = linesToList(form.checklist);
  const base: SafetyRoundCreate = {
    title: form.title.trim(),
    description: textOrNull(form.description),
    location: textOrNull(form.location),
    assignee: decodeAssignee(form.assignee),
    priority: form.priority,
    lang: form.lang,
    checklist: checklist.length ? checklist : undefined,
  };
  return form.schedule === 'recurring'
    ? {
        ...base,
        rrule: form.rrule,
        dtstart: startOfDay(form.startDay || todayDay()),
        lead_days: form.leadDays,
      }
    : { ...base, due_at: dueAtFromDay(form.dueDay) };
}

/** "3 funn, 1 åpent" / "Ingen funn" for a safety walk row. */
export function findingsKey(walk: SafetyWalk): { key: string; params: Record<string, number> } {
  if (!walk.finding_count) {
    return { key: 'hse.rounds.walks.noFindings', params: {} };
  }
  return {
    key: 'hse.rounds.walks.findings',
    params: { count: walk.finding_count, open: walk.open_finding_count },
  };
}

/**
 * `/hse/safety-rounds` ("Vernerunder"). A safety round is carried out in
 * Inspections with the safety-walk checklist, so each finding can become a
 * deviation: "Gjennomfør en vernerunde" opens that form, and the list shows
 * every round done that way with its findings. Planning keeps the reminder
 * side: `hse:manage` holders plan one-off or recurring rounds (tasks with the
 * standard checklist) that tell someone when the next round is due.
 * `?plan=1` (from the overview) opens the plan panel.
 */
@Component({
  selector: 'app-safety-rounds',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    PageHeader,
    Pager,
    RecordRow,
    RecordRowHeader,
    SlideOver,
    StatusBadge,
    AssigneeSelect,
    RecurrencePicker,
    TeachingEmpty,
    WhyItMatters,
    HseField,
    DateInput,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="hse.rounds.title"
        descriptionKey="hse.rounds.subtitle"
        [breadcrumbs]="crumbs"
      >
        @if (walkNewUrl(); as url) {
          <a primary [routerLink]="url.path" [queryParams]="url.query" tabindex="-1">
            <app-button data-testid="rounds-walk-new">
              <app-icon name="plus" [size]="15" />
              {{ 'hse.rounds.walks.new' | transloco }}
            </app-button>
          </a>
        }
        @if (perms.manage()) {
          <app-button
            secondary
            [variant]="walkNewUrl() ? 'secondary' : 'primary'"
            (click)="openPlan()"
            data-testid="rounds-plan"
          >
            <app-icon name="calendar" [size]="15" />
            {{ 'hse.rounds.plan' | transloco }}
          </app-button>
        }
      </app-page-header>
      <app-module-nav class="mb-4 block" [items]="nav" labelKey="modules.names.hse" />
      <app-help-strip scope="hse" page="safety-rounds" />

      <section class="mb-8" aria-labelledby="hse-walks" data-testid="rounds-walks">
        <h2 id="hse-walks" class="mb-1 font-display text-section font-bold text-fg">
          {{ 'hse.rounds.walks.title' | transloco }}
        </h2>
        <p class="mb-3 text-meta text-fg-muted">{{ 'hse.rounds.walks.hint' | transloco }}</p>
        @switch (walksState()) {
          @case ('loading') {
            <app-loading-state [rows]="3" />
          }
          @case ('error') {
            <app-error-state (retry)="reloadWalks()" />
          }
          @default {
            @if (walks(); as w) {
              @if (!w.available) {
                <app-card>
                  <p class="text-ui text-fg-muted" data-testid="rounds-walks-unavailable">
                    {{ 'hse.rounds.walks.unavailable' | transloco }}
                  </p>
                </app-card>
              } @else if (w.items.length === 0) {
                <app-card>
                  <p class="text-ui text-fg-muted">{{ 'hse.rounds.walks.empty' | transloco }}</p>
                </app-card>
              } @else {
                <app-card [padded]="false">
                  <div role="list">
                    <app-record-row-header dateKind="due" [coverage]="false" />
                    @for (walk of w.items; track walk.id) {
                      @let f = findings(walk);
                      <app-record-row
                        [code]="walk.code"
                        [title]="walk.title"
                        [subtitle]="walk.location"
                        [link]="walk.url"
                        [owner]="walk.inspector?.name"
                        [date]="walk.completed_at || walk.due_at"
                        dateKind="due"
                        [overdue]="walk.overdue"
                      >
                        <app-status-badge badges meaning="lifecycle" [value]="walk.status" />
                        <app-status-badge
                          badges
                          [meaning]="walk.open_finding_count ? 'lifecycle' : 'progress'"
                          [value]="walk.open_finding_count ? 'open' : '100'"
                          [labelKey]="f.key"
                          [labelParams]="f.params"
                        />
                      </app-record-row>
                    }
                  </div>
                </app-card>
                @if (w.total > w.items.length) {
                  <p class="mt-2 text-meta text-fg-muted">
                    {{ 'hse.rounds.walks.more' | transloco: { count: w.total - w.items.length } }}
                    <a
                      routerLink="/inspections"
                      class="font-semibold text-accent hover:underline"
                      >{{ 'hse.rounds.walks.openInspections' | transloco }}</a
                    >
                  </p>
                }
              }
            }
          }
        }
      </section>

      <section aria-labelledby="hse-planned" data-testid="rounds-planned">
        <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 id="hse-planned" class="font-display text-section font-bold text-fg">
            {{ 'hse.rounds.plannedTitle' | transloco }}
          </h2>
          <div class="flex gap-2" role="group" [attr.aria-label]="'hse.common.status' | transloco">
            @for (f of roundFilters; track f) {
              <button
                type="button"
                class="h-9 rounded-tile border px-3 text-ui font-semibold"
                [class]="
                  filter() === f
                    ? 'border-accent-border bg-accent-soft text-accent'
                    : 'border-border bg-bg text-fg-muted hover:text-fg'
                "
                [attr.aria-pressed]="filter() === f"
                (click)="setFilter(f)"
              >
                {{ 'hse.rounds.filter.' + f | transloco }}
              </button>
            }
          </div>
        </div>
        <p class="mb-3 text-meta text-fg-muted">{{ 'hse.rounds.plannedHint' | transloco }}</p>

        @if (state() === 'loading' && items().length === 0) {
          <app-loading-state [rows]="3" />
        } @else if (state() === 'error') {
          <app-error-state (retry)="reload()" />
        } @else if (items().length === 0) {
          <app-card>
            <app-teaching-empty
              scope="hse"
              page="safety-rounds"
              [showAction]="perms.manage()"
              (action)="openPlan()"
            />
          </app-card>
        } @else {
          <app-card [padded]="false">
            <div role="list" data-testid="round-rows">
              <app-record-row-header dateKind="due" [coverage]="false" />
              @for (task of items(); track task.id) {
                <app-record-row
                  [title]="task.title"
                  [subtitle]="roundSubtitle(task)"
                  [link]="['/tasks', task.id]"
                  [owner]="task.assignee?.name || ('hse.rounds.unassigned' | transloco)"
                  [date]="task.due_at"
                  dateKind="due"
                  [overdue]="task.overdue"
                >
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    [value]="roundValue(task)"
                    [labelKey]="
                      task.overdue ? 'hse.rounds.overdue' : 'hse.rounds.status.' + task.status
                    "
                  />
                </app-record-row>
              }
            </div>
          </app-card>
          <div class="mt-3">
            <app-pager
              [offset]="offset()"
              [pageSize]="pageSize"
              [count]="items().length"
              [total]="total()"
              (pageChange)="offset.set($event)"
            />
          </div>
        }
      </section>

      <div class="mt-8"><app-why-it-matters scope="hse" page="safety-rounds" /></div>
    </div>

    <app-slide-over
      [open]="planOpen()"
      [title]="'hse.rounds.planTitle' | transloco"
      [subtitle]="'hse.rounds.planSubtitle' | transloco"
      [closeLabel]="'hse.common.close' | transloco"
      [width]="560"
      (closed)="planOpen.set(false)"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); plan()" novalidate>
        <app-hse-field
          labelKey="hse.rounds.fields.title"
          inputId="round-title"
          page="safety-rounds"
          [required]="true"
          [errorKey]="tried() && !title().trim() ? 'hse.errors.title_required' : null"
        >
          <input
            id="round-title"
            type="text"
            maxlength="255"
            required
            [value]="title()"
            (input)="title.set($any($event.target).value)"
            [attr.aria-invalid]="tried() && !title().trim()"
          />
        </app-hse-field>
        <app-hse-field labelKey="hse.rounds.fields.location" inputId="round-location">
          <input
            id="round-location"
            type="text"
            maxlength="200"
            [value]="location()"
            (input)="location.set($any($event.target).value)"
          />
        </app-hse-field>
        <app-hse-field
          labelKey="hse.rounds.fields.assignee"
          inputId="round-assignee"
          page="safety-rounds"
          help="assignee"
        >
          <app-assignee-select
            inputId="round-assignee"
            [value]="assignee()"
            (valueChange)="assignee.set($event)"
          />
        </app-hse-field>
        <app-hse-field labelKey="hse.rounds.fields.priority" inputId="round-priority">
          <select id="round-priority" (change)="priority.set($any($event.target).value)">
            @for (p of priorities; track p) {
              <option [value]="p" [selected]="p === priority()">
                {{ 'hse.rounds.priority.' + p | transloco }}
              </option>
            }
          </select>
        </app-hse-field>
        <fieldset>
          <legend class="mb-1.5 flex min-h-6 items-center text-ui font-semibold text-fg-muted">
            {{ 'hse.rounds.fields.schedule' | transloco }}
          </legend>
          <div class="flex flex-wrap gap-4">
            @for (s of schedules; track s) {
              <label
                class="inline-flex min-h-8 cursor-pointer items-center gap-2 text-body text-fg"
              >
                <input
                  type="radio"
                  name="round-schedule"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="schedule() === s"
                  (change)="schedule.set(s)"
                />
                {{ 'hse.rounds.schedule.' + s | transloco }}
              </label>
            }
          </div>
        </fieldset>
        @if (schedule() === 'once') {
          <app-hse-field labelKey="hse.rounds.fields.due" inputId="round-due">
            <app-date-input
              inputId="round-due"
              [value]="dueDay()"
              (valueChange)="dueDay.set($event ?? '')"
            />
          </app-hse-field>
        } @else {
          <app-recurrence-picker [(rrule)]="rrule" />
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <app-hse-field labelKey="hse.rounds.fields.start" inputId="round-start">
              <app-date-input
                inputId="round-start"
                [value]="startDay()"
                (valueChange)="startDay.set($event ?? '')"
              />
            </app-hse-field>
            <app-hse-field
              labelKey="hse.rounds.fields.leadDays"
              inputId="round-lead"
              page="safety-rounds"
              help="lead_days"
            >
              <input
                id="round-lead"
                type="number"
                min="0"
                max="366"
                step="1"
                [value]="leadDays()"
                (input)="leadDays.set(+$any($event.target).value || 0)"
              />
            </app-hse-field>
          </div>
        }
        <app-hse-field
          labelKey="hse.rounds.fields.checklist"
          inputId="round-checklist"
          page="safety-rounds"
          help="checklist"
          hintKey="hse.common.onePerLine"
        >
          <textarea
            id="round-checklist"
            rows="10"
            aria-describedby="round-checklist-hint"
            [value]="checklist()"
            (input)="checklist.set($any($event.target).value)"
          ></textarea>
        </app-hse-field>
        <app-hse-field labelKey="hse.rounds.fields.description" inputId="round-description">
          <textarea
            id="round-description"
            rows="3"
            [value]="description()"
            (input)="description.set($any($event.target).value)"
          ></textarea>
        </app-hse-field>
        <div class="flex justify-end gap-2">
          <app-button variant="secondary" (click)="planOpen.set(false)">{{
            'hse.common.cancel' | transloco
          }}</app-button>
          <app-button type="submit" [loading]="saving()" [disabled]="saving()">{{
            'hse.rounds.plan' | transloco
          }}</app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class SafetyRounds {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly perms = injectHsePermissions();
  protected readonly nav = HSE_NAV;
  protected readonly crumbs = [HSE_ROOT_CRUMB, { labelKey: 'hse.nav.safetyRounds' }];
  protected readonly pageSize = PAGE_SIZE;
  protected readonly roundFilters: readonly RoundFilter[] = ['open', 'all'];
  protected readonly schedules: readonly Schedule[] = ['once', 'recurring'];
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly findings = findingsKey;
  private readonly canInspect = this.perms.has('inspections:write');

  protected readonly filter = signal<RoundFilter>('open');
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Task[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly reloads = signal(0);

  protected readonly walks = signal<SafetyWalkList | null>(null);
  protected readonly walksState = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly walkReloads = signal(0);

  protected readonly planOpen = signal(false);
  protected readonly tried = signal(false);
  protected readonly saving = signal(false);
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly location = signal('');
  protected readonly assignee = signal('');
  protected readonly priority = signal<TaskPriority>('normal');
  protected readonly schedule = signal<Schedule>('once');
  protected readonly dueDay = signal('');
  protected readonly rrule = signal('FREQ=MONTHLY');
  protected readonly startDay = signal('');
  protected readonly leadDays = signal(7);
  protected readonly checklist = signal('');

  private readonly lang = computed<HseLang>(() => (this.language.active() === 'nb' ? 'nb' : 'en'));
  /** "Gjennomfør en vernerunde" opens the Inspections form with the safety-walk checklist. */
  protected readonly walkNewUrl = computed(() => {
    const w = this.walks();
    if (!w?.available || !w.new_url || !this.canInspect()) {
      return null;
    }
    const [path, search] = w.new_url.split('?');
    const query: Record<string, string> = {};
    new URLSearchParams(search ?? '').forEach((v, k) => (query[k] = v));
    return { path, query };
  });
  private request = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      view: 'list',
      title: this.language.translate('hse.rounds.title'),
    }));
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('plan') === '1') {
      queueMicrotask(() => {
        if (this.perms.manage()) {
          this.openPlan();
        }
      });
    }
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const statuses: readonly TaskStatus[] | undefined =
        this.filter() === 'open' ? OPEN_TASK_STATUSES : undefined;
      const offset = this.offset();
      this.reloads();
      untracked(() => this.load(orgId, statuses, offset));
    });
    effect((onCleanup) => {
      const orgId = this.selectedOrg.currentOrgId();
      this.walkReloads();
      if (!orgId) {
        return;
      }
      untracked(() => this.walksState.set('loading'));
      const sub = this.api.listSafetyWalks(orgId, { limit: 10 }).subscribe({
        next: (list) => {
          this.walks.set(list);
          this.walksState.set('ready');
        },
        error: () => this.walksState.set('error'),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  private load(
    orgId: string | null,
    status: readonly TaskStatus[] | undefined,
    offset: number,
  ): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api
      .listSafetyRounds(orgId, { status, limit: PAGE_SIZE, offset })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.state.set('ready');
        },
        error: () => {
          this.items.set([]);
          this.state.set('error');
        },
      });
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  protected reloadWalks(): void {
    this.walkReloads.update((n) => n + 1);
  }

  protected roundValue(task: Task): string {
    return roundStatusValue(task.status, task.overdue);
  }

  /** "Kari Nordmann · 4 av 12 sjekket · Gjentas". */
  protected roundSubtitle(task: Task): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts: string[] = [];
    if (task.checklist_total) {
      parts.push(
        t('hse.rounds.checklistProgress', {
          done: task.checklist_done,
          total: task.checklist_total,
        }),
      );
    }
    if (task.recurrence_id) {
      parts.push(t('hse.rounds.recurring'));
    }
    return parts.join(' · ');
  }

  protected setFilter(filter: RoundFilter): void {
    this.filter.set(filter);
    this.offset.set(0);
  }

  protected openPlan(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.tried.set(false);
    this.title.set(this.language.translate('hse.rounds.defaultTitle'));
    this.description.set('');
    this.location.set('');
    this.assignee.set('');
    this.priority.set('normal');
    this.schedule.set('once');
    this.dueDay.set(todayDay());
    this.startDay.set(todayDay());
    this.leadDays.set(7);
    this.checklist.set('');
    this.planOpen.set(true);
    if (orgId) {
      this.api.checklistTemplate(orgId, this.lang()).subscribe({
        next: (template) => {
          if (!this.checklist().trim()) {
            this.checklist.set(listToLines(template.items));
          }
        },
        error: () => undefined,
      });
    }
  }

  protected plan(): void {
    this.tried.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.title().trim() || this.saving()) {
      return;
    }
    this.saving.set(true);
    const body = safetyRoundBody({
      title: this.title(),
      description: this.description(),
      location: this.location(),
      assignee: this.assignee(),
      schedule: this.schedule(),
      dueDay: this.dueDay(),
      rrule: this.rrule(),
      startDay: this.startDay(),
      leadDays: this.leadDays(),
      checklist: this.checklist(),
      priority: this.priority(),
      lang: this.lang(),
    });
    this.api.createSafetyRound(orgId, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.planOpen.set(false);
        this.notifications.success('hse.rounds.planned');
        this.offset.set(0);
        this.reload();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }
}
