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
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { FollowUpTask } from '../components/follow-up-task';
import { FrameworkSelect } from '../components/framework-select';
import { MetricView } from '../components/metric-view';
import { ReportKpi } from '../components/report-kpi';
import { ReportWidgets } from '../components/report-widgets';
import { ReportsNav } from '../components/reports-nav';
import { Sparkline } from '../components/sparkline';
import { reportErrorKey } from '../data/report-errors';
import {
  calendarTone,
  labelOr,
  localized,
  metricFieldLabel,
  moduleLabelKey,
  trendDirection,
} from '../data/report-display';
import {
  COMPLIANCE_AUDIENCES,
  CalendarItem,
  ComplianceAudience,
  ComplianceResponse,
  FrameworkKey,
  MetricBlock,
  REPORTS_MODULE,
  REPORTS_PERMISSIONS,
  STATE_OF_COMPLIANCE_ASSIST,
  TrendSeries,
  isFrameworkKey,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { pluralKey } from '../../../shared/i18n/plural';
import { ScopedText } from '../data/scoped-text';
import { StandardOptions } from '../data/standard-options';
import { frameworkOf } from '../../../shared/requirement-links/requirement-label';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly messageKey: string }
  | { readonly status: 'ready'; readonly value: ComplianceResponse };

export const PERIOD_OPTIONS: readonly number[] = [30, 90, 180, 365];

/** Metric fields of a findings source shown as its compact numbers (in this order). */
const FINDING_FIELDS = ['overdue', 'open_actions', 'overdue_actions', 'overdue_inspections'];

/**
 * `/reports`: the reporting overview, the numbers management review and auditors
 * ask for first (ISO 9.1 and 9.3). Key numbers with a one-line explanation and a
 * 12-month trend; a link to Standards for requirement coverage (plan decision 10: the
 * coverage answer lives on Home and Standards, not here); overdue deadlines with "Lag oppgave"; open deviations and
 * findings from every module that has them; the risk heat map, training completion
 * and document reviews when those modules are on; the monthly trends; the caller's
 * role overview; and the written "state of compliance" summary. The standard is kept
 * in `?framework=`.
 */
@Component({
  selector: 'app-compliance-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    MarkdownPipe,
    AiAssistButton,
    TourStepDirective,
    WhyItMatters,
    Badge,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    LoadingState,
    PageHeader,
    FollowUpTask,
    FrameworkSelect,
    MetricView,
    ReportKpi,
    ReportWidgets,
    ReportsNav,
    Sparkline,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="modules.names.reports"
        descriptionKey="reports.overview.description"
        [breadcrumbs]="[{ labelKey: 'modules.names.reports' }]"
        [settingsLink]="canManage() ? '/reports/dashboards' : null"
      >
        <span meta>
          @if (generatedAt(); as at) {
            {{ 'reports.overview.generatedAt' | transloco: { date: (at | localDate) } }}
          }
        </span>
        <app-framework-select
          secondary
          [appTourStep]="'reports-framework'"
          [options]="frameworkOptions()"
          [value]="selected()"
          (valueChange)="selectFramework($event)"
        />
      </app-page-header>

      <app-reports-nav />
      <app-help-strip
        scope="reports"
        page="overview"
        tour="overview"
        lesson="measuring-compliance"
      />

      @switch (state().status) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state [bodyKey]="errorKey()" (retry)="reload()" />
        }
        @case ('ready') {
          @if (data(); as d) {
            <div
              class="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3"
              [appTourStep]="'reports-kpis'"
              data-testid="overview-kpis"
            >
              <app-report-kpi
                testId="kpi-overdue"
                [label]="'reports.overview.kpi.overdue' | transloco"
                [value]="d.overdue.total"
                [hint]="'reports.overview.kpi.overdueHint' | transloco"
                [tone]="d.overdue.total > 0 ? 'warn' : 'pass'"
                link="/reports/calendar"
                [queryParams]="{ overdue: '1', view: 'list' }"
              />
              <app-report-kpi
                testId="kpi-findings"
                [label]="'reports.overview.kpi.findings' | transloco"
                [value]="d.open_findings.total"
                [hint]="'reports.overview.kpi.findingsHint' | transloco"
                [tone]="d.open_findings.total > 0 ? 'warn' : 'pass'"
                link="/deviations"
                [trend]="trend('deviations.open')"
              />
              <app-report-kpi
                testId="kpi-tasks"
                [label]="'reports.overview.kpi.tasks' | transloco"
                [value]="d.tasks?.value ?? '—'"
                [hint]="tasksHint()"
                [tone]="(d.tasks?.value ?? 0) > 0 ? 'warn' : 'neutral'"
                link="/my-work"
                [trend]="trend('tasks.overdue')"
              />
            </div>
            <p
              class="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-fg-muted"
              data-testid="overview-coverage-link"
            >
              <span>{{ 'reports.overview.coverage.pointer' | transloco }}</span>
              <a routerLink="/standards" class="font-semibold text-accent hover:underline">{{
                'reports.overview.coverage.open' | transloco
              }}</a>
            </p>

            <div class="grid gap-4 lg:grid-cols-2">
              <app-card>
                <section aria-labelledby="ov-overdue" data-testid="overview-overdue">
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 id="ov-overdue" class="text-card font-semibold text-fg">
                      {{ 'reports.overview.overdue.title' | transloco }}
                    </h2>
                    <a
                      routerLink="/reports/calendar"
                      [queryParams]="{ overdue: '1', view: 'list' }"
                      class="text-meta font-semibold text-accent hover:underline"
                    >
                      {{ 'reports.overview.overdue.open' | transloco }}
                    </a>
                  </div>
                  @if (d.overdue.total === 0) {
                    <p class="text-ui text-pass-ink">
                      {{ 'reports.overview.overdue.none' | transloco }}
                    </p>
                  } @else {
                    <ul class="mb-3 flex flex-wrap gap-1.5" data-testid="overdue-areas">
                      @for (m of d.overdue.by_module; track m.module) {
                        <li>
                          <a
                            routerLink="/reports/calendar"
                            [queryParams]="{ overdue: '1', view: 'list', module: m.module }"
                            class="inline-flex min-h-7 items-center gap-1 rounded-full border border-warn/30 bg-warn-soft px-2.5 text-meta font-semibold text-warn-ink hover:border-warn"
                            [attr.aria-label]="
                              plural('reports.overview.overdue.areaLink', m.count)
                                | transloco: { area: moduleName(m.module), count: m.count }
                            "
                            >{{ moduleName(m.module) }} · {{ m.count }}</a
                          >
                        </li>
                      }
                    </ul>
                    <ul class="flex flex-col divide-y divide-border">
                      @for (item of d.overdue.items; track item.entity_type + item.entity_id) {
                        <li class="flex items-center justify-between gap-3 py-2 text-ui">
                          <span class="min-w-0">
                            @if (link(item.url); as target) {
                              <a
                                [routerLink]="target.path"
                                [queryParams]="target.queryParams"
                                class="block truncate text-fg hover:text-accent hover:underline"
                              >
                                @if (item.code) {
                                  <span class="font-mono text-meta text-fg-muted">{{
                                    item.code
                                  }}</span>
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
                          <span class="flex flex-none items-center gap-1.5">
                            <app-badge [tone]="tone(item)">{{ item.due_at | localDay }}</app-badge>
                            @if (canCreateTasks()) {
                              <button
                                type="button"
                                class="inline-flex h-8 items-center rounded-tile px-2 text-meta font-semibold text-accent hover:bg-accent-soft"
                                [attr.aria-label]="
                                  'reports.followUp.createFor'
                                    | transloco: { title: item.code || item.title }
                                "
                                (click)="followUp.set(item)"
                              >
                                {{ 'reports.followUp.create' | transloco }}
                              </button>
                            }
                          </span>
                        </li>
                      }
                    </ul>
                    @if (d.overdue.truncated || d.overdue.total > d.overdue.items.length) {
                      <p class="mt-2 text-meta text-fg-subtle">
                        {{
                          'reports.overview.overdue.more'
                            | transloco: { shown: d.overdue.items.length, total: d.overdue.total }
                        }}
                      </p>
                    }
                  }
                </section>
              </app-card>

              <app-card>
                <section aria-labelledby="ov-findings" data-testid="overview-findings">
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 id="ov-findings" class="text-card font-semibold text-fg">
                      {{ 'reports.overview.findings.title' | transloco }}
                    </h2>
                    <a
                      routerLink="/deviations"
                      class="text-meta font-semibold text-accent hover:underline"
                    >
                      {{ 'reports.overview.findings.open' | transloco }}
                    </a>
                  </div>
                  <ul class="flex flex-col divide-y divide-border">
                    @for (source of d.open_findings.sources; track source.key) {
                      <li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                        <span class="min-w-0">
                          @if (blockLink(source); as target) {
                            <a
                              [routerLink]="target.path"
                              [queryParams]="target.queryParams"
                              class="text-ui font-semibold text-fg hover:text-accent hover:underline"
                              >{{ blockTitle(source) }}</a
                            >
                          } @else {
                            <span class="text-ui font-semibold text-fg">{{
                              blockTitle(source)
                            }}</span>
                          }
                          <span class="block text-meta text-fg-muted">
                            @for (n of findingNumbers(source); track n.field; let last = $last) {
                              {{ n.label }}: {{ n.value | localNumber }}{{ last ? '' : ' · ' }}
                            }
                          </span>
                        </span>
                        <span class="font-display text-section font-bold text-fg">{{
                          openCount(source) | localNumber
                        }}</span>
                      </li>
                    } @empty {
                      <li class="py-2 text-ui text-fg-muted">
                        {{ 'reports.overview.findings.none' | transloco }}
                      </li>
                    }
                  </ul>
                </section>
              </app-card>

              @if (d.documents; as docs) {
                <app-card>
                  <section aria-labelledby="ov-docs">
                    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h2 id="ov-docs" class="text-card font-semibold text-fg">
                        {{ 'reports.overview.documents.title' | transloco }}
                      </h2>
                      <a
                        routerLink="/documents"
                        class="text-meta font-semibold text-accent hover:underline"
                      >
                        {{ 'reports.overview.documents.open' | transloco }}
                      </a>
                    </div>
                    <p class="mb-3 text-meta text-fg-muted">
                      {{ 'reports.overview.documents.definition' | transloco }}
                    </p>
                    <dl class="grid grid-cols-2 gap-2">
                      <div class="rounded-tile bg-surface-2 px-3 py-2">
                        <dt class="text-meta text-fg-muted">
                          {{ 'reports.fields.overdue' | transloco }}
                        </dt>
                        <dd
                          class="font-mono text-section font-semibold"
                          [class.text-warn-ink]="docs.overdue > 0"
                        >
                          {{ docs.overdue }}
                        </dd>
                      </div>
                      <div class="rounded-tile bg-surface-2 px-3 py-2">
                        <dt class="text-meta text-fg-muted">
                          {{ 'reports.fields.due_soon' | transloco }}
                        </dt>
                        <dd class="font-mono text-section font-semibold text-fg">
                          {{ docs.due_soon }}
                        </dd>
                      </div>
                    </dl>
                  </section>
                </app-card>
              }

              @if (d.risk_heat_map; as risk) {
                <app-card>
                  <section aria-labelledby="ov-risk" data-testid="overview-risk">
                    <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <h2 id="ov-risk" class="text-card font-semibold text-fg">
                        {{ blockTitle(risk) }}
                      </h2>
                      @if (blockLink(risk); as target) {
                        <a
                          [routerLink]="target.path"
                          class="text-meta font-semibold text-accent hover:underline"
                        >
                          {{ 'reports.overview.risk.open' | transloco }}
                        </a>
                      }
                    </div>
                    <p class="mb-3 text-meta text-fg-muted">{{ blockDescription(risk) }}</p>
                    <app-metric-view
                      kind="heatmap"
                      [data]="risk.data"
                      [fieldLabels]="risk.field_labels"
                    />
                  </section>
                </app-card>
              }

              @if (d.training_compliance; as training) {
                <app-card>
                  <section aria-labelledby="ov-training" data-testid="overview-training">
                    <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <h2 id="ov-training" class="text-card font-semibold text-fg">
                        {{ blockTitle(training) }}
                      </h2>
                      @if (blockLink(training); as target) {
                        <a
                          [routerLink]="target.path"
                          class="text-meta font-semibold text-accent hover:underline"
                        >
                          {{ 'reports.overview.training.open' | transloco }}
                        </a>
                      }
                    </div>
                    <p class="mb-3 text-meta text-fg-muted">{{ blockDescription(training) }}</p>
                    <app-metric-view
                      kind="training"
                      [data]="training.data"
                      [fieldLabels]="training.field_labels"
                    />
                  </section>
                </app-card>
              }
            </div>

            @if (trendRows().length) {
              <app-card class="mt-6 block">
                <section aria-labelledby="ov-trends" data-testid="overview-trends">
                  <h2 id="ov-trends" class="text-card font-semibold text-fg">
                    {{ 'reports.trends.title' | transloco }}
                  </h2>
                  <p class="mb-3 text-meta text-fg-muted">
                    {{ 'reports.trends.subtitle' | transloco }}
                  </p>
                  <ul class="grid gap-x-6 gap-y-1 md:grid-cols-2">
                    @for (row of trendRows(); track row.id) {
                      <li
                        class="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0 md:[&:nth-last-child(2)]:border-b-0"
                      >
                        <span class="min-w-0">
                          <span class="block truncate text-ui text-fg">{{ row.label }}</span>
                          <span
                            class="block text-meta"
                            [class.text-pass-ink]="row.direction === 'better'"
                            [class.text-warn-ink]="row.direction === 'worse'"
                            [class.text-fg-subtle]="row.direction === 'same'"
                            >{{ row.delta }}</span
                          >
                        </span>
                        <span class="flex flex-none items-center gap-3">
                          <app-sparkline [data]="row.series.points" />
                          <span class="w-14 text-right font-mono text-ui font-semibold text-fg">{{
                            row.value
                          }}</span>
                        </span>
                      </li>
                    }
                  </ul>
                </section>
              </app-card>
            }
          }
        }
      }

      <app-report-widgets class="mt-6 block" [framework]="selected()" />

      <app-card class="mt-6 block">
        <section aria-labelledby="ov-narrative" [appTourStep]="'reports-narrative'">
          <h2 id="ov-narrative" class="text-card font-semibold text-fg">
            {{ 'reports.narrative.title' | transloco }}
          </h2>
          <p class="mt-0.5 mb-3 text-meta text-fg-muted">
            {{ 'reports.narrative.subtitle' | transloco }}
          </p>
          <div class="mb-3 flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1">
              <label for="ov-audience" class="text-meta font-semibold text-fg-muted">
                {{ 'reports.narrative.audience' | transloco }}
              </label>
              <select
                id="ov-audience"
                class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                (change)="audience.set($any($event.target).value)"
              >
                @for (a of audiences; track a) {
                  <option [value]="a" [selected]="a === audience()">
                    {{ 'reports.narrative.audiences.' + a | transloco }}
                  </option>
                }
              </select>
            </div>
            <div class="flex flex-col gap-1">
              <label for="ov-period" class="text-meta font-semibold text-fg-muted">
                {{ 'reports.narrative.period' | transloco }}
              </label>
              <select
                id="ov-period"
                class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                (change)="period.set(+$any($event.target).value)"
              >
                @for (days of periods; track days) {
                  <option [value]="days" [selected]="days === period()">
                    {{ 'reports.narrative.days' | transloco: { count: days } }}
                  </option>
                }
              </select>
            </div>
            <app-ai-assist-button
              [assist]="assistKey"
              labelKey="reports.narrative.generate"
              variant="primary"
              [input]="assistInput()"
              (text)="narrative.set($event)"
            />
            @if (narrative()) {
              <app-button variant="ghost" size="sm" (click)="copy()">
                {{ 'reports.narrative.copy' | transloco }}
              </app-button>
            }
          </div>
          @if (narrative(); as text) {
            <article
              class="cf-prose max-w-none rounded-tile border border-border bg-bg p-4 text-body leading-relaxed text-fg"
              aria-live="polite"
              data-testid="narrative"
              [innerHTML]="text | appMarkdown"
            ></article>
            <p class="mt-2 text-meta text-fg-subtle">
              {{ 'reports.narrative.disclaimer' | transloco }}
            </p>
          } @else {
            <p class="text-ui text-fg-muted">{{ 'reports.narrative.empty' | transloco }}</p>
          }
        </section>
      </app-card>

      <app-why-it-matters class="mt-6 block" scope="reports" page="overview" />
    </div>

    <app-follow-up-task [item]="followUp()" (closed)="followUp.set(null)" />
  `,
})
export class ComplianceOverview {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly scoped = inject(ScopedText);
  private readonly standardOptions = inject(StandardOptions);

  /** `?framework=` (component input binding). */
  readonly framework = input<string | undefined>(undefined);

  protected readonly assistKey = STATE_OF_COMPLIANCE_ASSIST;
  protected readonly plural = pluralKey;
  protected readonly audiences = COMPLIANCE_AUDIENCES;
  protected readonly periods = PERIOD_OPTIONS;

  protected readonly selected = computed<FrameworkKey | null>(() => {
    const raw = this.framework();
    return isFrameworkKey(raw) ? raw : null;
  });

  protected readonly state = signal<State>({ status: 'loading' });
  protected readonly trends = signal<readonly TrendSeries[]>([]);
  protected readonly audience = signal<ComplianceAudience>('management');
  protected readonly period = signal(30);
  protected readonly narrative = signal('');
  protected readonly followUp = signal<CalendarItem | null>(null);

  private readonly granted = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canManage = computed(() =>
    this.granted().includes(REPORTS_PERMISSIONS.manage),
  );
  protected readonly canCreateTasks = computed(() => this.granted().includes('tasks:write'));

  /** The standards the organisation has enabled (all eight until they are known). */
  protected readonly frameworkOptions = computed<readonly FrameworkKey[]>(() => {
    const keys = this.standardOptions
      .items()
      .map((s) => s.framework || frameworkOf(s.standard_key))
      .filter(isFrameworkKey);
    const unique = [...new Set(keys)];
    const current = this.selected();
    if (current && !unique.includes(current)) {
      unique.push(current);
    }
    return unique.length ? unique : (['iso9001', 'iso27001', 'gdpr'] as FrameworkKey[]);
  });

  protected readonly data = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.value : null;
  });
  protected readonly generatedAt = computed(() => this.data()?.generated_at ?? null);
  protected readonly errorKey = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.messageKey : 'ui.error.body';
  });

  protected readonly tasksHint = computed(() => {
    const tasks = this.data()?.tasks;
    if (!tasks) {
      return this.language.translate('reports.overview.kpi.tasksUnavailable');
    }
    return tasks.due_soon > 0
      ? this.language.translate(pluralKey('reports.overview.kpi.dueSoon', tasks.due_soon), {
          count: tasks.due_soon,
        })
      : this.language.translate('reports.overview.kpi.noneDueSoon');
  });

  /** Every series with at least two months, as display rows. */
  protected readonly trendRows = computed(() => {
    const lang = this.language.active();
    return this.trends()
      .filter((t) => t.points.length > 1)
      .map((t) => {
        const label = localized(t.label, lang, t.key);
        const scope = localized(t.scope_label, lang, '');
        return {
          id: `${t.key}:${t.scope ?? ''}`,
          series: t,
          label: scope ? `${label} · ${scope}` : label,
          value: this.trendValue(t, t.latest),
          delta: this.trendDelta(t),
          direction: trendDirection(t),
        };
      });
  });

  protected readonly assistInput = computed(() => ({
    framework: this.selected(),
    audience: this.audience(),
    period_days: this.period(),
  }));

  private sub = new Subscription();
  private trendSub = new Subscription();

  constructor() {
    this.standardOptions.ensure();
    providePageContext(() => ({
      module: REPORTS_MODULE,
      view: 'dashboard',
      title: this.language.translate('modules.names.reports'),
    }));
    inject(DestroyRef).onDestroy(() => {
      this.sub.unsubscribe();
      this.trendSub.unsubscribe();
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const framework = this.selected();
      untracked(() => this.load(orgId, framework));
    });
  }

  protected selectFramework(framework: FrameworkKey | null): void {
    this.narrative.set('');
    void this.router.navigate([], {
      queryParams: { framework },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.selected());
  }

  protected trend(key: string): TrendSeries | null {
    return this.trends().find((t) => t.key === key && !t.scope) ?? null;
  }

  protected moduleName(module: string): string {
    return labelOr((k) => this.language.translate(k), moduleLabelKey(module), module);
  }

  protected blockTitle(block: MetricBlock): string {
    const own = localized(block.title, this.language.active(), '');
    return this.scoped.text(block.title_key, own || this.moduleName(block.module));
  }

  protected blockDescription(block: MetricBlock): string {
    const own = localized(block.description, this.language.active(), '');
    return this.scoped.text(block.title_key?.replace(/\.title$/, '.description'), own);
  }

  protected blockLink(block: MetricBlock) {
    const url = block.data['url'];
    if (typeof url === 'string') {
      return internalLink(url);
    }
    return block.module ? internalLink(`/${block.module.replace(/_/g, '-')}`) : null;
  }

  /** The headline count of a findings source (open, else total). */
  protected openCount(block: MetricBlock): number {
    const open = block.data['open'] ?? block.data['total'];
    return typeof open === 'number' ? open : 0;
  }

  /** The compact numbers next to a findings source ("Forfalt: 2 · Åpne tiltak: 3"). */
  protected findingNumbers(block: MetricBlock): { field: string; label: string; value: number }[] {
    const lang = this.language.active();
    return FINDING_FIELDS.filter((f) => typeof block.data[f] === 'number').map((field) => ({
      field,
      value: block.data[field] as number,
      label: metricFieldLabel((k) => this.language.translate(k), field, block.field_labels, lang),
    }));
  }

  protected link(url: string | null) {
    return internalLink(url);
  }

  protected tone(item: CalendarItem) {
    return calendarTone(item);
  }

  protected copy(): void {
    const text = this.narrative();
    void navigator.clipboard?.writeText(text).then(
      () => this.notifications.success('reports.narrative.copied'),
      () => undefined,
    );
  }

  private trendValue(series: TrendSeries, value: number | null): string {
    if (value === null || value === undefined) {
      return '—';
    }
    const text = new Intl.NumberFormat(this.language.locale()).format(Math.round(value));
    return series.unit === 'percent' ? `${text} %` : text;
  }

  private trendDelta(series: TrendSeries): string {
    const delta = series.delta;
    if (delta === null || delta === undefined) {
      return this.language.translate('reports.trends.noPrevious');
    }
    const amount = Math.abs(Math.round(delta));
    if (amount === 0) {
      return this.language.translate('reports.trends.same');
    }
    const unit = series.unit === 'percent' ? 'Points' : 'Count';
    return this.language.translate(
      pluralKey(`reports.trends.${delta > 0 ? 'up' : 'down'}${unit}`, amount),
      {
        count: amount,
      },
    );
  }

  private load(orgId: string | null, framework: FrameworkKey | null): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    this.trendSub.unsubscribe();
    this.trendSub = new Subscription();
    if (!orgId) {
      return;
    }
    this.state.set({ status: 'loading' });
    this.sub.add(
      this.api.compliance(orgId, framework).subscribe({
        next: (value) => this.state.set({ status: 'ready', value }),
        error: (error: unknown) =>
          this.state.set({ status: 'error', messageKey: reportErrorKey(error) }),
      }),
    );
    // History is a bonus: an older backend (404) or a failure just hides it.
    this.trends.set([]);
    this.trendSub.add(
      this.api.trends(orgId, { months: 12, framework }).subscribe({
        next: (res) => this.trends.set(res.items ?? []),
        error: () => this.trends.set([]),
      }),
    );
  }
}
