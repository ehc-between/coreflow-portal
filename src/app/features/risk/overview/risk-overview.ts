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
import { Subscription, catchError, forkJoin, of, throwError } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { RiskApi } from '../data/risk-api';
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
import { RiskPageGuide } from '../shared/risk-page-guide';
import { RiskPermissions } from '../shared/risk-permissions';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Risk module dashboard: headline numbers, the heat map (current, inherent or
 * residual basis, per register), the risks of a chosen cell, and SoA progress.
 * Without a matrix the manager is offered the one-click setup.
 */
@Component({
  selector: 'app-risk-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    TeachingEmpty,
    TourStepDirective,
    Button,
    Card,
    Icon,
    KpiTile,
    ProgressBar,
    MatrixGrid,
    RatingBadge,
    RiskPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'risk.overview.title' | transloco }}
          </h1>
          <p class="mt-1 text-[13.5px] text-fg-muted">{{ 'risk.overview.subtitle' | transloco }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          @if (perms.canWrite()) {
            <app-button variant="secondary" size="sm" (click)="go('/risk/opportunities/new')">
              <app-icon name="plus" [size]="14" />
              {{ 'risk.opportunities.new' | transloco }}
            </app-button>
            <app-button size="sm" [appTourStep]="'risk-new'" (click)="go('/risk/risks/new')">
              <app-icon name="plus" [size]="14" />
              {{ 'risk.risks.new' | transloco }}
            </app-button>
          }
        </div>
      </header>

      <app-risk-page-guide
        class="mb-5"
        page="overview"
        lesson="first-risk-assessment"
        tour="overview"
      />

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted">
            {{ 'risk.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="py-10 text-center text-[14px] text-fail" role="alert">
            {{ 'risk.common.loadFailed' | transloco }}
          </p>
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
                <p class="pb-4 text-center text-[13px] text-fg-muted">
                  {{ 'risk.setup.askManager' | transloco }}
                </p>
              }
            </app-card>
          } @else {
            @if (overview(); as o) {
              <section
                class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
                [attr.aria-label]="'risk.overview.kpis' | transloco"
                [appTourStep]="'risk-kpis'"
              >
                <a routerLink="/risk/risks" [queryParams]="{ status: 'open' }" class="block">
                  <app-kpi-tile
                    [label]="'risk.overview.openRisks' | transloco"
                    [value]="o.risks.open"
                    [delta]="'risk.overview.ofTotal' | transloco: { total: o.risks.total }"
                  />
                </a>
                <a
                  routerLink="/risk/risks"
                  [queryParams]="{ status: 'open', sort: '-score' }"
                  class="block"
                >
                  <app-kpi-tile
                    [label]="'risk.overview.aboveAppetite' | transloco"
                    [value]="o.risks.above_appetite"
                    [tone]="o.risks.above_appetite > 0 ? 'fail' : 'pass'"
                  />
                </a>
                <a routerLink="/risk/risks" [queryParams]="{ review: 'due' }" class="block">
                  <app-kpi-tile
                    [label]="'risk.overview.reviewsOverdue' | transloco"
                    [value]="o.risks.reviews_overdue"
                    [tone]="o.risks.reviews_overdue > 0 ? 'warn' : 'neutral'"
                  />
                </a>
                <app-kpi-tile
                  [label]="'risk.overview.openTreatments' | transloco"
                  [value]="o.treatments.open"
                  [delta]="
                    'risk.overview.overdueCount' | transloco: { count: o.treatments.overdue }
                  "
                  [deltaTone]="o.treatments.overdue > 0 ? 'fail' : null"
                />
              </section>
            }

            <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="flex items-center gap-1.5 font-display text-[16px] font-bold text-fg">
                    {{ 'risk.heatmap.title' | transloco }}
                    <app-ask-about
                      [prompt]="'risk.heatmap.askPrompt' | transloco"
                      field="heatmap"
                    />
                  </h2>
                  <div
                    class="flex flex-wrap items-center gap-2"
                    [appTourStep]="'risk-heatmap-basis'"
                  >
                    <label class="sr-only" for="risk-heatmap-basis">
                      {{ 'risk.heatmap.basis' | transloco }}
                    </label>
                    <select
                      id="risk-heatmap-basis"
                      class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
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
                        class="h-9 max-w-[200px] rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
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
                @if (heatmap(); as h) {
                  <app-matrix-grid
                    mode="heatmap"
                    [matrix]="h.matrix"
                    [counts]="counts()"
                    [ariaLabel]="'risk.heatmap.title' | transloco"
                    (cellSelected)="selectCell($event)"
                  />
                  <p class="mt-2 text-[12.5px] text-fg-muted">
                    {{ 'risk.heatmap.summary' | transloco: { total: h.total, unrated: h.unrated } }}
                  </p>
                }

                @if (cell(); as c) {
                  <section class="mt-4 border-t border-border pt-3" aria-live="polite">
                    <div class="mb-2 flex items-center justify-between gap-2">
                      <h3 class="text-[13.5px] font-semibold text-fg">
                        {{
                          'risk.heatmap.cellRisks'
                            | transloco: { likelihood: c.likelihood, consequence: c.consequence }
                        }}
                      </h3>
                      <button
                        type="button"
                        class="rounded-tile px-2 py-1 text-[12.5px] font-semibold text-fg-muted hover:bg-surface-2"
                        (click)="cell.set(null)"
                      >
                        {{ 'risk.common.close' | transloco }}
                      </button>
                    </div>
                    <ul class="divide-y divide-border">
                      @for (r of cellRisks(); track r.id) {
                        <li class="flex items-center gap-2 py-2">
                          <span class="font-mono text-[12px] text-fg-subtle">{{ r.code }}</span>
                          <a
                            [routerLink]="['/risk/risks', r.id]"
                            class="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg hover:underline"
                            >{{ r.title }}</a
                          >
                          <app-rating-badge
                            [score]="r.current_score"
                            [level]="r.current_level"
                            [label]="(r.residual ?? r.inherent)?.label"
                            [color]="(r.residual ?? r.inherent)?.color"
                          />
                        </li>
                      } @empty {
                        <li class="py-2 text-[13px] text-fg-muted">
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
                    <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
                      {{ 'risk.overview.byStatus' | transloco }}
                    </h2>
                    <ul class="flex flex-col gap-1.5 text-[13px]">
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
                      <p class="mt-3 text-[12.5px] text-warn">
                        {{ 'risk.overview.unowned' | transloco: { count: o.risks.unowned } }}
                      </p>
                    }
                    <a
                      routerLink="/risk/opportunities"
                      class="mt-3 block text-[13px] font-semibold text-accent hover:underline"
                    >
                      {{
                        'risk.overview.opportunities' | transloco: { count: o.opportunities.total }
                      }}
                    </a>
                  </app-card>

                  <app-card>
                    <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
                      {{ 'risk.overview.soaProgress' | transloco }}
                    </h2>
                    @for (s of o.soa; track s.standard_key) {
                      <a
                        [routerLink]="['/risk/soa', s.standard_key]"
                        class="mb-3 block rounded-tile hover:bg-surface-2"
                      >
                        <div class="mb-1 flex justify-between text-[13px]">
                          <span class="font-semibold text-fg">{{ s.standard_key }}</span>
                          <span class="text-fg-muted">
                            {{
                              'risk.overview.soaImplemented'
                                | transloco
                                  : { implemented: s.implemented, applicable: s.applicable }
                            }}
                          </span>
                        </div>
                        <app-progress-bar
                          [value]="s.applicable ? (s.implemented / s.applicable) * 100 : 0"
                        />
                      </a>
                    } @empty {
                      <p class="text-[13px] text-fg-muted">
                        {{ 'risk.overview.noSoa' | transloco }}
                      </p>
                      <a
                        routerLink="/risk/soa"
                        class="mt-2 inline-block text-[13px] font-semibold text-accent hover:underline"
                        >{{ 'risk.overview.openSoa' | transloco }}</a
                      >
                    }
                  </app-card>
                }
              </div>
            </div>
          }
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
      title: this.language.translate('risk.overview.title'),
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
