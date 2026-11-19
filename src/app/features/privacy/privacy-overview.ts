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
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PrivacyApi } from './data/privacy-api';
import {
  DataBreach,
  DataSubjectRequest,
  PERM_MANAGE,
  PERM_WRITE,
  PrivacyGap,
  PrivacyOverview as Overview,
} from './data/privacy.models';
import { clockFact } from './data/privacy-display';
import { PRIVACY_SETTINGS_LINK, REGISTERS, REGISTER_LIST } from './data/privacy-registers';
import { OutputsPanel } from '../../shared/outputs/outputs-panel';
import { PrivacyGaps } from './privacy-gaps';
import { privacyNavItems, privacyPermissions } from './privacy-nav';
import { PrivacySetupCard } from './privacy-setup';
import { PrivacyPath } from './privacy-path';
import { GuidanceService } from '../../core/guidance/guidance.service';

/** At most this many alert tiles show at first (principle 5); the rest behind a button. */
const MAX_TILES = 4;

interface Tile {
  readonly key: string;
  readonly value: number;
  readonly tone: KpiTone;
  readonly link: readonly unknown[];
  readonly query?: Readonly<Record<string, string>>;
}

interface Stat {
  readonly key: string;
  readonly params: Readonly<Record<string, number>>;
  readonly link: readonly unknown[];
  readonly query?: Readonly<Record<string, string>>;
}

/** Lessons offered on the overview (keys in `assets/guidance/<lang>/privacy.json`). */
export const OVERVIEW_LESSONS = [
  'gdpr-principles',
  'data-subject-rights',
  'breach-72-hours',
  'when-dpia',
] as const;

/**
 * The privacy overview (`/privacy`): where to start (the setup checklist), what needs
 * action now (only non-zero alerts), what is missing between the registers (gaps with
 * prefilled fixes), breaches on the 72-hour clock or waiting to be closed, the nearest
 * request deadlines, a slim strip of counts, and a card per register.
 */
@Component({
  selector: 'app-privacy-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    TourStepDirective,
    WhyItMatters,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    ModuleNav,
    PageHeader,
    StatusBadge,
    OutputsPanel,
    PrivacyGaps,
    PrivacySetupCard,
    PrivacyPath,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="modules.names.privacy"
        descriptionKey="privacy.overview.subtitle"
        [settingsLink]="canManage() ? settingsLink : null"
        outputsModule="privacy"
      >
        @if (canWrite()) {
          <a
            primary
            [routerLink]="['/privacy', 'breaches', 'new']"
            [queryParams]="{ quick: 1 }"
            class="inline-flex h-9 items-center gap-1.5 rounded-tile bg-accent px-3.5 text-ui font-semibold text-white hover:bg-accent-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
            data-testid="overview-report-breach"
          >
            <app-icon name="alert" [size]="15" />
            {{ 'privacy.overview.reportBreach' | transloco }}
          </a>
        }
        @if (canRequests()) {
          <a
            secondary
            [routerLink]="['/privacy', 'data-subject-requests', 'new']"
            [queryParams]="{ quick: 1 }"
            class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3.5 text-ui font-semibold text-fg hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
            data-testid="overview-new-request"
          >
            <app-icon name="inbox" [size]="15" />
            {{ 'privacy.overview.newRequest' | transloco }}
          </a>
        }
      </app-page-header>

      <app-module-nav
        labelKey="modules.names.privacy"
        moreLabelKey="privacy.nav.more"
        [items]="nav()"
      />
      <app-help-strip scope="privacy" page="overview" tour="overview" lesson="gdpr-principles" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (overview(); as o) {
            <div class="flex flex-col gap-6">
              @if (beginner() && o.path) {
                <app-privacy-path [path]="o.path" data-testid="privacy-path" />
              } @else if (o.setup; as setup) {
                <app-privacy-setup
                  [setup]="setup"
                  [canManage]="canManage()"
                  (changed)="reload()"
                  data-testid="privacy-setup"
                />
              }

              <section
                appTourStep="privacy-kpis"
                [attr.aria-label]="'privacy.overview.attention' | transloco"
                data-testid="privacy-kpis"
              >
                <h2 class="mb-3 font-display text-section font-bold text-fg">
                  {{ 'privacy.overview.attention' | transloco }}
                </h2>
                @if (tiles().length) {
                  <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                    @for (t of shownTiles(); track t.key) {
                      <app-kpi-tile
                        [link]="t.link"
                        [queryParams]="t.query ?? null"
                        [attr.data-testid]="'kpi-' + t.key"
                        [label]="'privacy.overview.tiles.' + t.key | transloco"
                        [value]="t.value"
                        [tone]="t.tone"
                      />
                    }
                  </div>
                  @if (tiles().length > maxTiles && !allTiles()) {
                    <button
                      type="button"
                      class="mt-2 text-ui font-semibold text-accent hover:underline"
                      (click)="allTiles.set(true)"
                      data-testid="privacy-kpis-all"
                    >
                      {{
                        'privacy.overview.moreAlerts'
                          | transloco: { count: tiles().length - maxTiles }
                      }}
                    </button>
                  }
                } @else {
                  <p
                    class="flex items-center gap-2 rounded-tile border border-pass/30 bg-pass-soft/60 px-4 py-3 text-ui text-fg"
                    data-testid="nothing-urgent"
                  >
                    <app-icon name="checkcircle" [size]="16" />
                    {{ 'privacy.overview.nothingUrgent' | transloco }}
                  </p>
                }
              </section>

              <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <app-privacy-gaps
                  class="lg:col-span-2"
                  [gaps]="gaps()"
                  [canFix]="canWrite()"
                  data-testid="overview-gaps"
                />

                <app-card appTourStep="privacy-breaches">
                  <h2 class="mb-3 flex items-center gap-2 font-display text-card font-bold text-fg">
                    <app-icon name="alert" [size]="16" />
                    {{ 'privacy.overview.breachesNow' | transloco }}
                  </h2>
                  @if (breaches().length === 0) {
                    <p class="text-ui text-fg-muted" data-testid="no-breaches">
                      {{ 'privacy.overview.noBreaches' | transloco }}
                    </p>
                  } @else {
                    <ul class="divide-y divide-border" data-testid="attention-breaches">
                      @for (b of breaches(); track b.id) {
                        <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                          <a
                            [routerLink]="['/privacy', 'breaches', b.id]"
                            class="min-w-0 truncate text-ui font-semibold text-fg hover:underline"
                          >
                            <span class="font-mono text-meta text-fg-subtle">{{ b.code }}</span>
                            {{ b.title }}
                          </a>
                          @if (b.status === 'notified') {
                            <app-status-badge
                              meaning="lifecycle"
                              value="pending"
                              labelKey="privacy.breach.awaitingClosure"
                            />
                          } @else {
                            @let c = clock(b);
                            <app-status-badge
                              [meaning]="c.meaning"
                              [value]="c.value"
                              [labelKey]="c.key"
                              [labelParams]="c.params"
                            />
                          }
                        </li>
                      }
                    </ul>
                  }
                </app-card>

                @if (canRequests()) {
                  <app-card>
                    <h2
                      class="mb-3 flex items-center gap-2 font-display text-card font-bold text-fg"
                    >
                      <app-icon name="inbox" [size]="16" />
                      {{ 'privacy.overview.requestsNow' | transloco }}
                    </h2>
                    @if (requests().length === 0) {
                      <p class="text-ui text-fg-muted">
                        {{ 'privacy.overview.noRequests' | transloco }}
                      </p>
                    } @else {
                      <ul class="divide-y divide-border" data-testid="attention-requests">
                        @for (r of requests(); track r.id) {
                          <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                            <a
                              [routerLink]="['/privacy', 'data-subject-requests', r.id]"
                              class="min-w-0 truncate text-ui font-semibold text-fg hover:underline"
                            >
                              <span class="font-mono text-meta text-fg-subtle">{{ r.code }}</span>
                              {{ 'privacy.options.dsrType.' + r.request_type | transloco }}
                            </a>
                            <span
                              class="text-ui"
                              [class.text-fail]="r.is_overdue"
                              [class.font-semibold]="r.is_overdue"
                            >
                              {{
                                (r.is_overdue
                                  ? 'privacy.overview.overdueSince'
                                  : 'privacy.overview.dueOn'
                                )
                                  | transloco
                                    : { date: (r.effective_due_at | localDay: 'mediumDate') }
                              }}
                            </span>
                          </li>
                        }
                      </ul>
                    }
                  </app-card>
                }
              </div>

              @if (!beginner()) {
                <section [attr.aria-label]="'privacy.overview.stats' | transloco">
                  <ul
                    class="flex flex-wrap gap-x-5 gap-y-2 rounded-tile border border-border bg-surface px-4 py-3 text-ui text-fg-muted"
                    data-testid="privacy-stats"
                  >
                    @for (s of stats(); track s.key) {
                      <li>
                        <a
                          [routerLink]="s.link"
                          [queryParams]="s.query ?? null"
                          class="hover:text-fg hover:underline"
                        >
                          {{ 'privacy.overview.stat.' + s.key | transloco: s.params }}
                        </a>
                      </li>
                    }
                  </ul>
                </section>
              }
            </div>
          }
        }
      }

      <!-- U12: the documents Datatilsynet asks for, one click from the overview. -->
      <section class="mt-8" data-testid="privacy-documents">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="font-display text-section font-bold text-fg">
            {{ 'privacy.overview.documents' | transloco }}
          </h2>
          <a
            routerLink="/privacy/documents"
            class="text-ui font-semibold text-accent hover:underline"
            data-testid="privacy-documents-all"
            >{{ 'privacy.overview.documentsAll' | transloco }}</a
          >
        </div>
        <app-outputs-panel module="privacy" [excludeKinds]="documentKindsOnly" />
      </section>

      @if (!beginner()) {
        <h2 class="mt-8 mb-3 font-display text-section font-bold text-fg">
          {{ 'privacy.overview.registers' | transloco }}
        </h2>
        <div
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          appTourStep="privacy-registers"
        >
          @for (r of registers(); track r.key) {
            <a
              [routerLink]="['/privacy', r.segment]"
              class="group flex gap-3 rounded-card border border-border bg-surface p-4 outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"
              [attr.data-testid]="'register-card-' + r.key"
            >
              <span
                class="flex h-9 w-9 flex-none items-center justify-center rounded-tile bg-accent-soft text-accent"
              >
                <app-icon [name]="r.icon" [size]="17" />
              </span>
              <span class="min-w-0">
                <span class="block text-body font-semibold text-fg group-hover:underline">
                  {{ 'privacy.registers.' + r.key + '.plural' | transloco }}
                </span>
                <span class="mt-0.5 block text-meta leading-snug text-fg-muted">
                  {{ 'privacy.registers.' + r.key + '.description' | transloco }}
                </span>
              </span>
            </a>
          }
        </div>

        <div class="mt-8">
          <app-why-it-matters scope="privacy" page="overview" />
        </div>
      }
    </div>
  `,
})
export class PrivacyOverview {
  /** The overview shows documents; register tables live on the documents tab. */
  protected readonly documentKindsOnly = ['register_export'] as const;
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly perms = privacyPermissions();

  protected readonly nav = privacyNavItems(this.perms);
  /** Beginners get the four-step path and only the work (U32). */
  protected readonly beginner = inject(GuidanceService).isBeginner;
  protected readonly maxTiles = MAX_TILES;
  protected readonly allTiles = signal(false);
  protected readonly shownTiles = computed(() =>
    this.allTiles() ? this.tiles() : this.tiles().slice(0, MAX_TILES),
  );
  protected readonly settingsLink = PRIVACY_SETTINGS_LINK;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly overview = signal<Overview | null>(null);
  protected readonly gaps = signal<readonly PrivacyGap[]>([]);
  protected readonly breaches = signal<readonly DataBreach[]>([]);
  protected readonly requests = signal<readonly DataSubjectRequest[]>([]);

  protected readonly canRequests = computed(() => this.perms().has(REGISTERS.dsr.readPermission));
  protected readonly canWrite = computed(() => this.perms().has(PERM_WRITE));
  protected readonly canManage = computed(() => this.perms().has(PERM_MANAGE));
  protected readonly registers = computed(() =>
    REGISTER_LIST.filter((r) => this.perms().has(r.readPermission)),
  );

  /** "Krever handling": only the alerts that are not zero, most urgent first. */
  protected readonly tiles = computed<readonly Tile[]>(() => {
    const o = this.overview();
    if (!o) {
      return [];
    }
    const all: Tile[] = [
      {
        key: 'breachesOverdue',
        value: o.breaches_overdue,
        tone: 'fail',
        link: ['/privacy', 'breaches'],
        query: { overdue: '1' },
      },
      {
        key: 'breachesActive',
        value: o.breaches_active ?? o.breaches_clock_running,
        tone: 'warn',
        link: ['/privacy', 'breaches'],
        query: { attention: 'active' },
      },
      {
        key: 'dsrOverdue',
        value: o.dsr_overdue ?? 0,
        tone: 'fail',
        link: ['/privacy', 'data-subject-requests'],
        query: { overdue: '1' },
      },
      {
        key: 'dpiasRequiredUndecided',
        value: o.dpias_required_undecided,
        tone: 'warn',
        link: ['/privacy', 'dpias'],
        query: { attention: 'required_undecided' },
      },
      {
        key: 'processorsWithoutDpa',
        value: o.processors_without_dpa,
        tone: 'warn',
        link: ['/privacy', 'processors'],
        query: { attention: 'without_dpa' },
      },
      {
        key: 'transfersMissingTia',
        value: o.transfers_missing_tia,
        tone: 'warn',
        link: ['/privacy', 'transfers'],
        query: { attention: 'missing_tia' },
      },
      {
        key: 'transfersUnsignedSafeguards',
        value: o.transfers_unsigned_safeguards ?? 0,
        tone: 'warn',
        link: ['/privacy', 'transfers'],
        query: { attention: 'unsigned_safeguards' },
      },
      {
        key: 'retentionExecutionsDue',
        value: o.retention_executions_due ?? 0,
        tone: 'warn',
        link: ['/privacy', 'retention-schedules'],
        query: { attention: 'execution_due' },
      },
      {
        key: 'breachesAwaitingClosure',
        value: o.breaches_awaiting_closure ?? 0,
        tone: 'info',
        link: ['/privacy', 'breaches'],
        query: { attention: 'awaiting_closure' },
      },
      {
        key: 'reviewsOverdue',
        value: o.reviews_overdue,
        tone: 'warn',
        link: ['/privacy', 'ropa'],
        query: { attention: 'review_overdue' },
      },
    ];
    return all.filter((t) => t.value > 0);
  });

  /** The slim strip of counts (no colours: these are facts, not alerts). */
  protected readonly stats = computed<readonly Stat[]>(() => {
    const o = this.overview();
    if (!o) {
      return [];
    }
    const out: Stat[] = [
      {
        key: 'ropa',
        params: { active: o.ropa_active, total: o.ropa_total },
        link: ['/privacy', 'ropa'],
      },
      {
        key: 'dpias',
        params: { count: o.dpias_open },
        link: ['/privacy', 'dpias'],
        query: { attention: 'open' },
      },
    ];
    if (o.dsr_open !== null) {
      out.push({
        key: 'requests',
        params: { count: o.dsr_open },
        link: ['/privacy', 'data-subject-requests'],
        query: { attention: 'open' },
      });
    }
    out.push({
      key: 'breaches',
      params: { count: o.breaches_open },
      link: ['/privacy', 'breaches'],
      query: { attention: 'open' },
    });
    out.push({
      key: 'gaps',
      params: { count: o.gaps_total ?? this.gaps().length },
      link: ['/privacy'],
    });
    return out;
  });

  private sub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    providePageContext(() => {
      const o = this.overview();
      const title = this.language.translate('modules.names.privacy');
      if (!o) {
        return { module: 'privacy', view: 'dashboard', title };
      }
      // The assistant sees the same picture as the user: what needs action and what is missing.
      const summary = this.language.translate('privacy.overview.contextSummary', {
        gaps: o.gaps_total ?? this.gaps().length,
        breaches: o.breaches_active ?? o.breaches_clock_running,
        requests: o.dsr_open ?? 0,
        dpias: o.dpias_required_undecided,
      });
      const kinds = Object.entries(o.gaps_by_kind ?? {})
        .filter(([, n]) => n > 0)
        .map(([kind, n]) => `${this.language.translate(`privacy.gaps.kindShort.${kind}`)}: ${n}`)
        .join(', ');
      return {
        module: 'privacy',
        view: 'dashboard',
        title: kinds ? `${title}. ${summary} (${kinds})` : `${title}. ${summary}`,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const requests = this.canRequests();
      untracked(() => this.load(orgId, requests));
    });
  }

  protected clock(b: DataBreach) {
    return clockFact(b);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.canRequests());
  }

  private load(orgId: string | null, requests: boolean): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    if (!this.overview()) {
      this.state.set('loading');
    }
    this.sub.add(
      this.api.overview(orgId).subscribe({
        next: (o) => {
          this.overview.set(o);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      }),
    );
    this.sub.add(
      this.api.gaps(orgId).subscribe({
        next: (g) => this.gaps.set(g.items),
        error: () => this.gaps.set([]),
      }),
    );
    this.sub.add(
      this.api
        .list<DataBreach>(orgId, REGISTERS.breach, {
          status: ['open', 'assessing', 'notified'],
          sort: 'due',
          limit: 6,
        })
        .subscribe({ next: (p) => this.breaches.set(p.items), error: () => this.breaches.set([]) }),
    );
    if (requests) {
      this.sub.add(
        this.api
          .list<DataSubjectRequest>(orgId, REGISTERS.dsr, {
            status: ['received', 'verifying', 'in_progress'],
            sort: 'due',
            limit: 5,
          })
          .subscribe({
            next: (p) => this.requests.set(p.items),
            error: () => this.requests.set([]),
          }),
      );
    }
  }
}
