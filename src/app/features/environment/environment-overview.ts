import { formatNumber } from '@angular/common';
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
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Term } from '../../shared/guidance/term';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { EnvironmentApi } from './data/environment-api';
import { EnvironmentOverview } from './data/environment.models';
import { kgToTonnes } from './data/environment-display';
import { ENV_MODULE, injectEnvPermissions } from './environment-shared';

/** One clickable number: the tile and the filtered list it opens. */
export interface OverviewTile {
  readonly key: string;
  readonly value: number | string;
  readonly tone: KpiTone;
  readonly link: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly delta?: string;
  readonly deltaTone?: KpiTone;
}

/** One "needs follow-up" line with the list it opens. */
export interface AttentionItem {
  readonly key: string;
  readonly count: number;
  readonly link: string;
  readonly query?: Readonly<Record<string, string>>;
}

/** What needs doing, most important first (only items with a count). */
export function attentionItems(o: EnvironmentOverview): AttentionItem[] {
  const aspects = '/environment/aspects';
  const plans = '/environment/emergency-plans';
  const items: AttentionItem[] = [
    {
      key: 'withoutControls',
      count: o.aspects_without_controls ?? 0,
      link: aspects,
      query: { attention: 'without_controls' },
    },
    {
      key: 'needsPlan',
      count: o.aspects_needing_plan ?? 0,
      link: aspects,
      query: { attention: 'needs_emergency_plan' },
    },
    {
      key: 'plansDrill',
      count: o.plans_drill_overdue,
      link: plans,
      query: { attention: 'drill_overdue' },
    },
    {
      key: 'evaluationsOverdue',
      count: o.obligations_evaluation_overdue ?? 0,
      link: '/obligations',
    },
    {
      key: 'aspectsReview',
      count: o.aspects_review_overdue,
      link: aspects,
      query: { attention: 'review_overdue' },
    },
    {
      key: 'plansReview',
      count: o.plans_review_overdue,
      link: plans,
      query: { attention: 'review_overdue' },
    },
    {
      key: 'metricsOffTarget',
      count: o.metrics_off_target ?? 0,
      link: '/environment/metrics',
      query: { target: 'off_track' },
    },
    { key: 'aspectsDraft', count: o.aspects_draft, link: aspects, query: { status: 'draft' } },
  ];
  return items.filter((i) => i.count > 0);
}

/**
 * `/environment` ("Miljø"): where the environmental management system stands. What
 * needs follow-up first (each line opens the filtered list), then clickable numbers
 * for aspects, emergency preparedness and monitoring, and "Krav og mål": the
 * environmental obligations and their evaluation (6.1.3, 9.1.2), the environmental
 * objectives (6.2) and ISO 14001 requirement coverage.
 */
@Component({
  selector: 'app-environment-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Term,
    WhyItMatters,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    ModuleNav,
    PageHeader,
    ProgressBar,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="modules.names.environment"
        descriptionKey="environment.overview.subtitle"
        [settingsLink]="perms.settingsLink()"
      >
        @if (perms.write()) {
          <a primary routerLink="/environment/aspects/new" tabindex="-1">
            <app-button>
              <app-icon name="plus" [size]="15" />
              {{ 'environment.aspects.new' | transloco }}
            </app-button>
          </a>
        }
      </app-page-header>
      <app-module-nav
        class="mb-4 block"
        [items]="perms.nav()"
        labelKey="modules.names.environment"
      />
      <app-help-strip scope="environment" page="overview" lesson="aspects-and-impacts" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (data(); as o) {
            <div class="flex flex-col gap-6">
              @if (attention().length) {
                <app-card data-testid="overview-attention">
                  <h2 class="mb-3 flex items-center gap-2 font-display text-card font-bold text-fg">
                    <app-icon name="alert" [size]="16" class="text-warn" />
                    {{ 'environment.overview.attention' | transloco }}
                  </h2>
                  <ul class="flex flex-col divide-y divide-border">
                    @for (item of attention(); track item.key) {
                      <li>
                        <a
                          [routerLink]="item.link"
                          [queryParams]="item.query ?? null"
                          class="flex items-center justify-between gap-3 py-2.5 text-ui text-fg hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                          [attr.data-testid]="'attention-' + item.key"
                        >
                          <span>{{
                            'environment.overview.attentionItems.' + item.key
                              | transloco: { count: item.count }
                          }}</span>
                          <app-icon name="arrow" [size]="14" class="flex-none text-fg-subtle" />
                        </a>
                      </li>
                    }
                  </ul>
                </app-card>
              } @else if (o.aspects_total === 0) {
                <app-card data-testid="overview-start">
                  <h2 class="mb-1 font-display text-card font-bold text-fg">
                    {{ 'environment.overview.startTitle' | transloco }}
                  </h2>
                  <p class="text-body text-fg-muted">
                    {{ 'environment.overview.getStarted' | transloco }}
                  </p>
                </app-card>
              } @else {
                <p
                  class="flex items-center gap-2 rounded-tile border border-pass/30 bg-pass-soft px-4 py-3 text-ui text-pass-ink"
                  role="status"
                  data-testid="overview-all-good"
                >
                  <app-icon name="checkcircle" [size]="16" />
                  {{ 'environment.overview.allGood' | transloco }}
                </p>
              }

              @for (section of sections(); track section.key) {
                <section [attr.aria-labelledby]="'env-ov-' + section.key">
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <h2
                      [id]="'env-ov-' + section.key"
                      class="font-display text-section font-bold text-fg"
                    >
                      {{ 'environment.overview.sections.' + section.key | transloco }}
                    </h2>
                    <a
                      [routerLink]="section.link"
                      class="text-ui font-semibold text-accent hover:underline"
                      >{{ 'environment.overview.seeAll' | transloco }}</a
                    >
                  </div>
                  <div
                    class="grid grid-cols-2 gap-3 lg:grid-cols-4"
                    [attr.data-testid]="'overview-' + section.key"
                  >
                    @for (tile of section.tiles; track tile.key) {
                      <a
                        [routerLink]="tile.link"
                        [queryParams]="tile.query ?? null"
                        class="block rounded-card transition-shadow hover:shadow-pop focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        [attr.data-testid]="'tile-' + tile.key"
                      >
                        <app-kpi-tile
                          [label]="'environment.overview.tiles.' + tile.key | transloco"
                          [value]="tile.value"
                          [tone]="tile.tone"
                          [delta]="tile.delta ?? ''"
                          [deltaTone]="tile.deltaTone ?? null"
                        />
                      </a>
                    }
                  </div>
                </section>
              }

              <section aria-labelledby="env-ov-requirements" data-testid="overview-requirements">
                <h2
                  id="env-ov-requirements"
                  class="mb-1 font-display text-section font-bold text-fg"
                >
                  {{ 'environment.overview.requirementsTitle' | transloco }}
                </h2>
                <p class="mb-3 text-ui text-fg-muted">
                  {{ 'environment.overview.requirementsIntro' | transloco }}
                </p>
                <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  @if (o.obligations; as obligations) {
                    <app-card data-testid="overview-obligations">
                      <div class="mb-2 flex items-start justify-between gap-2">
                        <h3 class="font-display text-card font-bold text-fg">
                          <app-term key="compliance-obligation" scope="environment">{{
                            'environment.overview.obligations' | transloco
                          }}</app-term>
                        </h3>
                        <a
                          routerLink="/obligations"
                          class="text-ui font-semibold whitespace-nowrap text-accent hover:underline"
                          >{{ 'environment.overview.seeAll' | transloco }}</a
                        >
                      </div>
                      <p class="mb-3 text-meta text-fg-muted">
                        @if (o.next_compliance_evaluation_at) {
                          {{
                            'environment.overview.nextEvaluation'
                              | transloco: { date: (o.next_compliance_evaluation_at | localDay) }
                          }}
                        } @else {
                          {{ 'environment.overview.noEvaluationPlanned' | transloco }}
                        }
                      </p>
                      <ul class="flex flex-col gap-2">
                        @for (ob of obligations; track ob.id) {
                          <li class="flex flex-col gap-1">
                            <a
                              [routerLink]="ob.url"
                              class="text-ui font-semibold text-fg hover:text-accent hover:underline"
                            >
                              <span class="font-mono text-meta text-fg-subtle">{{ ob.code }}</span>
                              {{ ob.title }}
                            </a>
                            <span class="flex flex-wrap items-center gap-1.5 text-meta">
                              <app-status-badge
                                meaning="compliance"
                                [value]="ob.compliance_status || 'not_assessed'"
                              />
                              @if (ob.evaluation_overdue) {
                                <app-status-badge
                                  meaning="lifecycle"
                                  value="overdue"
                                  labelKey="environment.overview.evaluationOverdue"
                                />
                              } @else if (ob.next_evaluation_at) {
                                <span class="text-fg-subtle">{{
                                  'environment.overview.evaluateBy'
                                    | transloco: { date: (ob.next_evaluation_at | localDay) }
                                }}</span>
                              }
                            </span>
                          </li>
                        } @empty {
                          <li class="text-ui text-fg-muted">
                            {{ 'environment.overview.noObligations' | transloco }}
                          </li>
                        }
                      </ul>
                    </app-card>
                  }

                  @if (o.objectives; as objectives) {
                    <app-card data-testid="overview-objectives">
                      <div class="mb-3 flex items-start justify-between gap-2">
                        <h3 class="font-display text-card font-bold text-fg">
                          {{ 'environment.overview.objectives' | transloco }}
                        </h3>
                        <a
                          routerLink="/objectives"
                          class="text-ui font-semibold whitespace-nowrap text-accent hover:underline"
                          >{{ 'environment.overview.seeAll' | transloco }}</a
                        >
                      </div>
                      <ul class="flex flex-col gap-3">
                        @for (obj of objectives; track obj.id) {
                          <li class="flex flex-col gap-1">
                            <a
                              [routerLink]="obj.url"
                              class="text-ui font-semibold text-fg hover:text-accent hover:underline"
                            >
                              <span class="font-mono text-meta text-fg-subtle">{{ obj.code }}</span>
                              {{ obj.title }}
                            </a>
                            @if (obj.progress !== null) {
                              <app-progress-bar
                                [value]="obj.progress"
                                [label]="
                                  'environment.overview.progress' | transloco: { pct: obj.progress }
                                "
                              />
                            }
                            <span class="text-meta text-fg-subtle">
                              @if (obj.progress !== null) {
                                {{
                                  'environment.overview.progress' | transloco: { pct: obj.progress }
                                }}
                              }
                              @if (obj.due_date) {
                                ·
                                {{
                                  'environment.overview.dueBy'
                                    | transloco: { date: (obj.due_date | localDay) }
                                }}
                              }
                            </span>
                          </li>
                        } @empty {
                          <li class="text-ui text-fg-muted">
                            {{ 'environment.overview.noObjectives' | transloco }}
                          </li>
                        }
                      </ul>
                    </app-card>
                  }

                  @if (o.requirements; as req) {
                    <app-card data-testid="overview-coverage">
                      <h3 class="mb-3 font-display text-card font-bold text-fg">
                        {{ 'environment.overview.coverage' | transloco }}
                      </h3>
                      <p class="font-display text-page leading-none font-bold text-fg">
                        {{ req.pct }} %
                      </p>
                      <div class="mt-3">
                        <app-progress-bar
                          [value]="req.pct"
                          [label]="'environment.overview.coverage' | transloco"
                        />
                      </div>
                      <p class="mt-2 text-meta text-fg-muted">
                        {{
                          'environment.overview.coverageCounts'
                            | transloco: { covered: req.covered, applicable: req.applicable }
                        }}
                      </p>
                      <a
                        [routerLink]="['/standards/gaps', req.standard_key]"
                        class="mt-3 inline-flex items-center gap-1 text-ui font-semibold text-accent hover:underline"
                      >
                        {{ 'environment.overview.seeGaps' | transloco }}
                        <app-icon name="arrow" [size]="13" />
                      </a>
                    </app-card>
                  }
                </div>
              </section>
            </div>
          }
        }
      }

      <div class="mt-8">
        <app-why-it-matters scope="environment" page="overview" />
      </div>
    </div>
  `,
})
export class EnvironmentOverviewPage {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly perms = injectEnvPermissions();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly data = signal<EnvironmentOverview | null>(null);

  protected readonly attention = computed(() => {
    const o = this.data();
    return o ? attentionItems(o) : [];
  });

  protected readonly sections = computed(() => {
    const o = this.data();
    if (!o) {
      return [];
    }
    const aspects = '/environment/aspects';
    const plans = '/environment/emergency-plans';
    const metrics = '/environment/metrics';
    const warn = (n: number | undefined): KpiTone => (n ? 'warn' : 'pass');
    return [
      {
        key: 'aspects',
        link: aspects,
        tiles: [
          { key: 'aspectsTotal', value: o.aspects_total, tone: 'accent', link: aspects },
          {
            key: 'aspectsSignificant',
            value: o.aspects_significant,
            tone: 'info',
            link: aspects,
            query: { significance: 'significant' },
          },
          {
            key: 'withoutControls',
            value: o.aspects_without_controls ?? 0,
            tone: warn(o.aspects_without_controls),
            link: aspects,
            query: { attention: 'without_controls' },
          },
          {
            key: 'needsPlan',
            value: o.aspects_needing_plan ?? 0,
            tone: warn(o.aspects_needing_plan),
            link: aspects,
            query: { attention: 'needs_emergency_plan' },
          },
        ] satisfies OverviewTile[],
      },
      {
        key: 'plans',
        link: plans,
        tiles: [
          { key: 'plansActive', value: o.plans_active, tone: 'accent', link: plans },
          {
            key: 'drillOverdue',
            value: o.plans_drill_overdue,
            tone: warn(o.plans_drill_overdue),
            link: plans,
            query: { attention: 'drill_overdue' },
          },
          {
            key: 'plansReviewOverdue',
            value: o.plans_review_overdue,
            tone: warn(o.plans_review_overdue),
            link: plans,
            query: { attention: 'review_overdue' },
          },
          {
            key: 'aspectsReviewOverdue',
            value: o.aspects_review_overdue,
            tone: warn(o.aspects_review_overdue),
            link: aspects,
            query: { attention: 'review_overdue' },
          },
        ] satisfies OverviewTile[],
      },
      {
        key: 'monitoring',
        link: metrics,
        tiles: [
          { key: 'metricsActive', value: o.metrics_active, tone: 'accent', link: metrics },
          {
            key: 'metricsOffTarget',
            value: o.metrics_off_target ?? 0,
            tone: warn(o.metrics_off_target),
            link: metrics,
            query: { target: 'off_track' },
          },
          {
            key: 'measurements12m',
            value: o.measurements_last_12_months,
            tone: 'info',
            link: metrics,
          },
          this.emissionsTile(o),
        ] satisfies OverviewTile[],
      },
    ];
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: ENV_MODULE,
      view: 'dashboard',
      title: this.language.translate('modules.names.environment'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  /** "12,34 t CO₂e" with "−8 % fra i fjor" (green when down). */
  private emissionsTile(o: EnvironmentOverview): OverviewTile {
    const locale = this.language.locale();
    const tonnes = formatNumber(kgToTonnes(o.emissions_ytd_kg), locale, '1.2-2');
    const previous = o.emissions_previous_year_kg;
    let delta = '';
    let deltaTone: KpiTone | undefined;
    if (previous) {
      delta = this.language.translate('environment.overview.previousYear', {
        value: formatNumber(kgToTonnes(previous), locale, '1.2-2'),
      });
      deltaTone = 'neutral';
    }
    return {
      key: 'emissionsYtd',
      value: this.language.translate('environment.common.tonnes', { value: tonnes }),
      tone: 'neutral',
      link: '/environment/emissions',
      delta,
      deltaTone,
    };
  }

  private load(orgId: string | null): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.overview(orgId).subscribe({
      next: (o) => {
        this.data.set(o);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
