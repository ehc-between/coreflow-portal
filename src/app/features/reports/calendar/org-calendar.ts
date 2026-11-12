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
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { internalLink } from '../../../core/search/internal-link';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { NgTemplateOutlet } from '@angular/common';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { FrameworkSelect } from '../components/framework-select';
import { blobErrorKey, reportErrorKey, saveBlob } from '../data/report-errors';
import {
  CalendarDay,
  calendarTone,
  dayKey,
  gridWindow,
  groupByDay,
  isoDay,
  labelOr,
  monthGrid,
  monthKey,
  moduleLabelKey,
  parseMonth,
} from '../data/report-display';
import {
  CalendarItem,
  CalendarResponse,
  FrameworkKey,
  REPORTS_MODULE,
  isFrameworkKey,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';

/** Day cells show this many items before "+N more". */
const CELL_ITEMS = 3;

/** Modules that always contribute due dates (others appear once they have items). */
const BASE_MODULES = ['tasks', 'deviations', 'documents'];

export type CalendarView = 'month' | 'list';
export const CALENDAR_VIEWS: readonly CalendarView[] = ['month', 'list'];

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly messageKey: string }
  | { readonly status: 'ready'; readonly value: CalendarResponse };

/**
 * `/reports/calendar`: every open due date the caller can see — tasks, document
 * reviews, deviations and their actions, and whatever other modules register
 * (audits, contract renewals, training expiry…) — as a month grid or an agenda
 * list, with an `.ics` export. State lives in the URL: `?month=YYYY-MM`,
 * `?view=month|list`, `?module=`, `?framework=`, `?overdue=1`.
 */
@Component({
  selector: 'app-org-calendar',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    NgTemplateOutlet,
    GuideIntro,
    TeachingEmpty,
    WhyItMatters,
    Badge,
    Button,
    Card,
    Icon,
    FrameworkSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'reports.calendar.title' | transloco }}
          </h1>
          <p class="mt-1 text-[13.5px] text-fg-muted">
            {{ 'reports.calendar.subtitle' | transloco }}
          </p>
        </div>
        <app-button variant="secondary" size="sm" [loading]="exporting()" (click)="exportIcs()">
          <app-icon name="calendar" [size]="15" />
          {{ 'reports.calendar.exportIcs' | transloco }}
        </app-button>
      </header>

      <app-guide-intro class="mb-4 block" scope="reports" page="calendar" />

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1">
          <app-button variant="secondary" size="sm" (click)="shift(-1)">
            <span class="sr-only">{{ 'reports.calendar.previous' | transloco }}</span>
            <span aria-hidden="true">‹</span>
          </app-button>
          <h2
            class="min-w-[150px] text-center text-[15px] font-semibold text-fg"
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

        <div class="ml-auto flex flex-wrap items-center gap-2">
          <label for="cal-module" class="sr-only">{{
            'reports.calendar.module' | transloco
          }}</label>
          <select
            id="cal-module"
            class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
            (change)="setQuery({ module: $any($event.target).value || null })"
          >
            <option value="" [selected]="!moduleFilter()">
              {{ 'reports.calendar.allModules' | transloco }}
            </option>
            @for (m of moduleOptions(); track m) {
              <option [value]="m" [selected]="m === moduleFilter()">{{ moduleName(m) }}</option>
            }
          </select>
          <app-framework-select
            [value]="selectedFramework()"
            (valueChange)="setQuery({ framework: $event })"
          />
          <label
            class="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
          >
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="includeOverdue()"
              (change)="setQuery({ overdue: $any($event.target).checked ? '1' : null })"
            />
            {{ 'reports.calendar.includeOverdue' | transloco }}
          </label>
          <div
            class="inline-flex rounded-[10px] border border-border p-0.5"
            role="group"
            [attr.aria-label]="'reports.calendar.viewLabel' | transloco"
          >
            @for (v of views; track v) {
              <button
                type="button"
                class="rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold"
                [class]="
                  v === activeView() ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg'
                "
                [attr.aria-pressed]="v === activeView()"
                (click)="setQuery({ view: v === 'month' ? null : v })"
              >
                {{ 'reports.calendar.views.' + v | transloco }}
              </button>
            }
          </div>
        </div>
      </div>

      @switch (state().status) {
        @case ('loading') {
          <p class="py-10 text-center text-[13.5px] text-fg-muted" role="status">
            {{ 'reports.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-card>
            <p class="py-6 text-center text-[13.5px] text-fg-muted" role="alert">
              {{ errorKey() | transloco }}
            </p>
          </app-card>
        }
        @case ('ready') {
          @if (truncated()) {
            <p
              class="mb-3 rounded-tile border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-warn"
              role="status"
            >
              {{ 'reports.calendar.truncated' | transloco }}
            </p>
          }

          @if (earlier().length) {
            <app-card class="mb-4 block">
              <h3 class="mb-2 text-[13px] font-semibold text-fail">
                {{ 'reports.calendar.earlierOverdue' | transloco: { count: earlier().length } }}
              </h3>
              <ul class="flex flex-col divide-y divide-border">
                @for (item of earlier(); track item.entity_type + item.entity_id + item.due_at) {
                  <li class="py-1.5">
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
                  class="grid grid-cols-7 border-b border-border pb-1 text-[11.5px] font-semibold tracking-[0.04em] text-fg-subtle uppercase"
                >
                  @for (name of weekdayNames(); track $index) {
                    <div class="px-2">{{ name }}</div>
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
                        class="min-h-[108px] border-r border-b border-border p-1.5"
                        [class.bg-surface-2]="!day.inMonth"
                        [attr.aria-label]="dayAria(day)"
                      >
                        <button
                          type="button"
                          class="mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold"
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
                        @for (
                          item of dayItems(day.key).slice(0, cellItems);
                          track item.entity_type + item.entity_id
                        ) {
                          @if (link(item.url); as target) {
                            <a
                              [routerLink]="target.path"
                              [queryParams]="target.queryParams"
                              class="mb-0.5 block truncate rounded-[5px] px-1.5 py-0.5 text-[11.5px] font-medium"
                              [class]="chipClass(item)"
                              [title]="item.title"
                            >
                              {{ item.code || item.title }}
                            </a>
                          } @else {
                            <span
                              class="mb-0.5 block truncate rounded-[5px] px-1.5 py-0.5 text-[11.5px] font-medium"
                              [class]="chipClass(item)"
                              [title]="item.title"
                            >
                              {{ item.code || item.title }}
                            </span>
                          }
                        }
                        @if (dayItems(day.key).length > cellItems) {
                          <button
                            type="button"
                            class="px-1.5 text-[11.5px] font-semibold text-accent hover:underline"
                            (click)="selectDay(day.key)"
                          >
                            {{
                              'reports.calendar.more'
                                | transloco: { count: dayItems(day.key).length - cellItems }
                            }}
                          </button>
                        }
                      </div>
                    }
                  }
                </div>
              </div>

              @if (selectedDay(); as dayKey) {
                <app-card class="mt-4 hidden md:block">
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <h3 class="text-[13.5px] font-semibold text-fg">
                      {{ dayKey | localDay: 'fullDate' }}
                    </h3>
                    <button
                      type="button"
                      class="rounded-[6px] p-1 text-fg-subtle hover:text-fg"
                      [attr.aria-label]="'reports.common.close' | transloco"
                      (click)="selectedDay.set(null)"
                    >
                      <app-icon name="x" [size]="14" />
                    </button>
                  </div>
                  <ul class="flex flex-col divide-y divide-border">
                    @for (item of dayItems(dayKey); track item.entity_type + item.entity_id) {
                      <li class="py-1.5">
                        <ng-container
                          *ngTemplateOutlet="itemRow; context: { $implicit: item, showDate: false }"
                        />
                      </li>
                    } @empty {
                      <li class="py-2 text-[13px] text-fg-muted">
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
                    class="mb-1 text-[12.5px] font-semibold text-fg-muted"
                  >
                    {{ group.key | localDay: 'fullDate' }}
                  </h3>
                  <app-card>
                    <ul class="flex flex-col divide-y divide-border">
                      @for (item of group.items; track item.entity_type + item.entity_id) {
                        <li class="py-1.5">
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
                <p class="py-6 text-center text-[13px] text-fg-muted">
                  {{ 'reports.calendar.nothingThisMonth' | transloco }}
                </p>
              }
            </div>
          }
        }
      }

      <app-why-it-matters class="mt-6 block" scope="reports" page="calendar" />
    </div>

    <ng-template #itemRow let-item let-showDate="showDate">
      <div class="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <div class="flex min-w-0 items-center gap-2">
          <app-badge [tone]="tone(item)">{{ kindLabel(item.kind) }}</app-badge>
          @if (link(item.url); as target) {
            <a
              [routerLink]="target.path"
              [queryParams]="target.queryParams"
              class="min-w-0 truncate text-fg hover:text-accent hover:underline"
            >
              @if (item.code) {
                <span class="font-mono text-[12px] text-fg-muted">{{ item.code }}</span>
              }
              {{ item.title }}
            </a>
          } @else {
            <span class="min-w-0 truncate text-fg">{{ item.title }}</span>
          }
        </div>
        <div class="flex flex-none items-center gap-2 text-[12px] text-fg-muted">
          <span>{{ moduleName(item.module) }}</span>
          @if (showDate) {
            <span [class.text-fail]="item.overdue" [class.font-semibold]="item.overdue">{{
              item.due_at | localDay
            }}</span>
          }
        </div>
      </div>
    </ng-template>
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

  protected readonly views = CALENDAR_VIEWS;
  protected readonly cellItems = CELL_ITEMS;

  protected readonly state = signal<State>({ status: 'loading' });
  protected readonly exporting = signal(false);
  protected readonly selectedDay = signal<string | null>(null);

  protected readonly current = computed(() => {
    const parsed = parseMonth(this.month());
    const now = new Date();
    return parsed ?? { year: now.getFullYear(), month: now.getMonth() };
  });
  protected readonly activeView = computed<CalendarView>(() =>
    this.view() === 'list' ? 'list' : 'month',
  );
  protected readonly moduleFilter = computed(() => this.module() || null);
  protected readonly selectedFramework = computed<FrameworkKey | null>(() => {
    const raw = this.framework();
    return isFrameworkKey(raw) ? raw : null;
  });
  protected readonly includeOverdue = computed(() => this.overdue() === '1');

  protected readonly grid = computed(() => monthGrid(this.current().year, this.current().month));
  private readonly window = computed(() => gridWindow(this.grid()));

  protected readonly monthLabel = computed(() => {
    const { year, month } = this.current();
    return new Intl.DateTimeFormat(this.language.active(), {
      month: 'long',
      year: 'numeric',
    }).format(new Date(year, month, 1));
  });

  protected readonly weekdayNames = computed(() => {
    const format = new Intl.DateTimeFormat(this.language.active(), { weekday: 'short' });
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
    return s.status === 'error' ? s.messageKey : '';
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

  protected readonly agenda = computed(() => {
    const { year, month } = this.current();
    const prefix = monthKey(year, month);
    return [...this.byDay().entries()]
      .filter(([key]) => this.activeView() === 'list' || key.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, items }));
  });

  protected readonly moduleOptions = computed(() => {
    const seen = new Set(BASE_MODULES);
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
      title: this.monthLabel(),
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const window = this.window();
      const module = this.moduleFilter();
      const framework = this.selectedFramework();
      const includeOverdue = this.includeOverdue();
      untracked(() => this.load(orgId, window, module, framework, includeOverdue));
    });
  }

  protected dayItems(key: string): CalendarItem[] {
    return this.byDay().get(key) ?? [];
  }

  protected dayAria(day: CalendarDay): string {
    const date = new Intl.DateTimeFormat(this.language.active(), { dateStyle: 'long' }).format(
      day.date,
    );
    const count = this.dayItems(day.key).length;
    return count ? this.language.translate('reports.calendar.dayWithItems', { date, count }) : date;
  }

  protected chipClass(item: CalendarItem): string {
    switch (calendarTone(item)) {
      case 'fail':
        return 'bg-fail-soft text-fail';
      case 'info':
        return 'bg-info-soft text-info';
      case 'accent':
        return 'bg-accent-soft text-accent';
      default:
        return 'bg-surface-2 text-fg';
    }
  }

  protected tone = calendarTone;

  protected kindLabel(kind: string): string {
    return labelOr((k) => this.language.translate(k), `reports.calendar.kinds.${kind}`, kind);
  }

  protected link(url: string | null) {
    return internalLink(url);
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
        saveBlob(blob, 'compliance-calendar.ics');
      },
      error: (error: unknown) => {
        this.exporting.set(false);
        void blobErrorKey(error).then((key) => this.notifications.error(key));
      },
    });
  }

  private load(
    orgId: string | null,
    window: { from: string; to: string },
    module: string | null,
    framework: FrameworkKey | null,
    includeOverdue: boolean,
  ): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    this.state.set({ status: 'loading' });
    this.sub.add(
      this.api
        .calendar(orgId, {
          from: window.from,
          to: window.to,
          modules: module ? [module] : [],
          framework,
          include_overdue: includeOverdue,
        })
        .subscribe({
          next: (value) => this.state.set({ status: 'ready', value }),
          error: (error: unknown) =>
            this.state.set({ status: 'error', messageKey: reportErrorKey(error) }),
        }),
    );
  }
}
