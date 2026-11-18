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
import { Term } from '../../../shared/guidance/term';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { AiGovernanceStore } from '../data/ai-governance-store';
import {
  AiGovernanceOverview,
  AttentionItemDto,
  RISK_CLASSES,
  SYSTEM_STATUSES,
} from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  attentionTextKey,
  riskKey,
  riskValue,
  splitUrl,
  statusKey,
} from '../data/ai-governance-display';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovPage } from '../ui/ai-gov-page';

export interface AttentionView {
  readonly key: string;
  readonly textKey: string;
  readonly params: Record<string, unknown>;
  readonly severity: 'high' | 'medium' | 'low';
  readonly path: string;
  readonly query: Record<string, string> | null;
}

/** The overview's "needs follow-up" rows, most urgent first, with deep links. */
export function attentionItems(o: AiGovernanceOverview): AttentionView[] {
  const items: readonly AttentionItemDto[] = o.attention ?? legacyAttention(o);
  return items
    .filter((i) => i.count > 0)
    .map((i) => {
      const { path, query } = splitUrl(i.url);
      return {
        key: i.key,
        textKey: attentionTextKey(i),
        params: { ...(i.params ?? {}), count: i.count },
        severity: i.severity,
        path,
        query,
      };
    });
}

/** Older backends: derive the items the overview counts already say. */
function legacyAttention(o: AiGovernanceOverview): AttentionItemDto[] {
  const base = '/ai-governance';
  return [
    {
      key: 'prohibited',
      count: o.by_risk_class['prohibited'] ?? 0,
      severity: 'high',
      url: `${base}/systems?risk_class=prohibited`,
    },
    {
      key: 'unclassified',
      count: o.unclassified,
      severity: 'high',
      url: `${base}/systems?risk_class=unclassified`,
    },
    { key: 'no_policy', count: o.has_policy ? 0 : 1, severity: 'high', url: `${base}/settings` },
  ];
}

/**
 * `/ai-governance`: where AI governance stands and what to do next. KPI tiles
 * (systems, high risk, obligations met, waiting for approval, drafts, AI
 * literacy), the ranked "needs follow-up" list with deep links, requirement
 * coverage for ISO/IEC 42001 and the AI Act (from Standards), the AI policy and
 * the 42001 Statement of Applicability, and the inventory by risk class and
 * status.
 */
@Component({
  selector: 'app-ai-governance-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    Term,
    TourStepDirective,
    Button,
    Card,
    ErrorState,
    Icon,
    KpiTile,
    LoadingState,
    ProgressBar,
    StatusBadge,
    AiGovPage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      titleKey="modules.names.ai_governance"
      descriptionKey="aiGovernance.overview.subtitle"
      page="overview"
      tour="overview"
      lesson="ai-governance-intro"
    >
      @if (store.canWrite()) {
        <a
          primary
          routerLink="/ai-governance/systems/new"
          class="inline-flex h-9 items-center gap-1.5 rounded-tile bg-accent px-3.5 text-ui font-semibold text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
          appTourStep="ai-overview-new"
          data-testid="overview-new-system"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'aiGovernance.systems.new' | transloco }}
        </a>
      }

      @if (error()) {
        <app-error-state (retry)="reload.update((n) => n + 1)" />
      } @else if (overview(); as o) {
        <div
          class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
          appTourStep="ai-overview-kpis"
        >
          <a
            routerLink="/ai-governance/systems"
            class="rounded-card focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <app-kpi-tile
              [label]="'aiGovernance.overview.systems' | transloco"
              [value]="o.systems_total"
              tone="accent"
            />
          </a>
          <a
            routerLink="/ai-governance/systems"
            [queryParams]="{ risk_class: 'high' }"
            class="rounded-card focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <app-kpi-tile
              [label]="'aiGovernance.overview.highRisk' | transloco"
              [value]="o.high_risk"
              [tone]="o.high_risk ? 'warn' : 'neutral'"
            />
          </a>
          <a
            routerLink="/ai-governance/systems"
            class="rounded-card focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <app-kpi-tile
              [label]="'aiGovernance.overview.obligationsMet' | transloco"
              [value]="
                'aiGovernance.overview.ofTotal'
                  | transloco: { done: o.obligations_met ?? 0, total: obligationsCounted() }
              "
              [tone]="
                obligationsCounted() && o.obligations_met === obligationsCounted()
                  ? 'pass'
                  : 'accent'
              "
              data-testid="overview-obligations"
            />
          </a>
          <a
            routerLink="/ai-governance/assessments"
            [queryParams]="{ status: 'completed' }"
            class="rounded-card focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <app-kpi-tile
              [label]="'aiGovernance.overview.awaitingApproval' | transloco"
              [value]="o.assessments_awaiting_approval ?? 0"
              [tone]="o.assessments_awaiting_approval ? 'warn' : 'neutral'"
              data-testid="overview-awaiting"
            />
          </a>
          <a
            routerLink="/ai-governance/assessments"
            [queryParams]="{ status: 'draft' }"
            class="rounded-card focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <app-kpi-tile
              [label]="'aiGovernance.overview.drafts' | transloco"
              [value]="o.assessments_draft ?? o.assessments_open"
              [tone]="o.assessments_overdue ? 'warn' : 'neutral'"
              [delta]="
                o.assessments_overdue
                  ? ('aiGovernance.overview.overdue' | transloco: { count: o.assessments_overdue })
                  : ''
              "
            />
          </a>
          <a
            routerLink="/ai-governance/literacy"
            class="rounded-card focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <app-kpi-tile
              [label]="'aiGovernance.overview.literacy' | transloco"
              [value]="o.literacy_coverage + ' %'"
              [tone]="o.literacy_coverage >= 80 ? 'pass' : 'accent'"
              [delta]="
                o.literacy_in_scope
                  ? ('aiGovernance.overview.literacyScope'
                    | transloco: { count: o.literacy_in_scope })
                  : ''
              "
              deltaTone="neutral"
            />
          </a>
        </div>

        @if (o.systems_total === 0) {
          <app-card class="mb-6">
            <h2 class="font-display text-section font-bold text-fg">
              {{ 'aiGovernance.overview.startTitle' | transloco }}
            </h2>
            <p class="mt-1 max-w-[72ch] text-body text-fg-muted">
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
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'aiGovernance.systems.new' | transloco }}
                </a>
              </div>
            }
          </app-card>
        }

        <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <app-card appTourStep="ai-overview-attention">
            <h2 class="mb-1 font-display text-section font-bold text-fg">
              {{ 'aiGovernance.overview.attention' | transloco }}
            </h2>
            <p class="mb-3 text-meta text-fg-muted">
              {{ 'aiGovernance.overview.attentionHint' | transloco }}
            </p>
            @if (attention().length === 0) {
              <p class="flex items-center gap-2 text-body text-fg-muted">
                <span class="text-pass"><app-icon name="checkcircle" [size]="16" /></span>
                {{ 'aiGovernance.overview.allGood' | transloco }}
              </p>
            } @else {
              <ul class="flex flex-col gap-2" data-testid="overview-attention">
                @for (item of attention(); track item.key) {
                  <li>
                    <a
                      [routerLink]="item.path"
                      [queryParams]="item.query"
                      class="flex min-h-10 items-center justify-between gap-3 rounded-tile border border-border px-3 py-2 text-body text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      [attr.data-testid]="'attention-' + item.key"
                    >
                      <span class="flex min-w-0 items-center gap-2.5">
                        <span
                          class="h-2 w-2 flex-none rounded-full"
                          [class]="
                            item.severity === 'high'
                              ? 'bg-fail'
                              : item.severity === 'medium'
                                ? 'bg-warn'
                                : 'bg-fg-subtle'
                          "
                          aria-hidden="true"
                        ></span>
                        <span class="sr-only">{{
                          'aiGovernance.overview.severity.' + item.severity | transloco
                        }}</span>
                        <span class="min-w-0">{{ item.textKey | transloco: item.params }}</span>
                      </span>
                      <span class="flex-none text-fg-subtle" aria-hidden="true"
                        ><app-icon name="arrow" [size]="14"
                      /></span>
                    </a>
                  </li>
                }
              </ul>
            }
          </app-card>

          <div class="flex flex-col gap-5">
            <app-card data-testid="overview-readiness">
              <h2 class="mb-1 font-display text-section font-bold text-fg">
                {{ 'aiGovernance.overview.readiness' | transloco }}
              </h2>
              <p class="mb-3 text-meta text-fg-muted">
                {{ 'aiGovernance.overview.readinessHint' | transloco }}
              </p>
              @if (readiness().length === 0) {
                <p class="text-ui text-fg-muted">
                  {{ 'aiGovernance.overview.readinessNone' | transloco }}
                  <a routerLink="/standards" class="font-semibold text-accent hover:underline">{{
                    'aiGovernance.overview.readinessOpen' | transloco
                  }}</a>
                </p>
              } @else {
                <ul class="flex flex-col gap-3">
                  @for (r of readiness(); track r.standard_key) {
                    <li>
                      <a
                        [routerLink]="r.url"
                        class="block rounded-tile p-1 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      >
                        <span class="mb-1 flex items-baseline justify-between gap-2 text-ui">
                          <span class="font-semibold text-fg">{{
                            'aiGovernance.overview.frameworks.' + r.framework | transloco
                          }}</span>
                          <span class="text-fg-muted">{{
                            'aiGovernance.overview.readinessLine'
                              | transloco
                                : { score: r.score, covered: r.covered, total: r.applicable }
                          }}</span>
                        </span>
                        <app-progress-bar
                          [value]="r.score"
                          [label]="'aiGovernance.overview.frameworks.' + r.framework | transloco"
                        />
                      </a>
                    </li>
                  }
                </ul>
              }
              @if (o.soa_url) {
                <a
                  [routerLink]="o.soa_url"
                  class="mt-3 inline-flex min-h-6 items-center gap-1 text-ui font-semibold text-accent hover:underline"
                  data-testid="overview-soa"
                >
                  {{ 'aiGovernance.overview.soa' | transloco }}
                  <app-icon name="arrow" [size]="13" />
                </a>
              }
            </app-card>

            <app-card data-testid="overview-policy">
              <h2 class="mb-1 font-display text-section font-bold text-fg">
                {{ 'aiGovernance.overview.policy' | transloco }}
              </h2>
              @if (o.policy_document; as p) {
                <a
                  [routerLink]="['/documents', p.id]"
                  class="inline-flex min-h-6 items-center gap-1.5 text-body font-semibold text-accent hover:underline"
                >
                  <app-icon name="documents" [size]="14" />
                  {{ p.title || ('aiGovernance.settings.policyDocument' | transloco) }}
                </a>
              } @else {
                <p class="text-ui text-fg-muted">
                  {{ 'aiGovernance.overview.noPolicy' | transloco }}
                  <a
                    routerLink="/settings/modules/ai-governance"
                    class="font-semibold text-accent hover:underline"
                    >{{ 'aiGovernance.overview.linkPolicy' | transloco }}</a
                  >
                </p>
              }
            </app-card>
          </div>
        </div>

        <app-card class="mt-5">
          <h2 class="mb-3 font-display text-section font-bold text-fg">
            {{ 'aiGovernance.overview.byRisk' | transloco }}
          </h2>
          <ul class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            @for (r of risks; track r) {
              <li>
                <a
                  routerLink="/ai-governance/systems"
                  [queryParams]="{ risk_class: r }"
                  class="flex items-center gap-3 rounded-tile p-1 hover:bg-surface-2"
                >
                  <span class="w-[140px] flex-none">
                    <app-status-badge
                      meaning="severity"
                      [value]="riskValue(r)"
                      [labelKey]="riskKey(r)"
                    />
                  </span>
                  <span class="min-w-0 flex-1">
                    <app-progress-bar
                      [value]="share(o.by_risk_class[r] ?? 0, o.systems_total)"
                      [label]="riskKey(r) | transloco"
                    />
                  </span>
                  <span class="w-8 text-right text-ui font-semibold text-fg">{{
                    o.by_risk_class[r] ?? 0
                  }}</span>
                </a>
              </li>
            }
          </ul>
          <h3 class="mt-5 mb-2 text-ui font-bold text-fg">
            {{ 'aiGovernance.overview.byStatus' | transloco }}
          </h3>
          <dl class="grid grid-cols-2 gap-2 text-ui sm:grid-cols-5">
            @for (s of statuses; track s) {
              <div class="rounded-tile bg-surface-2 px-3 py-2">
                <dt class="text-meta text-fg-muted">{{ statusKey(s) | transloco }}</dt>
                <dd class="font-semibold text-fg">{{ o.by_status[s] ?? 0 }}</dd>
              </div>
            }
          </dl>
          <p class="mt-4 text-meta text-fg-muted">
            <app-term scope="ai-governance" key="ai-system">{{
              'aiGovernance.overview.termSystem' | transloco
            }}</app-term>
            ·
            <app-term scope="ai-governance" key="high-risk-ai">{{
              'aiGovernance.overview.termHighRisk' | transloco
            }}</app-term>
            ·
            <app-term scope="ai-governance" key="ai-literacy">{{
              'aiGovernance.overview.termLiteracy' | transloco
            }}</app-term>
          </p>
        </app-card>
      } @else {
        <app-loading-state [rows]="4" />
      }
    </app-ai-gov-page>
  `,
})
export class AiGovernanceOverviewPage {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  protected readonly store = inject(AiGovernanceStore);

  protected readonly risks = RISK_CLASSES;
  protected readonly statuses = SYSTEM_STATUSES;
  protected readonly riskKey = riskKey;
  protected readonly riskValue = riskValue;
  protected readonly statusKey = statusKey;

  protected readonly overview = signal<AiGovernanceOverview | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly registering = signal(false);
  protected readonly reload = signal(0);
  protected readonly attention = computed(() => {
    const o = this.overview();
    return o ? attentionItems(o) : [];
  });
  protected readonly readiness = computed(() => this.overview()?.readiness ?? []);
  /** Obligations that count (not marked "not relevant"). */
  protected readonly obligationsCounted = computed(() => {
    const o = this.overview();
    return o ? Math.max(0, (o.obligations_total ?? 0) - (o.obligations_not_relevant ?? 0)) : 0;
  });

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      view: 'dashboard',
      title: this.language.translate('modules.names.ai_governance'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.language.active();
      this.reload();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.error.set(null);
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
        this.notifications.success(
          result.created === 1
            ? 'aiGovernance.systems.registeredOne'
            : 'aiGovernance.systems.registered',
          { count: result.created },
        );
        this.reload.update((n) => n + 1);
      },
      error: (err: unknown) => {
        this.registering.set(false);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}
