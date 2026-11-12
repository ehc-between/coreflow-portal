import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
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
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { AssigneeSelect } from '../../../shared/tasks/assignee-select';
import { RecurrencePicker } from '../../../shared/tasks/recurrence-picker';
import {
  decodeAssignee,
  dueAtFromDay,
  startOfDay,
  todayDay,
} from '../../../shared/tasks/task-display';
import { Badge, BadgeTone } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import { HseLang, SafetyRoundCreate } from '../data/hse.models';
import { linesToList, listToLines, textOrNull } from '../hse-format';
import { HSE_MODULE, HseNav, injectHsePermissions } from '../shared/hse-shared';

const PAGE_SIZE = 25;
type RoundFilter = 'open' | 'all';
type Schedule = 'once' | 'recurring';

function roundTone(task: Task): BadgeTone {
  if (task.overdue) {
    return 'fail';
  }
  switch (task.status) {
    case 'done':
      return 'pass';
    case 'cancelled':
      return 'neutral';
    case 'blocked':
      return 'warn';
    default:
      return 'info';
  }
}

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

/**
 * `/hse/safety-rounds`: planned safety rounds (F2 tasks of kind `safety_round`)
 * across the org, with "open" / "all" filters and paging. `hse:manage` holders plan
 * a round — one-off or recurring — with the standard HSE checklist (editable).
 * Rounds are carried out from the task page (checklist, completion).
 */
@Component({
  selector: 'app-safety-rounds',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    FormField,
    Icon,
    Pager,
    SlideOver,
    AssigneeSelect,
    RecurrencePicker,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    HseNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'hse.rounds.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">{{ 'hse.rounds.subtitle' | transloco }}</p>
        </div>
        @if (perms.manage()) {
          <app-button (click)="openPlan()" data-testid="rounds-plan">
            <app-icon name="plus" [size]="15" />
            {{ 'hse.rounds.plan' | transloco }}
          </app-button>
        }
      </div>
      <app-hse-nav />
      <div class="mb-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <app-guide-intro scope="hse" page="safety-rounds" />
        <app-why-it-matters scope="hse" page="safety-rounds" />
      </div>

      <div class="mb-3 flex gap-2" role="group" [attr.aria-label]="'hse.common.status' | transloco">
        @for (f of roundFilters; track f) {
          <button
            type="button"
            class="h-9 rounded-[10px] border px-3 text-[13px] font-semibold"
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

      <app-card [padded]="false">
        @if (state() === 'loading') {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'hse.common.loading' | transloco }}
          </p>
        } @else if (state() === 'error') {
          <p class="px-4 py-10 text-center text-[14px] text-fail" role="alert">
            {{ 'hse.common.loadFailed' | transloco }}
          </p>
        } @else if (items().length === 0) {
          <app-teaching-empty
            scope="hse"
            page="safety-rounds"
            [showAction]="perms.manage()"
            (action)="openPlan()"
          />
        } @else {
          <ul data-testid="round-rows">
            @for (task of items(); track task.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/tasks', task.id]"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 outline-none focus-visible:bg-surface-2"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold text-fg">{{ task.title }}</span>
                    <span class="block truncate text-[12.5px] text-fg-muted">
                      {{ task.assignee?.name || ('hse.rounds.unassigned' | transloco) }}
                      @if (task.checklist_total) {
                        ·
                        {{
                          'hse.rounds.checklistProgress'
                            | transloco: { done: task.checklist_done, total: task.checklist_total }
                        }}
                      }
                      @if (task.recurrence_id) {
                        · {{ 'hse.rounds.recurring' | transloco }}
                      }
                    </span>
                  </span>
                  <app-badge [tone]="tone(task)">{{
                    (task.overdue ? 'hse.rounds.overdue' : 'hse.rounds.status.' + task.status)
                      | transloco
                  }}</app-badge>
                  <span class="w-[100px] flex-none text-right text-[12.5px] text-fg-subtle">{{
                    (task.due_at | localDay) || '—'
                  }}</span>
                </a>
              </li>
            }
          </ul>
        }
      </app-card>
      <app-pager
        [offset]="offset()"
        [pageSize]="pageSize"
        [count]="items().length"
        [total]="total()"
        (pageChange)="offset.set($event)"
      />
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
        <div>
          <app-form-field [label]="'hse.rounds.fields.title' | transloco" inputId="round-title">
            <input
              id="round-title"
              type="text"
              maxlength="255"
              required
              [value]="title()"
              (input)="title.set($any($event.target).value)"
              [attr.aria-invalid]="tried() && !title().trim()"
            />
          </app-form-field>
          @if (tried() && !title().trim()) {
            <p class="mt-1 text-[12.5px] text-fail" role="alert">
              {{ 'hse.errors.title_required' | transloco }}
            </p>
          }
        </div>
        <app-form-field [label]="'hse.rounds.fields.location' | transloco" inputId="round-location">
          <input
            id="round-location"
            type="text"
            maxlength="200"
            [value]="location()"
            (input)="location.set($any($event.target).value)"
          />
        </app-form-field>
        <div>
          <app-form-field
            [label]="'hse.rounds.fields.assignee' | transloco"
            inputId="round-assignee"
          >
            <app-assignee-select
              inputId="round-assignee"
              [value]="assignee()"
              (valueChange)="assignee.set($event)"
            />
          </app-form-field>
          <app-field-help scope="hse" page="safety-rounds" field="assignee" />
        </div>
        <app-form-field [label]="'hse.rounds.fields.priority' | transloco" inputId="round-priority">
          <select
            id="round-priority"
            [value]="priority()"
            (change)="priority.set($any($event.target).value)"
          >
            @for (p of priorities; track p) {
              <option [value]="p" [selected]="p === priority()">
                {{ 'hse.rounds.priority.' + p | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <fieldset>
          <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
            {{ 'hse.rounds.fields.schedule' | transloco }}
          </legend>
          <div class="flex flex-wrap gap-4">
            @for (s of schedules; track s) {
              <label class="inline-flex cursor-pointer items-center gap-2 text-[13.5px] text-fg">
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
          <app-form-field [label]="'hse.rounds.fields.due' | transloco" inputId="round-due">
            <input
              id="round-due"
              type="date"
              [value]="dueDay()"
              (input)="dueDay.set($any($event.target).value)"
            />
          </app-form-field>
        } @else {
          <app-recurrence-picker [(rrule)]="rrule" />
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <app-form-field [label]="'hse.rounds.fields.start' | transloco" inputId="round-start">
              <input
                id="round-start"
                type="date"
                [value]="startDay()"
                (input)="startDay.set($any($event.target).value)"
              />
            </app-form-field>
            <div>
              <app-form-field
                [label]="'hse.rounds.fields.leadDays' | transloco"
                inputId="round-lead"
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
              </app-form-field>
              <app-field-help scope="hse" page="safety-rounds" field="lead_days" />
            </div>
          </div>
        }
        <div>
          <app-form-field
            [label]="'hse.rounds.fields.checklist' | transloco"
            inputId="round-checklist"
          >
            <textarea
              id="round-checklist"
              rows="10"
              [value]="checklist()"
              (input)="checklist.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
          <app-field-help scope="hse" page="safety-rounds" field="checklist" />
        </div>
        <app-form-field
          [label]="'hse.rounds.fields.description' | transloco"
          inputId="round-description"
        >
          <textarea
            id="round-description"
            rows="3"
            [value]="description()"
            (input)="description.set($any($event.target).value)"
          ></textarea>
        </app-form-field>
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
  protected readonly pageSize = PAGE_SIZE;
  protected readonly roundFilters: readonly RoundFilter[] = ['open', 'all'];
  protected readonly schedules: readonly Schedule[] = ['once', 'recurring'];
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly tone = roundTone;

  protected readonly filter = signal<RoundFilter>('open');
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly Task[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly reload = signal(0);

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
  private request = new Subscription();

  constructor() {
    providePageContext(() => ({ module: HSE_MODULE, view: 'list', title: null }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const statuses: readonly TaskStatus[] | undefined =
        this.filter() === 'open' ? OPEN_TASK_STATUSES : undefined;
      const offset = this.offset();
      this.reload();
      untracked(() => this.load(orgId, statuses, offset));
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
        this.reload.update((n) => n + 1);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }
}
