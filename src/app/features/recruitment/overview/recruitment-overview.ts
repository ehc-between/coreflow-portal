import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalNumberPipe, LocalPercentPipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RecruitmentApi } from '../data/recruitment-api';
import { splitUrl } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  MODULE_KEY,
  OverviewCounter,
  RecruitmentOverview,
  STAGES,
  Stage,
} from '../data/recruitment.models';
import { injectRecruitmentNav, settingsLinkFor } from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';

/** The six "needs attention" counters, in priority order, with their tone when non-zero. */
const ATTENTION: readonly { readonly key: OverviewCounter; readonly tone: KpiTone }[] = [
  { key: 'approvals_waiting', tone: 'warn' },
  { key: 'screening_not_done', tone: 'warn' },
  { key: 'checks_overdue', tone: 'fail' },
  { key: 'offers_pending', tone: 'accent' },
  { key: 'stalled', tone: 'warn' },
  { key: 'deletions_next_30d', tone: 'info' },
];

/** Counters with their own list but no attention tone. */
const PIPELINE: readonly OverviewCounter[] = [
  'open_requisitions',
  'active_applications',
  'interviews_next_7d',
  'checks_open',
];

const ACTIVE_STAGES: readonly Stage[] = STAGES.filter(
  (s) => s !== 'hired' && s !== 'rejected' && s !== 'withdrawn',
);

interface Tile {
  readonly key: OverviewCounter;
  readonly value: number;
  readonly tone: KpiTone;
  readonly path: string | null;
  readonly queryParams: Record<string, string>;
}

/**
 * `/recruitment` (Oversikt): what needs attention now (approvals, screening not
 * done, overdue checks, offers, stalled candidates, deletions coming up), the
 * pipeline per stage, and the KPIs for the management review. Every counter opens
 * the filtered list behind it. Counts only; candidate names never appear here.
 */
@Component({
  selector: 'app-recruitment-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    TourStepDirective,
    WhyItMatters,
    LocalNumberPipe,
    LocalPercentPipe,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    ModuleNav,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="modules.names.recruitment"
        descriptionKey="recruitment.overview.description"
        [settingsLink]="settingsLink()"
      >
        @if (perms().write) {
          <a primary routerLink="/recruitment/requisitions/new" data-testid="overview-new">
            <app-button size="sm">
              <app-icon name="plus" [size]="15" />
              {{ 'recruitment.requisitions.new' | transloco }}
            </app-button>
          </a>
        }
      </app-page-header>
      <app-module-nav [items]="nav()" labelKey="modules.names.recruitment" />
      <app-help-strip scope="recruitment" page="overview" tour="overview" lesson="fair-screening" />

      @if (errorKey(); as key) {
        <app-error-state [bodyKey]="key" (retry)="reload()" />
      } @else if (!overview()) {
        <app-loading-state [rows]="5" />
      } @else {
        <section
          class="mb-6"
          aria-labelledby="ov-attention"
          appTourStep="recruitment-overview-attention"
        >
          <h2 id="ov-attention" class="mb-3 text-section font-bold text-fg">
            {{ 'recruitment.overview.attention' | transloco }}
          </h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            @for (t of attention(); track t.key) {
              <a
                [routerLink]="t.path"
                [queryParams]="t.queryParams"
                class="block rounded-card outline-none focus-visible:ring-2 focus-visible:ring-accent"
                [attr.data-testid]="'ov-' + t.key"
              >
                <app-kpi-tile
                  [label]="'recruitment.overview.counters.' + t.key | transloco"
                  [value]="t.value"
                  [tone]="t.value > 0 ? t.tone : 'neutral'"
                  [delta]="'recruitment.overview.open' | transloco"
                  deltaTone="neutral"
                />
              </a>
            }
          </div>
          @if (allClear()) {
            <p class="mt-3 text-ui text-fg-muted" data-testid="ov-all-clear">
              {{ 'recruitment.overview.allClear' | transloco }}
            </p>
          }
        </section>

        <div class="grid gap-6 lg:grid-cols-2">
          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-card font-bold text-fg">
                {{ 'recruitment.overview.pipeline' | transloco }}
              </h2>
              <a routerLink="/recruitment/applications" class="text-ui font-semibold text-accent">
                {{ 'recruitment.overview.seeAll' | transloco }}
              </a>
            </div>
            <ul class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              @for (key of pipelineCounters; track key) {
                <li>
                  <a
                    [routerLink]="tileFor(key).path"
                    [queryParams]="tileFor(key).queryParams"
                    class="flex flex-col rounded-tile border border-border px-3 py-2 hover:border-border-strong hover:bg-surface-2"
                  >
                    <span class="text-meta text-fg-muted">{{
                      'recruitment.overview.counters.' + key | transloco
                    }}</span>
                    <span class="text-section font-bold text-fg">{{
                      tileFor(key).value | localNumber
                    }}</span>
                  </a>
                </li>
              }
            </ul>
            <ul
              class="flex flex-col gap-2"
              [attr.aria-label]="'recruitment.overview.byStage' | transloco"
            >
              @for (row of stageRows(); track row.stage) {
                <li>
                  <a
                    routerLink="/recruitment/applications"
                    [queryParams]="{ stage: row.stage }"
                    class="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_40px] items-center gap-3 rounded-tile px-1 py-1 text-ui hover:bg-surface-2"
                  >
                    <span class="truncate text-fg">{{
                      'recruitment.stage.' + row.stage | transloco
                    }}</span>
                    <span class="h-2 rounded-full bg-surface-2" aria-hidden="true">
                      <span
                        class="block h-2 rounded-full bg-accent"
                        [style.width.%]="row.pct"
                      ></span>
                    </span>
                    <span class="text-right font-semibold text-fg">{{ row.count }}</span>
                  </a>
                </li>
              }
            </ul>
          </app-card>

          <app-card appTourStep="recruitment-overview-kpis">
            <h2 class="mb-1 text-card font-bold text-fg">
              {{ 'recruitment.overview.kpis' | transloco }}
            </h2>
            <p class="mb-3 text-meta text-fg-muted">
              {{ 'recruitment.overview.kpisIntro' | transloco }}
            </p>
            @let k = overview()!.kpis;
            <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-ui">
              <div>
                <dt class="text-meta text-fg-muted">
                  {{ 'recruitment.overview.kpi.hires' | transloco }}
                </dt>
                <dd class="text-section font-bold text-fg">{{ k.hires_365d | localNumber }}</dd>
              </div>
              <div>
                <dt class="text-meta text-fg-muted">
                  {{ 'recruitment.overview.kpi.daysToHire' | transloco }}
                </dt>
                <dd class="text-section font-bold text-fg">
                  {{
                    k.median_days_to_hire === null
                      ? ('common.empty.dash' | transloco)
                      : ('recruitment.overview.kpi.days'
                        | transloco: { count: (k.median_days_to_hire | localNumber: '1.0-0') })
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-meta text-fg-muted">
                  {{ 'recruitment.overview.kpi.checksComplete' | transloco }}
                </dt>
                <dd class="text-section font-bold text-fg">
                  {{
                    k.hires_checks_complete_pct === null
                      ? ('common.empty.dash' | transloco)
                      : (k.hires_checks_complete_pct | localPercent)
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-meta text-fg-muted">
                  {{ 'recruitment.overview.kpi.screeningComplete' | transloco }}
                </dt>
                <dd class="text-section font-bold text-fg">
                  {{
                    k.hires_screening_complete_pct === null
                      ? ('common.empty.dash' | transloco)
                      : (k.hires_screening_complete_pct | localPercent)
                  }}
                </dd>
              </div>
              <div class="col-span-2">
                <dt class="text-meta text-fg-muted">
                  {{ 'recruitment.overview.kpi.retentionOverdue' | transloco }}
                </dt>
                <dd
                  class="text-ui font-semibold"
                  [class]="k.retention_overdue > 0 ? 'text-warn-ink' : 'text-pass-ink'"
                >
                  {{
                    k.retention_overdue > 0
                      ? ('recruitment.overview.kpi.retentionOverdueSome'
                        | transloco: { count: k.retention_overdue })
                      : ('recruitment.overview.kpi.retentionOk' | transloco)
                  }}
                </dd>
              </div>
            </dl>
            <h3 class="mt-4 mb-2 text-ui font-semibold text-fg-muted">
              {{ 'recruitment.overview.kpi.rejectionReasons' | transloco }}
            </h3>
            @if (k.rejection_reasons.length === 0) {
              <p class="text-ui text-fg-muted">{{ 'common.empty.none' | transloco }}</p>
            } @else {
              <ul class="flex flex-col gap-1 text-ui">
                @for (r of k.rejection_reasons; track r.key) {
                  <li class="flex items-center justify-between gap-2">
                    <span class="text-fg">{{
                      'recruitment.rejectionReason.' + r.key | transloco
                    }}</span>
                    <span class="font-semibold text-fg">{{ r.count }}</span>
                  </li>
                }
              </ul>
            }
          </app-card>
        </div>
      }

      <div class="mt-8">
        <app-why-it-matters scope="recruitment" page="overview" />
      </div>
    </div>
  `,
})
export class RecruitmentOverviewPage {
  private readonly api = inject(RecruitmentApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly perms = injectRecruitmentPerms();
  protected readonly nav = injectRecruitmentNav();
  protected readonly settingsLink = computed(() => settingsLinkFor(this.perms()));
  protected readonly pipelineCounters = PIPELINE;

  protected readonly overview = signal<RecruitmentOverview | null>(null);
  protected readonly errorKey = signal<string | null>(null);
  private readonly version = signal(0);

  protected readonly attention = computed<readonly Tile[]>(() =>
    ATTENTION.map(({ key, tone }) => ({ ...this.tileFor(key), tone })),
  );
  protected readonly allClear = computed(() => this.attention().every((t) => t.value === 0));
  protected readonly stageRows = computed(() => {
    const stages = this.overview()?.stages ?? {};
    const max = Math.max(1, ...ACTIVE_STAGES.map((s) => stages[s] ?? 0));
    return ACTIVE_STAGES.map((stage) => {
      const count = stages[stage] ?? 0;
      return { stage, count, pct: Math.round((count / max) * 100) };
    });
  });

  constructor() {
    providePageContext(() => ({ module: MODULE_KEY, view: 'dashboard' }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      this.version();
      if (!orgId) {
        return;
      }
      this.errorKey.set(null);
      const sub = this.api.getOverview(orgId).subscribe({
        next: (o) => this.overview.set(o),
        error: (err) => this.errorKey.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected tileFor(key: OverviewCounter): Tile {
    const o = this.overview();
    const url = o?.links[key] ?? null;
    const { path, queryParams } = url ? splitUrl(url) : { path: null, queryParams: {} };
    return { key, value: o?.counts[key] ?? 0, tone: 'neutral', path, queryParams };
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }
}
