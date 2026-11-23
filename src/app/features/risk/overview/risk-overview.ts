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
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, forkJoin, of, throwError } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { GuidanceService } from '../../../core/guidance/guidance.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { Term } from '../../../shared/guidance/term';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RiskApi } from '../data/risk-api';
import { currentRating, standardDisplayName } from '../data/risk-display';
import { riskErrorCode, riskErrorKey } from '../data/risk-errors';
import {
  HEATMAP_BASES,
  Heatmap,
  HeatmapBasis,
  Register,
  Risk,
  RiskOverview as Overview,
} from '../data/risk.models';
import { CellPosition, MatrixGrid } from '../shared/matrix-grid';
import { RatingBadge } from '../shared/rating-badge';
import { RiskNav } from '../shared/risk-nav';
import { RiskPermissions } from '../shared/risk-permissions';
import { SoaProgress } from '../shared/soa-progress';
import { RiskQuickWizard } from './risk-quick-wizard';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Risk module overview: headline numbers (the same "open" as the list), the heat
 * map (current, inherent or residual basis, per register) with how many risks are
 * rated, the risks of a chosen cell, and the Statement of Applicability with two
 * honest bars (decided, implemented). Without a matrix the manager is offered the
 * one-click setup.
 */
@Component({
  selector: 'app-risk-overview',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    AskAbout,
    TeachingEmpty,
    Term,
    TourStepDirective,
    WhyItMatters,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    PageHeader,
    MatrixGrid,
    RatingBadge,
    RiskNav,
    SoaProgress,
    RiskQuickWizard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="modules.names.risk"
        descriptionKey="risk.overview.subtitle"
        settingsLink="/settings/modules/risk"
        outputsModule="risk"
      >
        @if (perms.canWrite()) {
          <app-button
            secondary
            variant="secondary"
            size="sm"
            (click)="go('/risk/opportunities/new')"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'risk.opportunities.new' | transloco }}
          </app-button>
        }
        @if (perms.canWrite()) {
          <app-button primary size="sm" [appTourStep]="'risk-new'" (click)="go('/risk/risks/new')">
            <app-icon name="plus" [size]="14" />
            {{ 'risk.risks.new' | transloco }}
          </app-button>
        }
      </app-page-header>
      <app-risk-nav />
      <app-help-strip scope="risk" page="overview" tour="overview" lesson="first-risk-assessment" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="5" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @case ('ready') {
          @if (noMatrix()) {
            <app-card>
              <app-teaching-empty
                scope="risk"
                page="setup"
                [showAction]="perms.canManage()"
                (action)="setup()"
              />
              @if (!perms.canManage()) {
                <p class="pb-4 text-center text-ui text-fg-muted">
                  {{ 'risk.setup.askManager' | transloco }}
                </p>
              }
            </app-card>
          } @else {
            <ng-template #quickWizard>
              @if (heatmap(); as h) {
                <app-risk-quick-wizard
                  class="block"
                  [orgId]="perms.orgId() ?? ''"
                  [matrix]="h.matrix"
                  [registerId]="registerId()"
                  (created)="go('/risk/risks/' + $event.id)"
                />
              }
            </ng-template>
            <!-- An empty register starts with the quick wizard; with risks the numbers come first. -->
            @if (showWizard() && !hasRisks()) {
              <div class="mb-5"><ng-container [ngTemplateOutlet]="quickWizard" /></div>
            }
            @if (overview(); as o) {
              <section
                class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
                [attr.aria-label]="'risk.overview.kpis' | transloco"
                [appTourStep]="'risk-kpis'"
              >
                <app-kpi-tile
                  link="/risk/risks"
                  [queryParams]="{ status: 'open' }"
                  [attr.title]="'risk.overview.openHint' | transloco"
                  data-testid="kpi-open"
                  [label]="'risk.overview.openRisks' | transloco"
                  [value]="o.risks.open"
                  [delta]="'risk.overview.ofTotal' | transloco: { total: o.risks.total }"
                />
                <app-kpi-tile
                  link="/risk/risks"
                  [queryParams]="{ appetite: 'above' }"
                  [attr.title]="'risk.overview.appetiteHint' | transloco"
                  data-testid="kpi-appetite"
                  [label]="
                    (beginner()
                      ? 'risk.overview.aboveAppetitePlain'
                      : 'risk.overview.aboveAppetite'
                    ) | transloco
                  "
                  [value]="o.risks.above_appetite"
                  [tone]="o.risks.above_appetite > 0 ? 'fail' : 'neutral'"
                  [delta]="appetiteDelta()"
                  deltaTone="neutral"
                />
                <app-kpi-tile
                  link="/risk/risks"
                  [queryParams]="{ review: 'due' }"
                  data-testid="kpi-reviews"
                  [label]="'risk.overview.reviewsOverdue' | transloco"
                  [value]="o.risks.reviews_overdue"
                  [tone]="o.risks.reviews_overdue > 0 ? 'warn' : 'neutral'"
                />
                <app-kpi-tile
                  link="/risk/treatments"
                  [queryParams]="{ status: 'open' }"
                  data-testid="kpi-treatments"
                  [label]="'risk.overview.openTreatments' | transloco"
                  [value]="o.treatments.open"
                  [delta]="treatmentDelta()"
                  [deltaTone]="o.treatments.overdue > 0 ? 'warn' : 'neutral'"
                />
              </section>
            }

            <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="flex items-center gap-1.5 font-display text-section font-bold text-fg">
                    {{ 'risk.heatmap.title' | transloco }}
                    <app-ask-about
                      [prompt]="'risk.heatmap.askPrompt' | transloco"
                      field="heatmap"
                    />
                  </h2>
                  <div
                    class="flex flex-wrap items-center gap-2"
                    [class.hidden]="beginner()"
                    [appTourStep]="'risk-heatmap-basis'"
                  >
                    <label class="text-meta font-semibold text-fg-muted" for="risk-heatmap-basis">
                      {{ 'risk.heatmap.basis' | transloco }}
                    </label>
                    <select
                      id="risk-heatmap-basis"
                      class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                      aria-describedby="risk-heatmap-basis-hint"
                      (change)="setBasis($any($event.target).value)"
                    >
                      @for (b of bases; track b) {
                        <option [value]="b" [selected]="b === basis()">
                          {{ 'risk.heatmap.bases.' + b | transloco }}
                        </option>
                      }
                    </select>
                    @if (registers().length > 1) {
                      <label class="sr-only" for="risk-heatmap-register">
                        {{ 'risk.fields.register' | transloco }}
                      </label>
                      <select
                        id="risk-heatmap-register"
                        class="h-9 max-w-[200px] rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                        (change)="setRegister($any($event.target).value)"
                      >
                        <option value="" [selected]="!registerId()">
                          {{ 'risk.heatmap.defaultMatrix' | transloco }}
                        </option>
                        @for (r of registers(); track r.id) {
                          <option [value]="r.id" [selected]="r.id === registerId()">
                            {{ r.name }}
                          </option>
                        }
                      </select>
                    }
                  </div>
                </div>
                <p id="risk-heatmap-basis-hint" class="mb-3 text-meta text-fg-muted">
                  {{ 'risk.heatmap.basisHints.' + basis() | transloco }}
                </p>
                @if (heatmap(); as h) {
                  <app-matrix-grid
                    mode="heatmap"
                    [matrix]="h.matrix"
                    [counts]="counts()"
                    [ariaLabel]="'risk.heatmap.title' | transloco"
                    (cellSelected)="selectCell($event)"
                  />
                  <p class="mt-2 text-meta text-fg-muted" data-testid="heatmap-summary">
                    {{
                      'risk.heatmap.summary'
                        | transloco: { rated: rated(h), total: h.total, unrated: h.unrated }
                    }}
                  </p>
                }

                @if (cell(); as c) {
                  <section class="mt-4 border-t border-border pt-3" aria-live="polite">
                    <div class="mb-2 flex items-center justify-between gap-2">
                      <h3 class="text-body font-semibold text-fg">
                        {{
                          'risk.heatmap.cellRisks'
                            | transloco: { likelihood: c.likelihood, consequence: c.consequence }
                        }}
                      </h3>
                      <button
                        type="button"
                        class="rounded-tile px-2 py-1 text-meta font-semibold text-fg-muted hover:bg-surface-2"
                        (click)="cell.set(null)"
                      >
                        {{ 'risk.common.close' | transloco }}
                      </button>
                    </div>
                    <ul class="divide-y divide-border">
                      @for (r of cellRisks(); track r.id) {
                        @let rating = current(r);
                        <li class="flex items-center gap-2 py-2">
                          <span class="font-mono text-meta text-fg-subtle">{{ r.code }}</span>
                          <a
                            [routerLink]="['/risk/risks', r.id]"
                            class="min-w-0 flex-1 truncate text-body font-semibold text-fg hover:underline"
                            >{{ r.title }}</a
                          >
                          <app-rating-badge
                            [score]="rating?.score"
                            [level]="rating?.level"
                            [label]="rating?.label"
                            [color]="rating?.color"
                          />
                        </li>
                      } @empty {
                        <li class="py-2 text-ui text-fg-muted">
                          {{ 'risk.common.loading' | transloco }}
                        </li>
                      }
                    </ul>
                  </section>
                }
              </app-card>

              <div class="flex flex-col gap-5">
                @if (overview(); as o) {
                  <app-card>
                    <h2 class="mb-3 font-display text-section font-bold text-fg">
                      {{ 'risk.overview.byStatus' | transloco }}
                    </h2>
                    <ul class="flex flex-col gap-1.5 text-ui">
                      @for (s of statusRows(); track s.key) {
                        <li class="flex items-center justify-between">
                          <a
                            routerLink="/risk/risks"
                            [queryParams]="{ status: s.key }"
                            class="text-fg-muted hover:text-fg hover:underline"
                            >{{ 'risk.status.' + s.key | transloco }}</a
                          >
                          <span class="font-semibold text-fg">{{ s.count }}</span>
                        </li>
                      }
                    </ul>
                    @if (o.risks.unowned > 0) {
                      <a
                        routerLink="/risk/risks"
                        [queryParams]="{ owner: 'none' }"
                        class="mt-3 block text-meta text-warn-ink hover:underline"
                        data-testid="risk-unowned"
                      >
                        {{ 'risk.overview.unowned' | transloco: { count: o.risks.unowned } }}
                      </a>
                    }
                    @if (o.treatments.awaiting_effectiveness_check) {
                      <a
                        routerLink="/risk/treatments"
                        [queryParams]="{ status: 'done', check: 'true' }"
                        class="mt-2 block text-meta text-warn-ink hover:underline"
                        data-testid="risk-awaiting-check"
                      >
                        {{
                          'risk.overview.awaitingCheck'
                            | transloco: { count: o.treatments.awaiting_effectiveness_check }
                        }}
                      </a>
                    }
                    <a
                      routerLink="/risk/opportunities"
                      class="mt-3 block text-ui font-semibold text-accent hover:underline"
                    >
                      {{
                        'risk.overview.opportunities' | transloco: { count: o.opportunities.total }
                      }}
                    </a>
                  </app-card>

                  @if (!beginner()) {
                    <app-card>
                      <div class="mb-3 flex items-center justify-between gap-2">
                        <h2 class="font-display text-section font-bold text-fg">
                          <app-term scope="risk" key="statement-of-applicability">{{
                            'risk.overview.soaProgress' | transloco
                          }}</app-term>
                        </h2>
                        <a
                          routerLink="/standards/soa"
                          class="text-meta font-semibold text-accent hover:underline"
                          >{{ 'risk.overview.seeAll' | transloco }}</a
                        >
                      </div>
                      @for (s of o.soa; track s.standard_key) {
                        <a
                          [routerLink]="['/standards', s.standard_key, 'soa']"
                          class="mb-4 block rounded-tile p-1 last:mb-0 hover:bg-surface-2"
                        >
                          <p class="mb-2 text-ui font-semibold text-fg">
                            {{ standardName(s.standard_label, s.standard_key) }}
                          </p>
                          <app-soa-progress
                            [total]="s.total"
                            [justified]="soaJustified(s)"
                            [applicable]="s.applicable"
                            [implemented]="s.implemented"
                          />
                        </a>
                      } @empty {
                        <p class="text-ui text-fg-muted">
                          {{ 'risk.overview.noSoa' | transloco }}
                        </p>
                        <a
                          routerLink="/standards/soa"
                          class="mt-2 inline-block text-ui font-semibold text-accent hover:underline"
                          >{{ 'risk.overview.openSoa' | transloco }}</a
                        >
                      }
                    </app-card>
                  }
                }
              </div>
            </div>
            @if (showWizard() && hasRisks()) {
              <div class="mt-5"><ng-container [ngTemplateOutlet]="quickWizard" /></div>
            }
          }
          <app-why-it-matters class="mt-8 block" scope="risk" page="overview" />
        }
      }
    </div>
  `,
})
export class RiskOverviewPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(RiskPermissions);
  /** U34: beginners see plain words, no basis switch and no SoA card (it lives under Standards). */
  protected readonly beginner = inject(GuidanceService).isBeginner;

  protected readonly bases = HEATMAP_BASES;
  protected readonly state = signal<LoadState>('loading');
  protected readonly overview = signal<Overview | null>(null);
  protected readonly heatmap = signal<Heatmap | null>(null);
  protected readonly registers = signal<readonly Register[]>([]);
  protected readonly noMatrix = signal(false);
  protected readonly basis = signal<HeatmapBasis>('current');
  protected readonly registerId = signal('');
  protected readonly cell = signal<CellPosition | null>(null);
  private readonly cellRiskList = signal<readonly Risk[] | null>(null);
  private sub: Subscription | null = null;
  private cellSub: Subscription | null = null;

  protected readonly current = currentRating;

  /** "Hva kan gå galt?" for beginners, and for anyone while the register is empty. */
  protected readonly hasRisks = computed(() => (this.overview()?.risks.total ?? 0) > 0);
  protected readonly showWizard = computed(
    () =>
      this.perms.canWrite() &&
      !!this.heatmap() &&
      (this.beginner() || (this.overview()?.risks.total ?? 0) === 0),
  );

  protected readonly counts = computed(() => {
    const out: Record<string, number> = {};
    for (const c of this.heatmap()?.cells ?? []) {
      out[`${c.likelihood}:${c.consequence}`] = c.count;
    }
    return out;
  });

  protected readonly statusRows = computed(() => {
    const byStatus = this.overview()?.risks.by_status ?? {};
    return ['identified', 'assessed', 'in_treatment', 'monitoring', 'accepted', 'closed'].map(
      (key) => ({ key, count: byStatus[key] ?? 0 }),
    );
  });

  /** "≤ 4 poeng er akseptabelt" under the appetite KPI (from the overview or the heat map). */
  protected readonly appetiteDelta = computed(() => {
    const max =
      this.overview()?.appetite?.max_score ?? this.heatmap()?.matrix.acceptable_max_score ?? null;
    const accepted = this.overview()?.risks.accepted_above_appetite ?? 0;
    const parts: string[] = [];
    if (max !== null && max !== undefined) {
      parts.push(this.language.translate('risk.overview.appetiteValue', { score: max }));
    } else {
      parts.push(this.language.translate('risk.overview.noAppetite'));
    }
    if (accepted > 0) {
      parts.push(this.language.translate('risk.overview.acceptedAbove', { count: accepted }));
    }
    return parts.join(' · ');
  });

  protected readonly treatmentDelta = computed(() => {
    const t = this.overview()?.treatments;
    return t ? this.language.translate('risk.overview.overdueCount', { count: t.overdue }) : '';
  });

  protected readonly cellRisks = computed(() => {
    const cell = this.cell();
    const list = this.cellRiskList();
    const hm = this.heatmap();
    if (!cell || !list || !hm) {
      return [];
    }
    const ids = new Set(
      hm.cells.find((c) => c.likelihood === cell.likelihood && c.consequence === cell.consequence)
        ?.risk_ids ?? [],
    );
    return list.filter((r) => ids.has(r.id));
  });

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      view: 'dashboard',
      title: this.language.translate('modules.names.risk'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const basis = this.basis();
      const registerId = this.registerId();
      untracked(() => this.load(orgId, basis, registerId));
    });
    inject(DestroyRef).onDestroy(() => {
      this.sub?.unsubscribe();
      this.cellSub?.unsubscribe();
    });
  }

  /** Risks rated on the shown basis (older APIs: total minus unrated). */
  protected rated(h: Heatmap): number {
    return h.rated ?? Math.max(0, h.total - h.unrated);
  }

  protected standardName(label: Readonly<Record<string, string>> | undefined, key: string): string {
    return standardDisplayName(label, key, null, this.language.active(), (k, p) =>
      this.language.translate(k, p),
    );
  }

  protected soaJustified(s: Overview['soa'][number]): number | null {
    if (s.justified !== undefined) {
      return s.justified;
    }
    return s.missing_justification !== undefined ? s.total - s.missing_justification : null;
  }

  protected reload(): void {
    this.load(this.perms.orgId(), this.basis(), this.registerId());
  }

  private load(orgId: string | null, basis: HeatmapBasis, registerId: string): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!this.overview()) {
      this.state.set('loading');
    }
    this.cell.set(null);
    this.sub = forkJoin({
      overview: this.api.overview(orgId),
      registers: this.api.listRegisters(orgId),
      heatmap: this.api
        .heatmap(orgId, { basis, register_id: registerId || undefined })
        .pipe(
          catchError((e: unknown) =>
            riskErrorCode(e) === 'no_matrix' ? of(null) : throwError(() => e),
          ),
        ),
    }).subscribe({
      next: ({ overview, registers, heatmap }) => {
        this.overview.set(overview);
        this.registers.set(registers.items);
        this.heatmap.set(heatmap);
        this.noMatrix.set(heatmap === null);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected setBasis(value: string): void {
    this.basis.set(value as HeatmapBasis);
  }

  protected setRegister(value: string): void {
    this.registerId.set(value);
  }

  protected selectCell(cell: CellPosition): void {
    this.cell.set(cell);
    const orgId = this.perms.orgId();
    if (!orgId || this.cellRiskList()) {
      return;
    }
    this.cellSub?.unsubscribe();
    this.cellSub = this.api
      .listRisks(orgId, { include_closed: this.basis() !== 'current', limit: 200 })
      .subscribe({
        next: (res) => this.cellRiskList.set(res.items),
        error: () => this.cellRiskList.set([]),
      });
  }

  protected setup(): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.api.setup(orgId).subscribe({
      next: () => {
        this.toasts.success('risk.setup.done');
        this.load(orgId, this.basis(), this.registerId());
      },
      error: (e: unknown) => this.toasts.error(riskErrorKey(e)),
    });
  }

  protected go(path: string): void {
    void this.router.navigate([path]);
  }
}
