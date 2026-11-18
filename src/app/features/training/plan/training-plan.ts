import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { TrainingApi } from '../data/training-api';
import { TRAINING_MODULE, TrainingAccess } from '../data/training-display';
import { Course, PlanItem, PlanMonth, TrainingPlan } from '../data/training.models';
import { FilterOption, FilterSelect } from '../shared/filter-select';
import { PrintChrome } from '../shared/print-chrome';
import { TrainingPeople } from '../shared/people';

/** `YYYY-MM` of a date (local calendar). */
export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The month `delta` months from a `YYYY-MM` key. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

/** A `YYYY-MM` key as a date for the date pipes (the first of the month, local). */
export function monthDate(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/** Router link of a plan item (the assignment or record behind it). */
export function planLink(item: PlanItem): readonly string[] {
  if (item.assignment_id) {
    return ['/training/assignments', item.assignment_id];
  }
  if (item.record_id) {
    return ['/training/records', item.record_id];
  }
  return ['/training/courses', item.course.id];
}

/**
 * `/training/plan` ("Opplæringsplan"): the training programme as a timeline —
 * month by month, who has training due and whose certificates expire, with
 * what is already overdue first. People who oversee training see everyone
 * (filter by course or department); others see their own plan. Printable, so it
 * can serve as the annual training plan auditors ask for (ISO 7.2, 27001 A.6.3).
 */
@Component({
  selector: 'app-training-plan',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    LoadingState,
    ModuleNav,
    PageHeader,
    PrintChrome,
    WhyItMatters,
    FilterSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-print-chrome />
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="training.plan.title"
        descriptionKey="training.plan.subtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.training', link: '/training' },
          { labelKey: 'training.plan.title' },
        ]"
      >
        <app-button secondary variant="secondary" (click)="print()">
          {{ 'training.plan.print' | transloco }}
        </app-button>
      </app-page-header>
      <app-module-nav [items]="access.navItems()" labelKey="training.nav.label" />
      <app-help-strip scope="training" page="plan" />

      <div class="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <div
          class="flex items-center gap-1"
          role="group"
          [attr.aria-label]="'training.plan.period' | transloco"
        >
          <app-button size="sm" variant="secondary" (click)="move(-12)">
            {{ 'training.plan.previous' | transloco }}
          </app-button>
          <span class="px-2 text-ui font-semibold text-fg" aria-live="polite">
            {{ periodLabel() }}
          </span>
          <app-button size="sm" variant="secondary" (click)="move(12)">
            {{ 'training.plan.next' | transloco }}
          </app-button>
          @if (start() !== thisMonth) {
            <app-button size="sm" variant="ghost" (click)="start.set(thisMonth)">
              {{ 'training.plan.today' | transloco }}
            </app-button>
          }
        </div>
        @if (access.canOversee()) {
          <app-training-filter
            [label]="'training.fields.course' | transloco"
            [value]="courseId()"
            [options]="courseOptions()"
            (valueChange)="courseId.set($event)"
          />
          @if (departmentOptions().length > 1) {
            <app-training-filter
              [label]="'training.filters.department' | transloco"
              [value]="department()"
              [options]="departmentOptions()"
              (valueChange)="department.set($event)"
            />
          }
        }
      </div>

      @if (plan(); as p) {
        <p class="mb-4 text-ui text-fg" data-testid="plan-totals">
          {{
            'training.plan.totals'
              | transloco
                : { due: p.totals.due, expiring: p.totals.expiring, overdue: p.totals.overdue }
          }}
        </p>

        @if (p.overdue.length) {
          <app-card class="mb-5">
            <h2 class="mb-2 flex items-center gap-2 text-card font-semibold text-fg">
              {{ 'training.plan.overdueTitle' | transloco }}
              <app-badge tone="warn">{{ p.overdue.length }}</app-badge>
            </h2>
            <ul class="flex flex-col divide-y divide-border" data-testid="plan-overdue">
              @for (item of p.overdue; track $index) {
                <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-ui">
                  <span class="w-[104px] font-semibold whitespace-nowrap text-warn-ink">{{
                    item.date | localDay
                  }}</span>
                  <a
                    [routerLink]="link(item)"
                    class="min-w-0 flex-1 text-fg hover:text-accent hover:underline"
                  >
                    <span class="font-mono text-meta text-fg-subtle">{{ item.course.code }}</span>
                    {{ item.course.title }}
                  </a>
                  @if (access.canOversee()) {
                    <a
                      [routerLink]="['/training/people', item.user.id]"
                      class="text-fg-muted hover:text-accent hover:underline"
                      >{{ item.user.name }}</a
                    >
                  }
                </li>
              }
            </ul>
          </app-card>
        }

        @if (p.totals.due + p.totals.expiring === 0) {
          <app-empty-state
            icon="calendar"
            titleKey="training.plan.emptyTitle"
            bodyKey="training.plan.empty"
          />
        } @else {
          <ol class="flex flex-col gap-4" data-testid="plan-months">
            @for (month of p.months; track month.month) {
              <li>
                <section
                  class="rounded-card border border-border bg-surface"
                  [attr.aria-label]="monthLabel(month.month)"
                >
                  <header
                    class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5"
                  >
                    <h2 class="text-card font-semibold text-fg first-letter:uppercase">
                      {{ monthLabel(month.month) }}
                    </h2>
                    <p class="text-meta text-fg-muted">
                      {{
                        'training.plan.monthCounts'
                          | transloco: { due: month.due, expiring: month.expiring }
                      }}
                    </p>
                  </header>
                  @if (month.items.length === 0) {
                    <p class="px-4 py-2.5 text-meta text-fg-subtle">
                      {{ 'training.plan.nothing' | transloco }}
                    </p>
                  } @else {
                    <ul class="flex flex-col divide-y divide-border">
                      @for (item of visibleItems(month); track $index) {
                        <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-ui">
                          <span class="w-[104px] whitespace-nowrap text-fg-muted">{{
                            item.date | localDay
                          }}</span>
                          <app-badge [tone]="item.kind === 'expiring' ? 'warn' : 'info'">
                            {{ 'training.plan.kind.' + item.kind | transloco }}
                          </app-badge>
                          <a
                            [routerLink]="link(item)"
                            class="min-w-0 flex-1 basis-[200px] text-fg hover:text-accent hover:underline"
                          >
                            <span class="font-mono text-meta text-fg-subtle">{{
                              item.course.code
                            }}</span>
                            {{ item.course.title }}
                          </a>
                          @if (access.canOversee()) {
                            <a
                              [routerLink]="['/training/people', item.user.id]"
                              class="text-fg-muted hover:text-accent hover:underline"
                              >{{ item.user.name }}</a
                            >
                          }
                        </li>
                      }
                    </ul>
                    @if (month.items.length > previewSize && !expanded().has(month.month)) {
                      <button
                        type="button"
                        class="w-full border-t border-border px-4 py-2 text-left text-ui font-semibold text-accent hover:bg-surface-2 print:hidden"
                        (click)="expand(month.month)"
                      >
                        {{ 'training.plan.showAll' | transloco: { count: month.items.length } }}
                      </button>
                    }
                  }
                </section>
              </li>
            }
          </ol>
        }
      } @else if (failed()) {
        <app-error-state (retry)="reload()" />
      } @else {
        <app-loading-state [rows]="6" />
      }

      <div class="mt-8 print:hidden">
        <app-why-it-matters scope="training" page="plan" />
      </div>
    </div>
  `,
})
export class TrainingPlanPage {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly directory = inject(TrainingPeople);
  protected readonly access = inject(TrainingAccess);

  protected readonly thisMonth = monthKey();
  protected readonly start = signal(monthKey());
  protected readonly courseId = signal('');
  protected readonly department = signal('');
  protected readonly plan = signal<TrainingPlan | null>(null);
  protected readonly failed = signal(false);
  protected readonly courses = signal<readonly Course[]>([]);
  protected readonly link = planLink;
  protected readonly previewSize = 10;
  /** Months opened in full (long months show the first 10 items). */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected visibleItems(month: PlanMonth): readonly PlanItem[] {
    return this.expanded().has(month.month) ? month.items : month.items.slice(0, this.previewSize);
  }

  protected expand(month: string): void {
    this.expanded.update((set) => new Set([...set, month]));
  }
  private readonly tick = signal(0);

  protected readonly periodLabel = computed(() =>
    this.language.translate('training.plan.periodLabel', {
      from: this.monthLabel(this.start()),
      to: this.monthLabel(shiftMonth(this.start(), 11)),
    }),
  );
  protected readonly courseOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.allCourses') },
    ...this.courses().map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` })),
  ]);
  protected readonly departmentOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.allDepartments') },
    ...this.directory.departments().map((d) => ({ value: d.id, label: d.name })),
  ]);

  private sub: Subscription | null = null;

  constructor() {
    providePageContext(() => ({
      module: TRAINING_MODULE,
      view: 'calendar',
      title: this.language.translate('training.plan.title'),
    }));
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (orgId && this.access.canOversee()) {
        untracked(() => {
          this.directory.ensureLoaded();
          this.api.listCourses(orgId, { status: ['published'], limit: 200 }).subscribe({
            next: (res) => this.courses.set(res.items),
            error: () => this.courses.set([]),
          });
        });
      }
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = {
        start: this.start(),
        months: 12,
        course_id: this.courseId() || undefined,
        department_id: this.department() || undefined,
      };
      this.tick();
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.failed.set(false);
        this.sub = this.api.plan(orgId, query).subscribe({
          next: (p) => this.plan.set(p),
          error: () => {
            this.plan.set(null);
            this.failed.set(true);
          },
        });
      });
    });
  }

  /** "november 2026" in the UI language. */
  protected monthLabel(key: string): string {
    return new Intl.DateTimeFormat(this.language.active() === 'nb' ? 'nb-NO' : 'en-GB', {
      month: 'long',
      year: 'numeric',
    }).format(monthDate(key));
  }

  protected move(delta: number): void {
    this.start.set(shiftMonth(this.start(), delta));
  }

  protected reload(): void {
    this.tick.update((n) => n + 1);
  }

  protected print(): void {
    globalThis.print?.();
  }
}
