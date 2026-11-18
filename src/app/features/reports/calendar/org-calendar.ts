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
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { internalLink } from '../../../core/search/internal-link';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { FollowUpTask } from '../components/follow-up-task';
import { FrameworkSelect } from '../components/framework-select';
import { ReportsNav } from '../components/reports-nav';
import { blobErrorKey, reportErrorKey, saveBlob } from '../data/report-errors';
import {
  CalendarDay,
  CalendarGroup,
  CalendarTone,
  calendarState,
  dayKey,
  gridWindow,
  groupAlike,
  groupByDay,
  isoDay,
  labelOr,
  monthGrid,
  monthKey,
  moduleLabelKey,
  parseMonth,
  STATE_TONE,
} from '../data/report-display';
import {
  CALENDAR_STATES,
  CalendarItem,
  CalendarItemState,
  CalendarResponse,
  FrameworkKey,
  REPORTS_MODULE,
  isFrameworkKey,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { pluralKey } from '../../../shared/i18n/plural';

/** Day cells show this many lines before "+N more". */
const CELL_ITEMS = 3;

/** Areas listed while an older backend sends no `areas`. */
const BASE_MODULES = ['tasks', 'deviations', 'documents'];

export type CalendarView = 'month' | 'list';
export const CALENDAR_VIEWS: readonly CalendarView[] = ['month', 'list'];

export type OwnerChoice = 'all' | 'me';
export const OWNER_CHOICES: readonly OwnerChoice[] = ['all', 'me'];

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly messageKey: string }
  | { readonly status: 'ready'; readonly value: CalendarResponse };

/** Chip classes per tone (soft background + readable ink). */
const CHIP: Readonly<Record<CalendarTone, string>> = {
  warn: 'bg-warn-soft text-warn-ink',
  accent: 'bg-accent-soft text-accent',
  info: 'bg-info-soft text-info-ink',
  neutral: 'bg-surface-2 text-fg',
};

/** Swatch classes of the legend. */
const SWATCH: Readonly<Record<CalendarTone, string>> = {
  warn: 'bg-warn',
  accent: 'bg-accent',
  info: 'bg-info',
  neutral: 'bg-fg-subtle',
};

/**
 * `/reports/calendar`: every open due date the caller can see — tasks, document
 * reviews, deviations and their actions, and every other module's dates (audits,
 * contract renewals, training expiry, supplier evaluations, DPIA reviews …) — as a
 * month grid or an agenda list, coloured by what each item needs (late, due soon,
 * review, action), with who is responsible, "Mine frister", "Lag oppgave" and an
 * `.ics` export. State lives in the URL: `?month=YYYY-MM`, `?view=month|list`,
 * `?module=`, `?framework=`, `?overdue=1`, `?owner=me`.
 */
@Component({
  selector: 'app-org-calendar',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    NgTemplateOutlet,
    TeachingEmpty,
    WhyItMatters,
    Badge,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    FollowUpTask,
    FrameworkSelect,
    ReportsNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="reports.calendar.title"
        descriptionKey="reports.calendar.subtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.reports', link: '/reports' },
          { labelKey: 'reports.nav.calendar' },
        ]"
      >
        <app-button secondary variant="secondary" [loading]="exporting()" (click)="exportIcs()">
          <app-icon name="calendar" [size]="15" />
          {{ 'reports.calendar.exportIcs' | transloco }}
        </app-button>
      </app-page-header>
      <app-reports-nav />
      <app-help-strip scope="reports" page="calendar" />

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1">
          <app-button variant="secondary" size="sm" (click)="shift(-1)">
            <span class="sr-only">{{ 'reports.calendar.previous' | transloco }}</span>
            <span aria-hidden="true">‹</span>
          </app-button>
          <h2
            class="min-w-[150px] text-center text-card font-semibold text-fg first-letter:uppercase"
            aria-live="polite"
          >
            {{ monthLabel() }}
          </h2>
          <app-button variant="secondary" size="sm" (click)="shift(1)">
            <span class="sr-only">{{ 'reports.calendar.next' | transloco }}</span>
            <span aria-hidden="true">›</span>
          </app-button>
          <app-button variant="ghost" size="sm" (click)="goToday()">
            {{ 'reports.calendar.today' | transloco }}
          </app-button>
        </div>
        <div
          class="ml-auto inline-flex rounded-tile border border-border p-0.5"
          role="group"
          [attr.aria-label]="'reports.calendar.viewLabel' | transloco"
        >
          @for (v of views; track v) {
            <button
              type="button"
              class="min-h-8 rounded-tile px-3 text-meta font-semibold"
              [class]="v === activeView() ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg'"
              [attr.aria-pressed]="v === activeView()"
              (click)="setQuery({ view: v === 'month' ? null : v })"
            >
              {{ 'reports.calendar.views.' + v | transloco }}
            </button>
          }
        </div>
      </div>

      <div class="mb-3 flex flex-wrap items-center gap-2" role="search">
        <label for="cal-module" class="sr-only">{{ 'reports.calendar.module' | transloco }}</label>
        <select
          id="cal-module"
          class="h-10 max-w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
          (change)="setQuery({ module: $any($event.target).value || null })"
        >
          <option value="" [selected]="!moduleFilter()">
            {{ 'reports.calendar.allModules' | transloco }}
          </option>
          @for (m of moduleOptions(); track m) {
            <option [value]="m" [selected]="m === moduleFilter()">{{ moduleName(m) }}</option>
          }
        </select>
        <label for="cal-owner" class="sr-only">{{ 'reports.calendar.owner' | transloco }}</label>
        <select
          id="cal-owner"
          class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
          (change)="setQuery({ owner: $any($event.target).value === 'me' ? 'me' : null })"
          data-testid="calendar-owner"
        >
          @for (o of owners; track o) {
            <option [value]="o" [selected]="o === ownerChoice()">
              {{ 'reports.calendar.owners.' + o | transloco }}
            </option>
          }
        </select>
        <app-framework-select
          [value]="selectedFramework()"
          (valueChange)="setQuery({ framework: $event })"
        />
        <label
          class="inline-flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
        >
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="includeOverdue()"
            (change)="setQuery({ overdue: $any($event.target).checked ? '1' : null })"
          />
          {{ 'reports.calendar.includeOverdue' | transloco }}
        </label>
      </div>

      <ul
        class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-fg-muted"
        [attr.aria-label]="'reports.calendar.legend' | transloco"
        data-testid="calendar-legend"
      >
        @for (s of states; track s) {
          <li class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full" [class]="swatch(s)" aria-hidden="true"></span>
            {{ 'reports.calendar.states.' + s | transloco }}
          </li>
        }
      </ul>

      @switch (state().status) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state [bodyKey]="errorKey()" (retry)="reload()" />
        }
        @case ('ready') {
          @if (truncated()) {
            <p
              class="mb-3 rounded-tile border border-warn/30 bg-warn-soft px-3 py-2 text-meta text-warn-ink"
              role="status"
            >
              {{ 'reports.calendar.truncated' | transloco }}
            </p>
          }

          @if (earlier().length) {
            <app-card class="mb-4 block">
              <h3 class="mb-2 text-ui font-semibold text-warn-ink">
                {{ 'reports.calendar.earlierOverdue' | transloco: { count: earlier().length } }}
              </h3>
              <ul class="flex flex-col divide-y divide-border">
                @for (item of earlier(); track item.entity_type + item.entity_id + item.due_at) {
                  <li class="py-2">
                    <ng-container
                      *ngTemplateOutlet="itemRow; context: { $implicit: item, showDate: true }"
                    />
                  </li>
                }
              </ul>
            </app-card>
          }

          @if (items().length === 0 && earlier().length === 0) {
            <app-card>
              <app-teaching-empty scope="reports" page="calendar" [showAction]="false" />
            </app-card>
          } @else {
            @if (activeView() === 'month') {
              <div class="hidden md:block" data-testid="calendar-grid">
                <div
                  class="grid grid-cols-7 border-b border-border pb-1 text-meta font-semibold text-fg-subtle"
                >
                  @for (name of weekdayNames(); track $index) {
                    <div class="px-2 first-letter:uppercase">{{ name }}</div>
                  }
                </div>
                <div
                  class="grid grid-cols-7 border-l border-border"
                  role="grid"
                  [attr.aria-label]="monthLabel()"
                >
                  @for (week of grid(); track $index) {
                    @for (day of week; track day.key) {
                      <div
                        role="gridcell"
                        class="min-h-[112px] min-w-0 border-r border-b border-border p-1.5"
                        [class.bg-surface-2]="!day.inMonth"
                        [attr.aria-label]="dayAria(day)"
                      >
                        <button
                          type="button"
                          class="mb-1 flex h-7 w-7 items-center justify-center rounded-full text-meta font-semibold"
                          [class]="
                            day.isToday
                              ? 'bg-accent text-white'
                              : day.inMonth
                                ? 'text-fg hover:bg-surface-2'
                                : 'text-fg-subtle'
                          "
                          [attr.aria-label]="
                            'reports.calendar.showDay'
                              | transloco: { date: (day.date | localDate: 'longDate') }
                          "
                          (click)="selectDay(day.key)"
                        >
                          {{ day.date.getDate() }}
                        </button>
                        @for (group of dayGroups(day.key).slice(0, cellItems); track group.key) {
                          @if (singleLink(group); as target) {
                            <a
                              [routerLink]="target.path"
                              [queryParams]="target.queryParams"
                              class="mb-0.5 block truncate rounded-tile px-1.5 py-0.5 text-micro font-medium"
                              [class]="chipClass(group.first)"
                              [title]="groupTitle(group)"
                            >
                              {{ groupText(group) }}
                            </a>
                          } @else {
                            <button
                              type="button"
                              class="mb-0.5 block w-full truncate rounded-tile px-1.5 py-0.5 text-left text-micro font-medium"
                              [class]="chipClass(group.first)"
                              [title]="groupTitle(group)"
                              (click)="selectDay(day.key)"
                            >
                              {{ groupText(group) }}
                            </button>
                          }
                        }
                        @if (dayGroups(day.key).length > cellItems) {
                          <button
                            type="button"
                            class="px-1.5 text-micro font-semibold text-accent hover:underline"
                            (click)="selectDay(day.key)"
                          >
                            {{
                              'reports.calendar.more'
                                | transloco: { count: dayGroups(day.key).length - cellItems }
                            }}
                          </button>
                        }
                      </div>
                    }
                  }
                </div>
              </div>

              @if (selectedDay(); as dayKey) {
                <app-card class="mt-4 hidden md:block" data-testid="calendar-day">
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <h3 class="text-ui font-semibold text-fg first-letter:uppercase">
                      {{ dayKey | localDay: 'fullDate' }}
                    </h3>
                    <button
                      type="button"
                      class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fg"
                      [attr.aria-label]="'reports.common.close' | transloco"
                      (click)="selectedDay.set(null)"
                    >
                      <app-icon name="x" [size]="14" />
                    </button>
                  </div>
                  <ul class="flex flex-col divide-y divide-border">
                    @for (item of dayItems(dayKey); track item.entity_type + item.entity_id) {
                      <li class="py-2">
                        <ng-container
                          *ngTemplateOutlet="itemRow; context: { $implicit: item, showDate: false }"
                        />
                      </li>
                    } @empty {
                      <li class="py-2 text-ui text-fg-muted">
                        {{ 'reports.calendar.nothingThisDay' | transloco }}
                      </li>
                    }
                  </ul>
                </app-card>
              }
            }

            <div
              [class]="activeView() === 'month' ? 'md:hidden' : ''"
              data-testid="calendar-agenda"
            >
              @for (group of agenda(); track group.key) {
                <section class="mb-3" [attr.aria-labelledby]="'agenda-' + group.key">
                  <h3
                    [id]="'agenda-' + group.key"
                    class="mb-1 text-meta font-semibold text-fg-muted first-letter:uppercase"
                  >
                    {{ group.key | localDay: 'fullDate' }}
                  </h3>
                  <app-card>
                    <ul class="flex flex-col divide-y divide-border">
                      @for (item of group.items; track item.entity_type + item.entity_id) {
                        <li class="py-2">
                          <ng-container
                            *ngTemplateOutlet="
                              itemRow;
                              context: { $implicit: item, showDate: false }
                            "
                          />
                        </li>
                      }
                    </ul>
                  </app-card>
                </section>
              } @empty {
                <p class="py-6 text-center text-ui text-fg-muted">
                  {{ 'reports.calendar.nothingThisMonth' | transloco }}
                </p>
              }
            </div>
          }
        }
      }

      <app-why-it-matters class="mt-8 block" scope="reports" page="calendar" />
    </div>

    <ng-template #itemRow let-item let-showDate="showDate">
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-ui">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <app-badge [tone]="tone(item)">{{ stateLabel(item) }}</app-badge>
          <span class="min-w-0">
            @if (link(item.url); as target) {
              <a
                [routerLink]="target.path"
                [queryParams]="target.queryParams"
                class="block truncate text-fg hover:text-accent hover:underline"
              >
                @if (item.code) {
                  <span class="font-mono text-meta text-fg-muted">{{ item.code }}</span>
                }
                {{ item.title }}
              </a>
            } @else {
              <span class="block truncate text-fg">{{ item.title }}</span>
            }
            <span class="block truncate text-meta text-fg-subtle">
              {{ moduleName(item.module) }}
              @if (item.owner?.name; as owner) {
                · {{ owner }}
              }
            </span>
          </span>
        </div>
        <div class="flex flex-none items-center gap-2 text-meta text-fg-muted">
          @if (showDate) {
            <span [class.text-warn-ink]="item.overdue" [class.font-semibold]="item.overdue">{{
              item.due_at | localDay
            }}</span>
          }
          @if (canCreateTasks()) {
            <button
              type="button"
              class="inline-flex h-8 items-center rounded-tile px-2 font-semibold text-accent hover:bg-accent-soft"
              [attr.aria-label]="
                'reports.followUp.createFor' | transloco: { title: item.code || item.title }
              "
              (click)="followUp.set(item)"
            >
              {{ 'reports.followUp.create' | transloco }}
            </button>
          }
        </div>
      </div>
    </ng-template>

    <app-follow-up-task [item]="followUp()" (closed)="followUp.set(null)" />
  `,
})
export class OrgCalendar {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  /** Query params (component input binding). */
  readonly month = input<string | undefined>(undefined);
  readonly view = input<string | undefined>(undefined);
  readonly module = input<string | undefined>(undefined);
  readonly framework = input<string | undefined>(undefined);
  readonly overdue = input<string | undefined>(undefined);
  readonly owner = input<string | undefined>(undefined);

  protected readonly views = CALENDAR_VIEWS;
  protected readonly owners = OWNER_CHOICES;
  protected readonly states = CALENDAR_STATES;
  protected readonly cellItems = CELL_ITEMS;

  protected readonly state = signal<State>({ status: 'loading' });
  protected readonly exporting = signal(false);
  protected readonly selectedDay = signal<string | null>(null);
  protected readonly followUp = signal<CalendarItem | null>(null);

  protected readonly canCreateTasks = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('tasks:write'),
  );

  protected readonly current = computed(() => {
    const parsed = parseMonth(this.month());
    const now = new Date();
    return parsed ?? { year: now.getFullYear(), month: now.getMonth() };
  });
  protected readonly activeView = computed<CalendarView>(() =>
    this.view() === 'list' ? 'list' : 'month',
  );
  protected readonly moduleFilter = computed(() => this.module() || null);
  protected readonly ownerChoice = computed<OwnerChoice>(() =>
    this.owner() === 'me' ? 'me' : 'all',
  );
  protected readonly selectedFramework = computed<FrameworkKey | null>(() => {
    const raw = this.framework();
    return isFrameworkKey(raw) ? raw : null;
  });
  protected readonly includeOverdue = computed(() => this.overdue() === '1');

  protected readonly grid = computed(() => monthGrid(this.current().year, this.current().month));
  private readonly window = computed(() => gridWindow(this.grid()));

  protected readonly monthLabel = computed(() => {
    const { year, month } = this.current();
    return new Intl.DateTimeFormat(this.language.locale(), {
      month: 'long',
      year: 'numeric',
    }).format(new Date(year, month, 1));
  });

  protected readonly weekdayNames = computed(() => {
    const format = new Intl.DateTimeFormat(this.language.locale(), { weekday: 'short' });
    // 2024-01-01 was a Monday.
    return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i)));
  });

  private readonly response = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.value : null;
  });
  protected readonly truncated = computed(() => this.response()?.truncated ?? false);
  protected readonly errorKey = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.messageKey : 'ui.error.body';
  });

  /** Items inside the shown window. */
  protected readonly items = computed(() => {
    const first = this.window().from.slice(0, 10);
    return (this.response()?.items ?? []).filter((i) => isoDay(i.due_at) >= first);
  });

  /** Overdue items due before the shown window (only with "include overdue"). */
  protected readonly earlier = computed(() => {
    const first = this.window().from.slice(0, 10);
    return (this.response()?.items ?? []).filter((i) => isoDay(i.due_at) < first);
  });

  private readonly byDay = computed(() => groupByDay(this.items()));
  private readonly groupsByDay = computed(() => {
    const out = new Map<string, CalendarGroup[]>();
    for (const [key, list] of this.byDay()) {
      out.set(key, groupAlike(list));
    }
    return out;
  });

  protected readonly agenda = computed(() => {
    const { year, month } = this.current();
    const prefix = monthKey(year, month);
    return [...this.byDay().entries()]
      .filter(([key]) => this.activeView() === 'list' || key.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, items }));
  });

  /** Every enabled area the caller can read (older backends: the areas that have items). */
  protected readonly moduleOptions = computed(() => {
    const areas = this.response()?.areas;
    const seen = new Set<string>(areas?.length ? areas : BASE_MODULES);
    for (const item of this.response()?.items ?? []) {
      seen.add(item.module);
    }
    const current = this.moduleFilter();
    if (current) {
      seen.add(current);
    }
    return [...seen].sort((a, b) => this.moduleName(a).localeCompare(this.moduleName(b)));
  });

  private sub = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: REPORTS_MODULE,
      view: 'calendar',
      title: this.language.translate('reports.calendar.contextTitle', {
        month: this.monthLabel(),
      }),
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const args = {
        orgId: this.selectedOrg.currentOrgId(),
        window: this.window(),
        module: this.moduleFilter(),
        framework: this.selectedFramework(),
        includeOverdue: this.includeOverdue(),
        owner: this.ownerChoice(),
      };
      untracked(() => this.load(args));
    });
  }

  protected dayItems(key: string): CalendarItem[] {
    return this.byDay().get(key) ?? [];
  }

  protected dayGroups(key: string): CalendarGroup[] {
    return this.groupsByDay().get(key) ?? [];
  }

  /** "AST-0005 · Laptop" or "TRN-001 · Security awareness ×7". */
  protected groupText(group: CalendarGroup): string {
    const base = [group.first.code, group.first.title].filter(Boolean).join(' · ');
    return group.items.length > 1 ? `${base} ×${group.items.length}` : base;
  }

  protected groupTitle(group: CalendarGroup): string {
    const text = this.groupText(group);
    const state = this.stateLabel(group.first);
    return group.items.length > 1
      ? `${state}: ${this.language.translate('reports.calendar.grouped', {
          title: text,
          count: group.items.length,
        })}`
      : `${state}: ${text}`;
  }

  protected dayAria(day: CalendarDay): string {
    const date = new Intl.DateTimeFormat(this.language.locale(), { dateStyle: 'long' }).format(
      day.date,
    );
    const count = this.dayItems(day.key).length;
    return count
      ? this.language.translate(pluralKey('reports.calendar.dayWithItems', count), { date, count })
      : date;
  }

  protected chipClass(item: CalendarItem): string {
    return CHIP[STATE_TONE[calendarState(item)]];
  }

  protected swatch(state: CalendarItemState): string {
    return SWATCH[STATE_TONE[state]];
  }

  protected tone(item: CalendarItem): CalendarTone {
    return STATE_TONE[calendarState(item)];
  }

  protected stateLabel(item: CalendarItem): string {
    return this.language.translate(`reports.calendar.states.${calendarState(item)}`);
  }

  protected link(url: string | null) {
    return internalLink(url);
  }

  /** A single item's link; groups of alike items open the day list instead. */
  protected singleLink(group: CalendarGroup) {
    return group.items.length === 1 ? internalLink(group.first.url) : null;
  }

  protected moduleName(module: string): string {
    return labelOr((k) => this.language.translate(k), moduleLabelKey(module), module);
  }

  protected selectDay(key: string): void {
    this.selectedDay.set(this.selectedDay() === key ? null : key);
  }

  protected shift(delta: number): void {
    const { year, month } = this.current();
    const next = new Date(year, month + delta, 1);
    this.selectedDay.set(null);
    this.setQuery({ month: monthKey(next.getFullYear(), next.getMonth()) });
  }

  protected goToday(): void {
    this.selectedDay.set(dayKey(new Date()));
    this.setQuery({ month: null });
  }

  protected setQuery(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected reload(): void {
    this.load({
      orgId: this.selectedOrg.currentOrgId(),
      window: this.window(),
      module: this.moduleFilter(),
      framework: this.selectedFramework(),
      includeOverdue: this.includeOverdue(),
      owner: this.ownerChoice(),
    });
  }

  protected exportIcs(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    const { from, to } = this.window();
    const module = this.moduleFilter();
    this.exporting.set(true);
    this.api.calendarIcs(orgId, { from, to, modules: module ? [module] : [] }).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, this.language.translate('reports.calendar.icsFile') || 'calendar.ics');
      },
      error: (error: unknown) => {
        this.exporting.set(false);
        void blobErrorKey(error).then((key) => this.notifications.error(key));
      },
    });
  }

  private load(args: {
    orgId: string | null;
    window: { from: string; to: string };
    module: string | null;
    framework: FrameworkKey | null;
    includeOverdue: boolean;
    owner: OwnerChoice;
  }): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!args.orgId) {
      return;
    }
    this.state.set({ status: 'loading' });
    this.sub.add(
      this.api
        .calendar(args.orgId, {
          from: args.window.from,
          to: args.window.to,
          modules: args.module ? [args.module] : [],
          framework: args.framework,
          include_overdue: args.includeOverdue,
          owner: args.owner === 'me' ? 'me' : null,
        })
        .subscribe({
          next: (value) => this.state.set({ status: 'ready', value }),
          error: (error: unknown) =>
            this.state.set({ status: 'error', messageKey: reportErrorKey(error) }),
        }),
    );
  }
}
