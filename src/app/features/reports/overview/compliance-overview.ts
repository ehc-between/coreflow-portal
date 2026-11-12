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
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { FrameworkSelect } from '../components/framework-select';
import { MetricView } from '../components/metric-view';
import { ReportsLessonButton } from '../components/reports-lesson-button';
import { reportErrorKey } from '../data/report-errors';
import { calendarTone, labelOr, moduleLabelKey, scoreTone } from '../data/report-display';
import {
  COMPLIANCE_AUDIENCES,
  ComplianceAudience,
  ComplianceResponse,
  FrameworkKey,
  MetricBlock,
  REPORTS_MODULE,
  STATE_OF_COMPLIANCE_ASSIST,
  isFrameworkKey,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { ScopedText } from '../data/scoped-text';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly messageKey: string }
  | { readonly status: 'ready'; readonly value: ComplianceResponse };

export const PERIOD_OPTIONS: readonly number[] = [30, 90, 180, 365];

/**
 * `/reports`: the compliance dashboard for one framework (or all) — readiness per
 * standard, overdue items, open findings, the risk heat map and training
 * compliance (once those modules plug in), document reviews and overdue tasks —
 * plus the narrative "state of compliance" report written by the assistant.
 * The framework is kept in `?framework=`.
 */
@Component({
  selector: 'app-compliance-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    TourButton,
    TourStepDirective,
    Badge,
    Button,
    Card,
    KpiTile,
    FrameworkSelect,
    MetricView,
    ReportsLessonButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8">
      <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'reports.overview.title' | transloco }}
          </h1>
          <p class="mt-1 text-[13.5px] text-fg-muted">
            @if (generatedAt(); as at) {
              {{ 'reports.overview.generatedAt' | transloco: { date: (at | localDate: 'medium') } }}
            } @else {
              {{ 'reports.overview.subtitle' | transloco }}
            }
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-framework-select
            [appTourStep]="'reports-framework'"
            [value]="selected()"
            (valueChange)="selectFramework($event)"
          />
          <app-tour-button scope="reports" tour="overview" />
          <app-reports-lesson-button lesson="measuring-compliance" />
        </div>
      </header>

      <app-guide-intro class="mb-4 block" scope="reports" page="overview" />

      @switch (state().status) {
        @case ('loading') {
          <p class="py-10 text-center text-[13.5px] text-fg-muted" role="status">
            {{ 'reports.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-card>
            <div class="flex flex-col items-center gap-3 py-8 text-center">
              <p class="text-[13.5px] text-fg-muted" role="alert">{{ errorKey() | transloco }}</p>
              <app-button variant="secondary" size="sm" (click)="reload()">
                {{ 'reports.common.retry' | transloco }}
              </app-button>
            </div>
          </app-card>
        }
        @case ('ready') {
          @if (data(); as d) {
            <div
              class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
              [appTourStep]="'reports-kpis'"
              data-testid="overview-kpis"
            >
              <app-kpi-tile
                [label]="'reports.overview.kpi.readiness' | transloco"
                [value]="readinessValue()"
                [tone]="readinessTone()"
                [delta]="d.readiness ? '' : ('reports.overview.kpi.noStandards' | transloco)"
              />
              <a
                routerLink="/reports/calendar"
                [queryParams]="{ overdue: '1' }"
                class="block rounded-card focus-visible:outline-2 focus-visible:outline-accent"
              >
                <app-kpi-tile
                  [label]="'reports.overview.kpi.overdue' | transloco"
                  [value]="d.overdue.total"
                  [tone]="d.overdue.total > 0 ? 'fail' : 'pass'"
                />
              </a>
              <app-kpi-tile
                [label]="'reports.overview.kpi.findings' | transloco"
                [value]="d.open_findings.total"
                [tone]="d.open_findings.total > 0 ? 'warn' : 'pass'"
              />
              <app-kpi-tile
                [label]="'reports.overview.kpi.tasks' | transloco"
                [value]="d.tasks?.value ?? '—'"
                [tone]="(d.tasks?.value ?? 0) > 0 ? 'fail' : 'neutral'"
                [delta]="
                  d.tasks
                    ? ('reports.overview.kpi.dueSoon' | transloco: { count: d.tasks.due_soon })
                    : ''
                "
              />
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
              <app-card>
                <section aria-labelledby="ov-readiness">
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <h2 id="ov-readiness" class="text-[14px] font-semibold text-fg">
                      {{ 'reports.overview.readiness.title' | transloco }}
                    </h2>
                    <div class="flex items-center gap-1">
                      <app-ask-about
                        field="readiness"
                        [prompt]="'reports.overview.readiness.ask' | transloco"
                      />
                      <a
                        routerLink="/standards"
                        class="text-[12.5px] font-semibold text-accent hover:underline"
                      >
                        {{ 'reports.overview.readiness.open' | transloco }}
                      </a>
                    </div>
                  </div>
                  @if (d.readiness; as readiness) {
                    <app-metric-view kind="readiness" [data]="$any(readiness)" />
                  } @else {
                    <p class="text-[13px] text-fg-muted">
                      {{ 'reports.overview.readiness.unavailable' | transloco }}
                    </p>
                  }
                  <app-field-help
                    class="mt-3 block"
                    scope="reports"
                    page="overview"
                    field="readiness"
                  />
                </section>
              </app-card>

              <app-card>
                <section aria-labelledby="ov-overdue">
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <h2 id="ov-overdue" class="text-[14px] font-semibold text-fg">
                      {{ 'reports.overview.overdue.title' | transloco }}
                    </h2>
                    <a
                      routerLink="/reports/calendar"
                      [queryParams]="{ overdue: '1' }"
                      class="text-[12.5px] font-semibold text-accent hover:underline"
                    >
                      {{ 'reports.overview.overdue.open' | transloco }}
                    </a>
                  </div>
                  @if (d.overdue.total === 0) {
                    <p class="text-[13px] text-pass">
                      {{ 'reports.overview.overdue.none' | transloco }}
                    </p>
                  } @else {
                    <div class="mb-3 flex flex-wrap gap-1.5">
                      @for (m of d.overdue.by_module; track m.module) {
                        <app-badge tone="fail"
                          >{{ moduleName(m.module) }} · {{ m.count }}</app-badge
                        >
                      }
                    </div>
                    <ul class="flex flex-col divide-y divide-border">
                      @for (item of d.overdue.items; track item.entity_type + item.entity_id) {
                        <li class="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                          @if (link(item.url); as target) {
                            <a
                              [routerLink]="target.path"
                              [queryParams]="target.queryParams"
                              class="min-w-0 truncate text-fg hover:text-accent hover:underline"
                            >
                              @if (item.code) {
                                <span class="font-mono text-[12px] text-fg-muted">{{
                                  item.code
                                }}</span>
                              }
                              {{ item.title }}
                            </a>
                          } @else {
                            <span class="min-w-0 truncate text-fg">{{ item.title }}</span>
                          }
                          <app-badge [tone]="tone(item)">{{ item.due_at | localDay }}</app-badge>
                        </li>
                      }
                    </ul>
                    @if (d.overdue.truncated) {
                      <p class="mt-2 text-[12px] text-fg-subtle">
                        {{ 'reports.overview.overdue.truncated' | transloco }}
                      </p>
                    }
                  }
                </section>
              </app-card>

              <app-card>
                <section aria-labelledby="ov-findings">
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <h2 id="ov-findings" class="text-[14px] font-semibold text-fg">
                      {{ 'reports.overview.findings.title' | transloco }}
                    </h2>
                    <a
                      routerLink="/deviations"
                      class="text-[12.5px] font-semibold text-accent hover:underline"
                    >
                      {{ 'reports.overview.findings.open' | transloco }}
                    </a>
                  </div>
                  @for (source of d.open_findings.sources; track source.key) {
                    <div class="mb-3 last:mb-0">
                      <p
                        class="mb-1.5 text-[12px] font-semibold tracking-[0.04em] text-fg-subtle uppercase"
                      >
                        {{ blockTitle(source) }}
                      </p>
                      <app-metric-view kind="findings" [data]="source.data" />
                    </div>
                  } @empty {
                    <p class="text-[13px] text-fg-muted">
                      {{ 'reports.overview.findings.none' | transloco }}
                    </p>
                  }
                </section>
              </app-card>

              <app-card>
                <section aria-labelledby="ov-docs">
                  <h2 id="ov-docs" class="mb-3 text-[14px] font-semibold text-fg">
                    {{ 'reports.overview.documents.title' | transloco }}
                  </h2>
                  @if (d.documents; as docs) {
                    <dl class="grid grid-cols-2 gap-2">
                      <div class="rounded-[8px] bg-surface-2 px-3 py-2">
                        <dt class="text-[12px] text-fg-muted">
                          {{ 'reports.fields.overdue' | transloco }}
                        </dt>
                        <dd
                          class="font-mono text-[18px] font-semibold"
                          [class.text-fail]="docs.overdue > 0"
                        >
                          {{ docs.overdue }}
                        </dd>
                      </div>
                      <div class="rounded-[8px] bg-surface-2 px-3 py-2">
                        <dt class="text-[12px] text-fg-muted">
                          {{ 'reports.fields.due_soon' | transloco }}
                        </dt>
                        <dd class="font-mono text-[18px] font-semibold text-fg">
                          {{ docs.due_soon }}
                        </dd>
                      </div>
                    </dl>
                  } @else {
                    <p class="text-[13px] text-fg-muted">
                      {{ 'reports.overview.documents.unavailable' | transloco }}
                    </p>
                  }
                </section>
              </app-card>

              <app-card>
                <section aria-labelledby="ov-risk">
                  <h2 id="ov-risk" class="mb-3 text-[14px] font-semibold text-fg">
                    {{ 'reports.overview.risk.title' | transloco }}
                  </h2>
                  @if (d.risk_heat_map; as risk) {
                    <app-metric-view kind="heatmap" [data]="risk.data" />
                  } @else {
                    <p class="text-[13px] text-fg-muted">
                      {{ 'reports.overview.risk.unavailable' | transloco }}
                    </p>
                  }
                </section>
              </app-card>

              <app-card>
                <section aria-labelledby="ov-training">
                  <h2 id="ov-training" class="mb-3 text-[14px] font-semibold text-fg">
                    {{ 'reports.overview.training.title' | transloco }}
                  </h2>
                  @if (d.training_compliance; as training) {
                    <app-metric-view kind="training" [data]="training.data" />
                  } @else {
                    <p class="text-[13px] text-fg-muted">
                      {{ 'reports.overview.training.unavailable' | transloco }}
                    </p>
                  }
                </section>
              </app-card>
            </div>
          }
        }
      }

      <app-card class="mt-4 block">
        <section aria-labelledby="ov-narrative" [appTourStep]="'reports-narrative'">
          <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 id="ov-narrative" class="text-[14px] font-semibold text-fg">
                {{ 'reports.narrative.title' | transloco }}
              </h2>
              <p class="mt-0.5 text-[12.5px] text-fg-muted">
                {{ 'reports.narrative.subtitle' | transloco }}
              </p>
            </div>
          </div>
          <div class="mb-3 flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1">
              <label for="ov-audience" class="text-[12.5px] font-semibold text-fg-muted">
                {{ 'reports.narrative.audience' | transloco }}
              </label>
              <select
                id="ov-audience"
                class="h-9 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-accent"
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
              <label for="ov-period" class="text-[12.5px] font-semibold text-fg-muted">
                {{ 'reports.narrative.period' | transloco }}
              </label>
              <select
                id="ov-period"
                class="h-9 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-accent"
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
              class="prose-sm max-w-none rounded-tile border border-border bg-bg p-4 text-[13.5px] leading-relaxed text-fg"
              aria-live="polite"
              data-testid="narrative"
              [innerHTML]="text | appMarkdown"
            ></article>
            <p class="mt-2 text-[11.5px] text-fg-subtle">
              {{ 'reports.narrative.disclaimer' | transloco }}
            </p>
          } @else {
            <p class="text-[13px] text-fg-muted">{{ 'reports.narrative.empty' | transloco }}</p>
          }
        </section>
      </app-card>

      <app-why-it-matters class="mt-4 block" scope="reports" page="overview" />
    </div>
  `,
})
export class ComplianceOverview {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly scoped = inject(ScopedText);

  /** `?framework=` (component input binding). */
  readonly framework = input<string | undefined>(undefined);

  protected readonly assistKey = STATE_OF_COMPLIANCE_ASSIST;
  protected readonly audiences = COMPLIANCE_AUDIENCES;
  protected readonly periods = PERIOD_OPTIONS;

  protected readonly selected = computed<FrameworkKey | null>(() => {
    const raw = this.framework();
    return isFrameworkKey(raw) ? raw : null;
  });

  protected readonly state = signal<State>({ status: 'loading' });
  protected readonly audience = signal<ComplianceAudience>('management');
  protected readonly period = signal(30);
  protected readonly narrative = signal('');

  protected readonly data = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.value : null;
  });
  protected readonly generatedAt = computed(() => this.data()?.generated_at ?? null);
  protected readonly errorKey = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.messageKey : '';
  });
  protected readonly readinessTone = computed(() => scoreTone(this.data()?.readiness?.average));
  protected readonly readinessValue = computed(() => {
    const average = this.data()?.readiness?.average;
    return typeof average === 'number' ? average + ' %' : '—';
  });

  protected readonly assistInput = computed(() => ({
    framework: this.selected(),
    audience: this.audience(),
    period_days: this.period(),
  }));

  private sub = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: REPORTS_MODULE,
      view: 'dashboard',
      title: this.language.translate('reports.overview.title'),
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
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

  protected moduleName(module: string): string {
    return labelOr((k) => this.language.translate(k), moduleLabelKey(module), module);
  }

  protected blockTitle(block: MetricBlock): string {
    return this.scoped.text(block.title_key, this.moduleName(block.module));
  }

  protected link(url: string | null) {
    return internalLink(url);
  }

  protected tone = calendarTone;

  protected copy(): void {
    const text = this.narrative();
    void navigator.clipboard?.writeText(text).then(
      () => this.notifications.success('reports.narrative.copied'),
      () => undefined,
    );
  }

  private load(orgId: string | null, framework: FrameworkKey | null): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
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
  }
}
