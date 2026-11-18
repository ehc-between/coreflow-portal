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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ModuleService } from '../../core/modules/module.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { SetupBanner } from '../org-modules/setup-banner/setup-banner';
import { DismissRequest, NextActions } from './components/next-actions';
import { StandardStatus } from './components/standard-status';
import { HomeApi } from './data/home-api';
import { firstName, greetingKey, hasJourney, journeyUrl, splitUrl } from './data/home-format';
import {
  FrameworkStatus,
  HomeResponse,
  JourneySummary,
  MyWorkSummary,
  WorkspaceKey,
} from './data/home.models';

type LoadState = 'loading' | 'error' | 'ready';

/** My Work tiles on the home page: count field, tab and label. */
const WORK_TILES = [
  { field: 'overdue', tab: 'overdue', labelKey: 'home.work.overdue' },
  { field: 'due_this_week', tab: 'this_week', labelKey: 'home.work.thisWeek' },
  { field: 'awaiting_review', tab: 'review', labelKey: 'home.work.review' },
  { field: 'later', tab: 'later', labelKey: 'home.work.later' },
] as const;

/** The employee home's three counters (U07): count field, My Work filter, label. */
const EMPLOYEE_COUNTERS: readonly {
  readonly field: keyof MyWorkSummary;
  readonly query: Record<string, string>;
  readonly labelKey: string;
}[] = [
  { field: 'tasks', query: {}, labelKey: 'home.employee.tasks' },
  {
    field: 'acknowledge',
    query: { source: 'document_ack' },
    labelKey: 'home.employee.acknowledge',
  },
  { field: 'training', query: { source: 'training_due' }, labelKey: 'home.employee.training' },
];

/** "Vis alt" on a trimmed home previews the full template (every section stays
 *  permission-gated by the API, so it never shows more data). */
const FULL_WORKSPACE: WorkspaceKey = 'quality_lead';

/** Setup items the home page can point at (the wizard has its own banner). */
const SETUP_LINKS: Record<string, string> = {
  standards: '/standards',
  members: '/settings',
};

/**
 * Hjem (U07): the page follows the caller's home template (`workspace` from `GET
 * /home`, mapped from their RBAC roles; org admins change the mapping in Settings):
 *
 * - Ansatt (`employee`): three "Hva vil du gjøre?" buttons and three counters (tasks,
 *   read and confirm, courses), "Du er à jour" when all are zero, and "Vis alt".
 * - Eier / Kvalitetsleder / Ledelse / Revisor: the "Hva vil du gjøre?" row, "Gjør
 *   dette nå" (at most three things, then one row with the system's suggestions), My
 *   Work counts, journeys as steps ("Steg 12/20", never a percentage) and one card
 *   per target standard with the one readiness number; the rest under "Vis alle".
 *
 * Every number is a link to the list it counts.
 * The detailed readiness lives on Standards; exports and audit packs on Reports.
 * Reloads on org or language change (text fields come back in the UI language).
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    TranslocoPipe,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    SetupBanner,
    NextActions,
    StandardStatus,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header titleKey="nav.dashboard" [breadcrumbs]="[{ labelKey: 'nav.dashboard' }]">
        <p intro class="mt-1.5 max-w-[72ch] text-body text-fg-muted" data-testid="home-greeting">
          {{ greeting() }}
        </p>
      </app-page-header>

      <app-help-strip class="mb-6" scope="platform" page="dashboard" lesson="getting-started" />

      <app-setup-banner class="mb-6 block" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="5" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @case ('ready') {
          @if (home(); as h) {
            @if (h.workspace.key === 'employee') {
              <div class="flex flex-col gap-6" data-testid="home-employee">
                <p class="max-w-[72ch] text-body text-fg-muted">
                  {{ 'home.employee.intro' | transloco }}
                </p>
                @if (h.quick_actions.length) {
                  <nav aria-labelledby="home-quick-title" data-testid="home-quick">
                    <h2 id="home-quick-title" class="sr-only">
                      {{ 'home.quick.title' | transloco }}
                    </h2>
                    <ul class="grid gap-3 sm:grid-cols-3">
                      @for (q of h.quick_actions; track q.key; let first = $first) {
                        <li>
                          <a
                            [routerLink]="quickLink(q.url).path"
                            [queryParams]="quickLink(q.url).query"
                            class="flex min-h-14 items-center justify-center rounded-card px-4 py-3 text-center text-ui font-semibold"
                            [class.bg-accent]="first"
                            [class.text-accent-fg]="first"
                            [class.border]="!first"
                            [class.border-border]="!first"
                            [class.bg-surface]="!first"
                            [class.text-fg]="!first"
                            [attr.data-testid]="'home-quick-' + q.key"
                          >
                            {{ 'home.quick.' + q.key | transloco }}
                          </a>
                        </li>
                      }
                    </ul>
                  </nav>
                }
                <section aria-labelledby="home-work-title" data-testid="home-counters">
                  <h2 id="home-work-title" class="sr-only">{{ 'nav.myWork' | transloco }}</h2>
                  <ul class="grid gap-3 sm:grid-cols-3">
                    @for (c of employeeCounters; track c.field) {
                      <li>
                        <a
                          routerLink="/my-work"
                          [queryParams]="c.query"
                          class="flex items-baseline justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-card hover:border-border-strong hover:bg-surface-2"
                          [attr.data-testid]="'home-counter-' + c.field"
                        >
                          <span class="text-ui text-fg">{{ c.labelKey | transloco }}</span>
                          <span class="font-display text-section font-bold text-fg"
                            >{{ h.my_work[c.field] }} →</span
                          >
                        </a>
                      </li>
                    }
                  </ul>
                  @if (upToDate()) {
                    <p class="mt-3 text-ui text-pass-ink" data-testid="home-up-to-date">
                      {{ 'home.employee.upToDate' | transloco }}
                    </p>
                  }
                </section>
                <p class="text-meta text-fg-muted">
                  <button
                    type="button"
                    class="font-semibold text-accent hover:underline"
                    data-testid="home-show-all"
                    (click)="showAll()"
                  >
                    {{ 'home.employee.showAll' | transloco }}
                  </button>
                  · {{ 'home.employee.showAllHint' | transloco }}
                </p>
              </div>
            } @else {
              <div class="flex flex-col gap-8">
                @if (h.workspace.source === 'requested') {
                  <p class="text-meta text-fg-muted" data-testid="home-previewing">
                    {{ 'home.workspace.previewing' | transloco }}
                    <button
                      type="button"
                      class="ml-1 font-semibold text-accent hover:underline"
                      (click)="backToMine()"
                    >
                      {{ 'home.workspace.back' | transloco }}
                    </button>
                  </p>
                }
                @if (h.quick_actions.length) {
                  <nav aria-labelledby="home-quick-title" data-testid="home-quick">
                    <h2 id="home-quick-title" class="mb-2 font-display text-card font-bold text-fg">
                      {{ 'home.quick.title' | transloco }}
                    </h2>
                    <ul class="flex flex-wrap gap-2">
                      @for (q of h.quick_actions; track q.key) {
                        <li>
                          <a
                            [routerLink]="quickLink(q.url).path"
                            [queryParams]="quickLink(q.url).query"
                            class="inline-flex min-h-10 items-center rounded-tile border border-border bg-surface px-3 py-2 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2"
                            [attr.data-testid]="'home-quick-' + q.key"
                          >
                            {{ 'home.quick.' + q.key | transloco }}
                          </a>
                        </li>
                      }
                    </ul>
                  </nav>
                }
                <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <!-- Do this now -->
                  <section aria-labelledby="home-next-title" class="min-w-0">
                    <h2
                      id="home-next-title"
                      class="mb-1 font-display text-section font-bold text-fg"
                    >
                      {{ 'home.next.title' | transloco }}
                    </h2>
                    <p class="mb-3 text-ui text-fg-muted">{{ 'home.next.subtitle' | transloco }}</p>
                    @if (actions().length) {
                      <app-next-actions [actions]="actions()" (dismissed)="dismiss($event)" />
                    } @else {
                      <app-empty-state
                        icon="checkcircle"
                        titleKey="home.next.emptyTitle"
                        bodyKey="home.next.emptyBody"
                        [compact]="true"
                      />
                    }
                    @if (missingSetup().length) {
                      <ul class="mt-3 flex flex-col gap-1.5" data-testid="home-setup-missing">
                        @for (item of missingSetup(); track item) {
                          <li>
                            <a
                              [routerLink]="setupLinks[item]"
                              class="inline-flex items-center gap-2 text-ui font-semibold text-accent hover:underline"
                            >
                              <app-icon name="plus" [size]="14" />
                              {{ 'home.setup.' + item | transloco }}
                            </a>
                          </li>
                        }
                      </ul>
                    }
                  </section>

                  <div class="flex min-w-0 flex-col gap-6">
                    <!-- My Work -->
                    <section
                      aria-labelledby="home-work-title"
                      class="rounded-card border border-border bg-surface p-5 shadow-card"
                      data-testid="home-my-work"
                    >
                      <div class="mb-3 flex items-baseline justify-between gap-3">
                        <h2 id="home-work-title" class="font-display text-card font-bold text-fg">
                          {{ 'nav.myWork' | transloco }}
                        </h2>
                        <a
                          routerLink="/my-work"
                          class="text-meta font-semibold text-accent hover:underline"
                        >
                          {{ 'home.work.open' | transloco }} →
                        </a>
                      </div>
                      @if (h.my_work.total === 0) {
                        <p class="text-ui text-fg-muted">{{ 'home.work.empty' | transloco }}</p>
                      } @else {
                        <ul class="grid grid-cols-2 gap-2">
                          @for (tile of workTiles; track tile.field) {
                            <li>
                              <a
                                routerLink="/my-work"
                                [queryParams]="{ tab: tile.tab }"
                                class="flex flex-col rounded-tile border border-border px-3 py-2 hover:border-border-strong hover:bg-surface-2"
                                [class.border-warn]="
                                  tile.field === 'overdue' && h.my_work.overdue > 0
                                "
                              >
                                <span
                                  class="font-display text-section font-bold"
                                  [class.text-warn-ink]="
                                    tile.field === 'overdue' && h.my_work.overdue > 0
                                  "
                                  [class.text-fg]="
                                    !(tile.field === 'overdue' && h.my_work.overdue > 0)
                                  "
                                  >{{ h.my_work[tile.field] }}</span
                                >
                                <span class="text-meta text-fg-muted">{{
                                  tile.labelKey | transloco
                                }}</span>
                              </a>
                            </li>
                          }
                        </ul>
                      }
                    </section>

                    <!-- Journeys -->
                    @if (showJourneys()) {
                      <section
                        aria-labelledby="home-journeys-title"
                        class="rounded-card border border-border bg-surface p-5 shadow-card"
                        data-testid="home-journeys"
                      >
                        <h2
                          id="home-journeys-title"
                          class="mb-3 font-display text-card font-bold text-fg"
                        >
                          {{ 'home.journeys.title' | transloco }}
                        </h2>
                        @for (j of h.journeys; track j.id) {
                          <a
                            [routerLink]="j.url"
                            class="mb-2 block rounded-tile border border-border p-3 last:mb-0 hover:border-border-strong hover:bg-surface-2"
                            data-testid="home-journey"
                          >
                            <span class="flex items-baseline justify-between gap-2">
                              <span class="text-ui font-semibold text-fg">{{ j.title }}</span>
                              <span class="flex-none text-meta text-fg-muted">{{
                                'home.journeys.steps' | transloco: { done: j.done, total: j.total }
                              }}</span>
                            </span>
                            @if (j.next_step; as next) {
                              <span class="mt-1 block text-meta text-fg">
                                {{ 'home.journeys.next' | transloco: { step: next.title } }}
                              </span>
                            }
                            <span class="mt-2 block text-meta font-semibold text-accent">
                              {{
                                (j.status === 'completed'
                                  ? 'home.journeys.view'
                                  : 'home.journeys.continue'
                                ) | transloco
                              }}
                              →
                            </span>
                          </a>
                        } @empty {
                          <p class="text-ui text-fg-muted">
                            {{ 'home.journeys.emptyBody' | transloco }}
                          </p>
                          <a
                            [routerLink]="startJourneyUrl()"
                            class="mt-3 inline-flex text-ui font-semibold text-accent hover:underline"
                          >
                            {{ 'home.journeys.start' | transloco }} →
                          </a>
                        }
                      </section>
                    }
                  </div>
                </div>

                <!-- How the organisation is doing -->
                @if (h.frameworks.length) {
                  <section aria-labelledby="home-status-title">
                    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <h2
                          id="home-status-title"
                          class="font-display text-section font-bold text-fg"
                        >
                          {{ 'home.status.title' | transloco }}
                        </h2>
                        <p class="mt-0.5 text-ui text-fg-muted">
                          {{ 'home.status.subtitle' | transloco }}
                        </p>
                      </div>
                      <a
                        routerLink="/standards"
                        class="text-ui font-semibold text-accent hover:underline"
                      >
                        {{ 'home.status.allStandards' | transloco }} →
                      </a>
                    </div>
                    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      @for (fw of shownStandards(); track fw.framework) {
                        <app-standard-status
                          [status]="fw"
                          [journey]="journeyFor(fw.framework)"
                          [canStartJourney]="canManageStandards()"
                        />
                      }
                    </div>
                    @if (otherStandards().length) {
                      <button
                        type="button"
                        class="mt-3 text-ui font-semibold text-accent hover:underline"
                        data-testid="home-standards-toggle"
                        [attr.aria-expanded]="showOthers()"
                        (click)="showOthers.set(!showOthers())"
                      >
                        {{
                          showOthers()
                            ? ('home.status.hideOthers' | transloco)
                            : ('home.status.showOthers'
                              | transloco: { count: otherStandards().length })
                        }}
                      </button>
                    }
                  </section>
                } @else if (canReadStandards()) {
                  <app-empty-state
                    icon="iso"
                    titleKey="home.status.emptyTitle"
                    bodyKey="home.status.emptyBody"
                    ctaKey="home.status.emptyCta"
                    ctaLink="/standards"
                  />
                }

                @if (showReports()) {
                  <p class="text-ui text-fg-muted">
                    {{ 'home.reports.hint' | transloco }}
                    <a routerLink="/reports" class="font-semibold text-accent hover:underline">
                      {{ 'home.reports.link' | transloco }} →
                    </a>
                  </p>
                }
              </div>
            }
          }
        }
      }
    </div>
  `,
})
export class Dashboard {
  private readonly api = inject(HomeApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly modules = inject(ModuleService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly workTiles = WORK_TILES;
  protected readonly employeeCounters = EMPLOYEE_COUNTERS;
  protected readonly setupLinks = SETUP_LINKS;

  protected readonly state = signal<LoadState>('loading');
  protected readonly home = signal<HomeResponse | null>(null);
  /** "Vis alt": the template previewed in this visit (null = the caller's own). */
  private readonly requested = signal<WorkspaceKey | null>(null);
  /** Non-target standards unfolded ("Vis alle standarder"). */
  protected readonly showOthers = signal(false);
  /** Actions hidden in this visit (the API stores the dismissal; this hides it at once). */
  private readonly hidden = signal<ReadonlySet<string>>(new Set());

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canReadStandards = computed(
    () => this.permissions().includes('standards:read') && this.modules.isEnabled('standards'),
  );
  protected readonly canManageStandards = computed(() =>
    this.permissions().includes('standards:manage'),
  );
  protected readonly showReports = computed(
    () => this.modules.isEnabled('reports') && this.permissions().includes('reports:read'),
  );
  protected readonly showJourneys = computed(
    () =>
      this.canReadStandards() &&
      ((this.home()?.journeys.length ?? 0) > 0 || this.canManageStandards()),
  );

  /** Target standards first; the rest only after "Vis alle standarder". */
  private readonly targetStandards = computed<readonly FrameworkStatus[]>(() =>
    (this.home()?.frameworks ?? []).filter((f) => f.is_target !== false),
  );
  protected readonly otherStandards = computed<readonly FrameworkStatus[]>(() =>
    (this.home()?.frameworks ?? []).filter((f) => f.is_target === false),
  );
  protected readonly shownStandards = computed(() =>
    this.showOthers() || !this.targetStandards().length
      ? [...this.targetStandards(), ...this.otherStandards()]
      : this.targetStandards(),
  );

  /** The employee home is "à jour" when none of its three counters has anything. */
  protected readonly upToDate = computed(() => {
    const work = this.home()?.my_work;
    return !!work && !work.tasks && !work.acknowledge && !work.training;
  });

  protected readonly actions = computed(() => {
    const hidden = this.hidden();
    return (this.home()?.next_actions ?? []).filter((a) => !hidden.has(a.key));
  });

  /** "Start a journey": the first enabled standard that has one (ISO 27001 by default). */
  protected readonly startJourneyUrl = computed(() => {
    const fw = this.home()?.frameworks.find((f) => hasJourney(f.framework));
    return journeyUrl(fw?.framework ?? 'iso27001');
  });

  /** Missing setup the caller can act on (inviting needs `users:invite` / `org:manage`,
   *  choosing standards `standards:manage`); others never see a link they cannot use. */
  protected readonly missingSetup = computed(() => {
    const perms = this.permissions();
    const canAct: Record<string, boolean> = {
      standards: perms.includes('standards:manage'),
      members: perms.includes('users:invite') || perms.includes('org:manage'),
    };
    return (this.home()?.setup.missing ?? []).filter((item) => item in SETUP_LINKS && canAct[item]);
  });

  protected readonly greeting = computed(() => {
    const name = firstName(this.auth.user()?.full_name);
    const org = this.selectedOrg.currentOrg()?.name ?? '';
    const hello = this.language.translate(greetingKey(new Date().getHours()), { name });
    return this.language.translate('home.greeting.line', { hello, org });
  });

  private request = new Subscription();
  private loadedOrg: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());

    providePageContext(() => ({
      module: null,
      view: 'dashboard',
      title: this.language.translate('nav.dashboard'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const lang = this.language.active();
      untracked(() => this.load(orgId, lang));
    });
  }

  protected quickLink(url: string): { path: string; query: Record<string, string> } {
    return splitUrl(url);
  }

  protected showAll(): void {
    this.requested.set(FULL_WORKSPACE);
    this.reload();
  }

  protected backToMine(): void {
    this.requested.set(null);
    this.reload();
  }

  protected journeyFor(framework: string): JourneySummary | null {
    return this.home()?.journeys.find((j) => j.framework === framework) ?? null;
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.language.active());
  }

  protected dismiss(request: DismissRequest): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.hidden.update((keys) => new Set([...keys, request.key]));
    this.api.dismiss(orgId, request.key, request.days).subscribe({
      next: () =>
        this.notifications.info(request.days ? 'home.next.snoozed' : 'home.next.hidden', {
          days: request.days,
        }),
      error: () => {
        this.hidden.update((keys) => new Set([...keys].filter((k) => k !== request.key)));
        this.notifications.error('home.next.dismissFailed');
      },
    });
  }

  /**
   * Module next actions use their module's scope (`training:next.<name>.title`); load
   * those translation files on demand (like notification titles) so they never show raw.
   */
  private loadActionScopes(actions: readonly { readonly title_key: string }[], lang: string): void {
    const scopes = new Set(
      actions
        .map((a) => /^([a-z][\w-]*):/.exec(a.title_key)?.[1])
        .filter((scope): scope is string => !!scope && scope !== 'home' && scope !== 'tasks'),
    );
    for (const scope of scopes) {
      this.transloco.load(`${scope}/${lang}`).subscribe({ error: () => undefined });
    }
  }

  private load(orgId: string | null, lang: string): void {
    this.request.unsubscribe();
    this.hidden.set(new Set());
    if (!orgId) {
      this.home.set(null);
      this.state.set('ready');
      return;
    }
    // Keep the content on a language switch; show the skeleton for a new org.
    if (orgId !== this.loadedOrg) {
      this.home.set(null);
      this.state.set('loading');
    }
    this.loadedOrg = orgId;
    this.request = this.api.home(orgId, lang, this.requested()).subscribe({
      next: (home) => {
        this.loadActionScopes(home.next_actions ?? [], lang);
        this.home.set(home);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
