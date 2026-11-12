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
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachMe } from '../../shared/guidance/teach-me';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { formatNumber } from '@angular/common';
import { Alert } from '../../shared/ui/alert/alert';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { EnvironmentApi } from './data/environment-api';
import { EnvironmentOverview, PERM_WRITE } from './data/environment.models';
import { kgToTonnes } from './data/environment-display';
import { environmentErrorKey } from './data/environment-errors';
import { EnvironmentTabs } from './environment-tabs';
import { EnvLessonLink } from './lesson-link';

/**
 * `/environment`: the environmental management overview. Headline numbers for
 * the aspects register, emergency preparedness and monitoring data, the items
 * that need attention (overdue reviews and drills) and the year's emissions.
 */
@Component({
  selector: 'app-environment-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    GuideIntro,
    TeachMe,
    WhyItMatters,
    Alert,
    Card,
    Icon,
    KpiTile,
    EnvironmentTabs,
    EnvLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-environment-tabs />
    <div class="mx-auto max-w-[1180px] px-4 pt-5 pb-12 sm:px-8">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1
            class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            data-testid="overview-title"
          >
            {{ 'environment.overview.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">
            {{ 'environment.overview.subtitle' | transloco }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-ask-about [prompt]="'environment.ask.overview' | transloco" />
          <app-teach-me
            topic="environment.overview"
            [subject]="'environment.overview.teachSubject' | transloco"
          />
        </div>
      </div>

      <div class="mb-6"><app-guide-intro scope="environment" page="overview" /></div>

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'environment.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
        }
        @default {
          @if (data(); as o) {
            <section class="mb-6">
              <div class="mb-2 flex items-center justify-between gap-2">
                <h2 class="font-display text-[16px] font-bold text-fg">
                  {{ 'environment.overview.aspects' | transloco }}
                </h2>
                <a
                  routerLink="/environment/aspects"
                  class="text-[13px] font-semibold text-accent hover:underline"
                  >{{ 'environment.overview.openRegister' | transloco }}</a
                >
              </div>
              <div class="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="overview-aspects">
                <app-kpi-tile
                  [label]="'environment.overview.aspectsTotal' | transloco"
                  [value]="o.aspects_total"
                  tone="accent"
                />
                <app-kpi-tile
                  [label]="'environment.overview.aspectsSignificant' | transloco"
                  [value]="o.aspects_significant"
                  [tone]="o.aspects_significant ? 'warn' : 'neutral'"
                />
                <app-kpi-tile
                  [label]="'environment.overview.aspectsDraft' | transloco"
                  [value]="o.aspects_draft"
                  tone="info"
                />
                <app-kpi-tile
                  [label]="'environment.overview.reviewOverdue' | transloco"
                  [value]="o.aspects_review_overdue"
                  [tone]="o.aspects_review_overdue ? 'fail' : 'pass'"
                />
              </div>
            </section>

            <section class="mb-6">
              <div class="mb-2 flex items-center justify-between gap-2">
                <h2 class="font-display text-[16px] font-bold text-fg">
                  {{ 'environment.overview.plans' | transloco }}
                </h2>
                <a
                  routerLink="/environment/emergency-plans"
                  class="text-[13px] font-semibold text-accent hover:underline"
                  >{{ 'environment.overview.openPlans' | transloco }}</a
                >
              </div>
              <div class="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="overview-plans">
                <app-kpi-tile
                  [label]="'environment.overview.plansTotal' | transloco"
                  [value]="o.plans_total"
                  tone="accent"
                />
                <app-kpi-tile
                  [label]="'environment.overview.plansActive' | transloco"
                  [value]="o.plans_active"
                  tone="pass"
                />
                <app-kpi-tile
                  [label]="'environment.overview.drillOverdue' | transloco"
                  [value]="o.plans_drill_overdue"
                  [tone]="o.plans_drill_overdue ? 'fail' : 'pass'"
                />
                <app-kpi-tile
                  [label]="'environment.overview.reviewOverdue' | transloco"
                  [value]="o.plans_review_overdue"
                  [tone]="o.plans_review_overdue ? 'fail' : 'pass'"
                />
              </div>
            </section>

            <section class="mb-6">
              <div class="mb-2 flex items-center justify-between gap-2">
                <h2 class="font-display text-[16px] font-bold text-fg">
                  {{ 'environment.overview.monitoring' | transloco }}
                </h2>
                <a
                  routerLink="/environment/metrics"
                  class="text-[13px] font-semibold text-accent hover:underline"
                  >{{ 'environment.overview.openMetrics' | transloco }}</a
                >
              </div>
              <div class="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="overview-metrics">
                <app-kpi-tile
                  [label]="'environment.overview.metricsActive' | transloco"
                  [value]="o.metrics_active"
                  tone="accent"
                />
                <app-kpi-tile
                  [label]="'environment.overview.measurements12m' | transloco"
                  [value]="o.measurements_last_12_months"
                  tone="info"
                />
                <a
                  routerLink="/environment/emissions"
                  class="block rounded-card focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <app-kpi-tile
                    [label]="'environment.overview.emissionsYtd' | transloco"
                    [value]="'environment.common.tonnes' | transloco: { value: tonnesText() }"
                    tone="neutral"
                  />
                </a>
              </div>
            </section>

            @if (attention().length) {
              <app-card>
                <h2 class="mb-2 flex items-center gap-2 text-[14px] font-semibold text-fg">
                  <app-icon name="alert" [size]="15" class="text-warn" />
                  {{ 'environment.overview.attention' | transloco }}
                </h2>
                <ul class="flex flex-col gap-1.5 text-[13px]" data-testid="overview-attention">
                  @for (item of attention(); track item.key) {
                    <li>
                      <a [routerLink]="item.link" class="font-semibold text-accent hover:underline">
                        {{
                          'environment.overview.attentionItems.' + item.key
                            | transloco: { count: item.count }
                        }}
                      </a>
                    </li>
                  }
                </ul>
              </app-card>
            } @else if (o.aspects_total === 0 && canWrite()) {
              <app-card>
                <p class="text-[13.5px] text-fg">
                  {{ 'environment.overview.getStarted' | transloco }}
                </p>
                <a
                  routerLink="/environment/aspects/new"
                  class="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
                >
                  <app-icon name="plus" [size]="14" />
                  {{ 'environment.aspects.new' | transloco }}
                </a>
              </app-card>
            }
          }
        }
      }

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="environment" page="overview" />
        <div class="flex flex-wrap gap-2">
          <app-env-lesson-link lesson="aspects-and-impacts" />
          <app-env-lesson-link lesson="emergency-preparedness" />
          <app-env-lesson-link lesson="monitoring-and-emissions" />
        </div>
      </div>
    </div>
  `,
})
export class EnvironmentOverviewPage {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.common.loadFailed');
  protected readonly data = signal<EnvironmentOverview | null>(null);

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );

  protected readonly tonnesText = computed(() =>
    formatNumber(kgToTonnes(this.data()?.emissions_ytd_kg), this.language.locale(), '1.0-2'),
  );

  protected readonly attention = computed(() => {
    const o = this.data();
    if (!o) {
      return [];
    }
    return [
      { key: 'aspectsReview', count: o.aspects_review_overdue, link: '/environment/aspects' },
      { key: 'aspectsDraft', count: o.aspects_draft, link: '/environment/aspects' },
      { key: 'plansDrill', count: o.plans_drill_overdue, link: '/environment/emergency-plans' },
      { key: 'plansReview', count: o.plans_review_overdue, link: '/environment/emergency-plans' },
    ].filter((i) => i.count > 0);
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'environment',
      view: 'dashboard',
      title: this.language.translate('environment.overview.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
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
      error: (error: unknown) => {
        this.errorKey.set(environmentErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
