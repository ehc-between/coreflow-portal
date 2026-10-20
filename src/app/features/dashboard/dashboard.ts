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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { Subscription } from 'rxjs';
import { DeviationStats } from '../../core/deviations/deviation.models';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import { DocumentsApi } from '../../core/documents/documents-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AgentBanner } from '../../shared/ui/agent-banner/agent-banner';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { severityLabelKey } from '../deviations/deviation-enums';
import { StatBarList } from '../deviations/stats/stat-bar-list';
import { recordToBuckets, toBars } from '../deviations/stats/stats-bars';
import { TrendChart } from '../deviations/stats/trend-chart';
import {
  FAILED,
  HIDDEN,
  LOADING,
  Loadable,
  buildDashboardTiles,
  ready,
  recentMonths,
} from './dashboard-data';

/** Months shown in the dashboard's "opened per month" trend. */
const TREND_MONTHS = 6;

/**
 * Org dashboard. KPI tiles come from live data — deviation stats
 * (`deviations:read`), pending AI proposals (`documents:approve`) and documents
 * in review (`documents:read`) — each requested only when the user holds the
 * permission, and each linking to the list behind its number. Below the tiles,
 * a severity breakdown and a monthly trend reuse the deviation stats charts.
 * Everything reloads when the selected org (or its permissions) changes.
 */
@Component({
  selector: 'app-dashboard',
  imports: [TranslocoPipe, RouterLink, AgentBanner, Card, Icon, KpiTile, StatBarList, TrendChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-8 pt-7 pb-12">
      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ 'dashboard.title' | transloco }}
        </h1>
        @if (orgName(); as name) {
          <div class="mt-1.5 text-[14px] text-fg-muted">
            {{ 'dashboard.subtitle' | transloco: { org: name } }}
          </div>
        }
      </div>

      <div class="mb-[22px]">
        <app-agent-banner agentName="Iris" [agentRole]="'dashboard.agentRole' | transloco" />
      </div>

      @if (tiles().length === 0) {
        <app-card>
          <p class="py-12 text-center text-[14px] text-fg-muted">
            {{ 'dashboard.noAccess' | transloco }}
          </p>
        </app-card>
      } @else {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
          @for (t of tiles(); track t.id) {
            <a
              [routerLink]="t.link"
              [queryParams]="t.queryParams"
              class="block rounded-card transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-accent"
            >
              <app-kpi-tile
                [label]="t.labelKey | transloco"
                [value]="t.value ?? '—'"
                [tone]="t.tone"
                [delta]="
                  t.state === 'loading'
                    ? ('common.loading' | transloco)
                    : t.state === 'error'
                      ? ('dashboard.loadFailed' | transloco)
                      : ''
                "
                [deltaTone]="t.state === 'error' ? 'fail' : 'neutral'"
              />
            </a>
          }
        </div>

        @if (stats(); as s) {
          @if (s.state === 'ready') {
            @if (s.value.total === 0) {
              <app-card class="mt-4 block">
                <div class="flex flex-col items-center gap-3 py-10 text-center">
                  <span
                    class="flex h-12 w-12 items-center justify-center rounded-card border border-pass/30 bg-pass-soft text-pass"
                  >
                    <app-icon name="checkcircle" [size]="22" />
                  </span>
                  <p class="text-[14px] text-fg-muted">
                    {{ 'dashboard.noDeviations' | transloco }}
                  </p>
                </div>
              </app-card>
            } @else {
              <div class="mt-4 grid gap-4 lg:grid-cols-2">
                <app-card>
                  <div class="mb-3 flex items-baseline justify-between gap-3">
                    <p class="text-[13px] font-semibold text-fg-muted">
                      {{ 'dashboard.charts.bySeverity' | transloco }}
                    </p>
                    <a
                      routerLink="/deviations/stats"
                      class="text-[12.5px] font-semibold text-accent hover:underline"
                    >
                      {{ 'dashboard.charts.allStats' | transloco }}
                    </a>
                  </div>
                  <app-stat-bar-list [bars]="severityBars()" (selectBar)="openSeverity($event)" />
                </app-card>
                <app-card>
                  <p class="mb-4 text-[13px] font-semibold text-fg-muted">
                    {{ 'dashboard.charts.trend' | transloco: { months: trendMonths } }}
                  </p>
                  <app-trend-chart [points]="trend()" [height]="140" />
                </app-card>
              </div>
            }
          }
        }
      }
    </div>
  `,
})
export class Dashboard {
  private readonly deviationsApi = inject(DeviationsApi);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  protected readonly trendMonths = TREND_MONTHS;
  protected readonly orgName = computed(() => this.selectedOrg.currentOrg()?.name ?? null);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  private readonly canReadDeviations = computed(() =>
    this.permissions().includes('deviations:read'),
  );
  private readonly canReadDocuments = computed(() => this.permissions().includes('documents:read'));
  private readonly canApproveDocuments = computed(() =>
    this.permissions().includes('documents:approve'),
  );

  protected readonly stats = signal<Loadable<DeviationStats>>(HIDDEN);
  private readonly pendingProposals = signal<Loadable<number>>(HIDDEN);
  private readonly documentsInReview = signal<Loadable<number>>(HIDDEN);

  protected readonly tiles = computed(() =>
    buildDashboardTiles({
      stats: this.stats(),
      pendingProposals: this.pendingProposals(),
      documentsInReview: this.documentsInReview(),
    }),
  );

  protected readonly severityBars = computed(() => {
    const s = this.stats();
    if (s.state !== 'ready') {
      return [];
    }
    return toBars(
      recordToBuckets(s.value.by_severity, (k) => this.language.translate(severityLabelKey(k))),
    );
  });

  protected readonly trend = computed(() => {
    const s = this.stats();
    return s.state === 'ready' ? recentMonths(s.value.opened_over_time, TREND_MONTHS) : [];
  });

  private requests = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.requests.unsubscribe());

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const canReadDeviations = this.canReadDeviations();
      const canReadDocuments = this.canReadDocuments();
      const canApprove = this.canApproveDocuments();
      untracked(() => this.load(orgId, canReadDeviations, canReadDocuments, canApprove));
    });
  }

  protected openSeverity(severity: string): void {
    void this.router.navigate(['/deviations'], { queryParams: { severity } });
  }

  private load(
    orgId: string | null,
    canReadDeviations: boolean,
    canReadDocuments: boolean,
    canApprove: boolean,
  ): void {
    // Drop any in-flight responses for the previous org before reloading.
    this.requests.unsubscribe();
    this.requests = new Subscription();

    this.stats.set(orgId && canReadDeviations ? LOADING : HIDDEN);
    this.pendingProposals.set(orgId && canApprove ? LOADING : HIDDEN);
    this.documentsInReview.set(orgId && canReadDocuments ? LOADING : HIDDEN);
    if (!orgId) {
      return;
    }

    if (canReadDeviations) {
      this.requests.add(
        this.deviationsApi.getStats(orgId).subscribe({
          next: (stats) => this.stats.set(ready(stats)),
          error: () => this.stats.set(FAILED),
        }),
      );
    }
    if (canApprove) {
      this.requests.add(
        this.documentsApi.listProposals(orgId).subscribe({
          next: (proposals) => this.pendingProposals.set(ready(proposals.length)),
          error: () => this.pendingProposals.set(FAILED),
        }),
      );
    }
    if (canReadDocuments) {
      this.requests.add(
        this.documentsApi.list(orgId, { status: 'in_review' }).subscribe({
          next: (documents) => this.documentsInReview.set(ready(documents.length)),
          error: () => this.documentsInReview.set(FAILED),
        }),
      );
    }
  }
}
