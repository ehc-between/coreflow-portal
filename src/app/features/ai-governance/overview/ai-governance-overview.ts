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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import { AiGovernanceOverview, RISK_CLASSES, SYSTEM_STATUSES } from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  riskKey,
  riskTone,
  statusKey,
} from '../data/ai-governance-display';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiLessonCard } from '../ui/ai-lesson-card';

export interface AttentionItem {
  readonly key: string;
  readonly count: number;
  readonly link: string;
  readonly query?: Record<string, string>;
}

/** What needs attention on the overview (only items with something to do). */
export function attentionItems(o: AiGovernanceOverview): AttentionItem[] {
  const items: AttentionItem[] = [
    {
      key: 'unclassified',
      count: o.unclassified,
      link: '/ai-governance/systems',
      query: { risk: 'unclassified' },
    },
    {
      key: 'prohibited',
      count: o.by_risk_class['prohibited'] ?? 0,
      link: '/ai-governance/systems',
    },
    { key: 'assessmentsOverdue', count: o.assessments_overdue, link: '/ai-governance/assessments' },
    { key: 'reviewsOverdue', count: o.reviews_overdue, link: '/ai-governance/systems' },
    { key: 'monitoringFailures', count: o.monitoring_failures_30d, link: '/ai-governance/systems' },
    { key: 'noPolicy', count: o.has_policy ? 0 : 1, link: '/ai-governance/settings' },
  ];
  return items.filter((i) => i.count > 0);
}

/**
 * `/ai-governance`: the AI governance overview — inventory size, risk-class
 * and status breakdown, open and overdue assessments, overdue reviews,
 * recent monitoring failures, AI literacy coverage and whether an AI policy
 * is set, with what needs attention first.
 */
@Component({
  selector: 'app-ai-governance-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    TourButton,
    TourStepDirective,
    Badge,
    Button,
    Card,
    Icon,
    KpiTile,
    ProgressBar,
    AiGovPage,
    AiLessonCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      titleKey="aiGovernance.overview.title"
      subtitleKey="aiGovernance.overview.subtitle"
      page="overview"
    >
      <div actions class="flex flex-wrap gap-2">
        <app-tour-button [scope]="scope" tour="overview" />
        @if (store.canWrite()) {
          <a
            routerLink="/ai-governance/systems/new"
            class="inline-flex h-8 items-center gap-1.5 rounded-tile bg-accent px-3 text-[13px] font-semibold text-white hover:opacity-90"
            appTourStep="ai-overview-new"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'aiGovernance.systems.new' | transloco }}
          </a>
        }
      </div>

      @if (error()) {
        <p class="text-[14px] text-fail" role="alert">{{ error()! | transloco }}</p>
      } @else if (overview(); as o) {
        <div class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" appTourStep="ai-overview-kpis">
          <app-kpi-tile
            [label]="'aiGovernance.overview.systems' | transloco"
            [value]="o.systems_total"
            tone="accent"
          />
          <app-kpi-tile
            [label]="'aiGovernance.overview.highRisk' | transloco"
            [value]="o.high_risk"
            [tone]="o.high_risk ? 'warn' : 'neutral'"
          />
          <app-kpi-tile
            [label]="'aiGovernance.overview.assessmentsOpen' | transloco"
            [value]="o.assessments_open"
            [tone]="o.assessments_overdue ? 'fail' : 'info'"
          />
          <app-kpi-tile
            [label]="'aiGovernance.overview.literacy' | transloco"
            [value]="o.literacy_coverage + '%'"
            [tone]="o.literacy_coverage >= 80 ? 'pass' : 'warn'"
          />
        </div>

        @if (o.systems_total === 0) {
          <app-card class="mb-5">
            <h2 class="font-display text-[17px] font-bold text-fg">
              {{ 'aiGovernance.overview.startTitle' | transloco }}
            </h2>
            <p class="mt-1 text-[13.5px] text-fg-muted">
              {{ 'aiGovernance.overview.startBody' | transloco }}
            </p>
            @if (store.canWrite()) {
              <div class="mt-3 flex flex-wrap gap-2">
                <app-button size="sm" [loading]="registering()" (click)="registerPlatform()">
                  <app-icon name="spark" [size]="14" />
                  {{ 'aiGovernance.systems.registerPlatform' | transloco }}
                </app-button>
                <a
                  routerLink="/ai-governance/systems/new"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'aiGovernance.systems.new' | transloco }}
                </a>
              </div>
            }
          </app-card>
        }

        <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <app-card appTourStep="ai-overview-attention">
            <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
              {{ 'aiGovernance.overview.attention' | transloco }}
            </h2>
            @if (attention().length === 0) {
              <p class="flex items-center gap-2 text-[13.5px] text-fg-muted">
                <span class="text-pass"><app-icon name="checkcircle" [size]="16" /></span>
                {{ 'aiGovernance.overview.allGood' | transloco }}
              </p>
            } @else {
              <ul class="flex flex-col gap-2">
                @for (item of attention(); track item.key) {
                  <li>
                    <a
                      [routerLink]="item.link"
                      [queryParams]="item.query ?? null"
                      class="flex items-center justify-between gap-2 rounded-tile border border-border px-3 py-2 text-[13.5px] text-fg hover:bg-surface-2"
                    >
                      <span class="flex items-center gap-2">
                        <span class="text-warn"><app-icon name="alert" [size]="15" /></span>
                        {{
                          'aiGovernance.overview.attentionItems.' + item.key
                            | transloco: { count: item.count }
                        }}
                      </span>
                      <app-icon name="chevron" [size]="14" />
                    </a>
                  </li>
                }
              </ul>
            }
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
              {{ 'aiGovernance.overview.byRisk' | transloco }}
            </h2>
            <ul class="flex flex-col gap-2.5">
              @for (r of risks; track r) {
                <li class="flex items-center gap-3">
                  <span class="w-[130px] flex-none">
                    <app-badge [tone]="riskTone(r)">{{ riskKey(r) | transloco }}</app-badge>
                  </span>
                  <span class="min-w-0 flex-1">
                    <app-progress-bar
                      [value]="share(o.by_risk_class[r] ?? 0, o.systems_total)"
                      [label]="riskKey(r) | transloco"
                    />
                  </span>
                  <span class="w-8 text-right text-[13px] font-semibold text-fg">{{
                    o.by_risk_class[r] ?? 0
                  }}</span>
                </li>
              }
            </ul>
            <h3 class="mt-5 mb-2 text-[13px] font-bold text-fg">
              {{ 'aiGovernance.overview.byStatus' | transloco }}
            </h3>
            <dl class="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3">
              @for (s of statuses; track s) {
                <div class="rounded-tile bg-surface-2 px-3 py-2">
                  <dt class="text-[12px] text-fg-muted">{{ statusKey(s) | transloco }}</dt>
                  <dd class="font-semibold text-fg">{{ o.by_status[s] ?? 0 }}</dd>
                </div>
              }
            </dl>
          </app-card>
        </div>

        <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <a
            routerLink="/ai-governance/systems"
            class="rounded-card border border-border bg-surface p-4 hover:border-accent-border"
          >
            <p class="font-display text-[14px] font-bold text-fg">
              {{ 'aiGovernance.nav.systems' | transloco }}
            </p>
            <p class="mt-1 text-[12.5px] text-fg-muted">
              {{ 'aiGovernance.overview.linkSystems' | transloco }}
            </p>
          </a>
          <a
            routerLink="/ai-governance/assessments"
            class="rounded-card border border-border bg-surface p-4 hover:border-accent-border"
          >
            <p class="font-display text-[14px] font-bold text-fg">
              {{ 'aiGovernance.nav.assessments' | transloco }}
            </p>
            <p class="mt-1 text-[12.5px] text-fg-muted">
              {{ 'aiGovernance.overview.linkAssessments' | transloco }}
            </p>
          </a>
          <a
            routerLink="/ai-governance/literacy"
            class="rounded-card border border-border bg-surface p-4 hover:border-accent-border"
          >
            <p class="font-display text-[14px] font-bold text-fg">
              {{ 'aiGovernance.nav.literacy' | transloco }}
            </p>
            <p class="mt-1 text-[12.5px] text-fg-muted">
              {{ 'aiGovernance.overview.linkLiteracy' | transloco }}
            </p>
          </a>
        </div>
      } @else {
        <p class="text-[14px] text-fg-muted">{{ 'aiGovernance.common.loading' | transloco }}</p>
      }

      <div class="mt-5">
        <app-ai-lesson-card lesson="ai-governance-intro" />
      </div>
    </app-ai-gov-page>
  `,
})
export class AiGovernanceOverviewPage {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  protected readonly store = inject(AiGovernanceStore);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly risks = RISK_CLASSES;
  protected readonly statuses = SYSTEM_STATUSES;
  protected readonly riskKey = riskKey;
  protected readonly riskTone = riskTone;
  protected readonly statusKey = statusKey;

  protected readonly overview = signal<AiGovernanceOverview | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly registering = signal(false);
  protected readonly attention = computed(() => {
    const o = this.overview();
    return o ? attentionItems(o) : [];
  });
  private readonly reload = signal(0);

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      view: 'dashboard',
      title: this.language.translate('aiGovernance.overview.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reload();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.api.overview(orgId).subscribe({
          next: (o) => this.overview.set(o),
          error: (err: unknown) => this.error.set(aiGovernanceErrorKey(err)),
        });
      });
    });
  }

  protected share(count: number, total: number): number {
    return total > 0 ? Math.round((count / total) * 100) : 0;
  }

  protected registerPlatform(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.registering()) {
      return;
    }
    this.registering.set(true);
    this.api.registerPlatformFeatures(orgId, this.language.active()).subscribe({
      next: (result) => {
        this.registering.set(false);
        this.notifications.success('aiGovernance.systems.registered', { count: result.created });
        this.reload.update((n) => n + 1);
      },
      error: (err: unknown) => {
        this.registering.set(false);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}
