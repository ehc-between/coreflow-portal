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
import { hasAnyPermission } from '../../core/auth/permission';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { ModuleService } from '../../core/modules/module.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ReqPills } from '../../shared/requirement-links/req-pills';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { SetupBanner } from '../org-modules/setup-banner/setup-banner';
import { HomeApi } from '../dashboard/data/home-api';
import {
  actionView,
  firstName,
  journeyUrl,
  keyScope,
  splitUrl,
} from '../dashboard/data/home-format';
import { HomeResponse, NextAction } from '../dashboard/data/home.models';
import { OversiktApi } from './data/oversikt-api';
import {
  DeadlineItem,
  MAX_TODO,
  Tone,
  actionRefs,
  actionTone,
  barTone,
  dateTile,
  deadlineWindow,
  greetingKey,
  isUrgent,
  quickTiles,
  shownStandards,
  summaryKey,
  upcomingDeadlines,
  weekCount,
} from './data/oversikt';

type LoadState = 'loading' | 'error' | 'ready';

/** Days "Skjul i en uke" hides a to-do. */
const SNOOZE_DAYS = 7;

/** Setup items Oversikt can point at (the wizard has its own banner). */
const SETUP_LINKS: Record<string, string> = { standards: '/standards', members: '/settings' };

const DOT: Record<Tone, string> = {
  bad: 'bg-fail',
  warn: 'bg-warn',
  info: 'bg-accent',
  ok: 'bg-pass',
};

const BAR: Record<Tone, string> = {
  bad: 'bg-fail',
  warn: 'bg-warn',
  info: 'bg-accent',
  ok: 'bg-pass',
};

/**
 * Oversikt (IA v2 §5.1, prototype `#oversikt`): the landing page of every member.
 *
 * Greeting + one sentence about the week, four quick actions, "Dette bør du gjøre nå"
 * (the next actions, one button each), "Snart frist" (the next deadlines from the
 * calendar aggregation) and "Hvor står dere?" (one line per standard). Requirement
 * references stay behind "Vis krav". Sections the caller cannot see hide themselves;
 * the API already trims `GET /home` to the caller's permissions and home template.
 */
@Component({
  selector: 'app-home-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    ErrorState,
    Icon,
    LoadingState,
    MenuItem,
    OverflowMenu,
    ReqPills,
    SetupBanner,
  ],
  viewProviders: [provideSharedScope('home', 'tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1240px] px-4 pt-7 pb-12 sm:px-6">
      <header class="mb-6">
        <h1
          class="font-display text-page font-bold text-balance text-fg"
          data-testid="home-greeting"
        >
          {{ greeting() }}
        </h1>
        @if (state() === 'ready') {
          <p class="mt-1.5 max-w-[62ch] text-body text-fg-muted" data-testid="home-summary">
            {{ summary() }}
          </p>
        }
      </header>

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
            <!-- Quick actions -->
            <nav
              class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"
              [attr.aria-label]="'home.oversikt.quick.title' | transloco"
              data-testid="home-quick"
            >
              @for (q of tiles(); track q.key) {
                <a
                  [routerLink]="q.path"
                  [queryParams]="q.query"
                  class="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface p-4 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
                  [attr.data-testid]="'home-quick-' + q.key"
                >
                  <span
                    class="mb-1.5 grid h-8 w-8 place-items-center rounded-[9px] bg-accent-soft font-bold text-accent"
                    aria-hidden="true"
                    >{{ q.glyph }}</span
                  >
                  <b class="text-body font-semibold text-fg">{{ q.labelKey | transloco }}</b>
                  @if (q.hintKey) {
                    <span class="text-meta text-fg-muted">{{ q.hintKey | transloco }}</span>
                  }
                </a>
              }
            </nav>

            <div class="grid gap-5 min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <!-- Dette bør du gjøre nå -->
              <section
                class="min-w-0 self-start rounded-card border border-border bg-surface p-5"
                aria-labelledby="home-todo-title"
                data-testid="home-todo"
              >
                <div class="mb-3.5 flex items-baseline justify-between gap-3">
                  <h2 id="home-todo-title" class="font-display text-card font-semibold text-fg">
                    {{ 'home.oversikt.todo.title' | transloco }}
                  </h2>
                  @if (todoTotal()) {
                    <span class="text-meta text-fg-muted" data-testid="home-todo-count">{{
                      'home.oversikt.todo.count'
                        | transloco: { shown: todo().length, total: todoTotal() }
                    }}</span>
                  }
                </div>
                @if (todo().length) {
                  <ul>
                    @for (row of todo(); track row.key; let first = $first) {
                      <li
                        class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-border py-3.5 first:border-t-0 first:pt-1"
                        data-testid="home-todo-row"
                      >
                        <span
                          class="h-2.5 w-2.5 flex-none rounded-full"
                          [class]="row.dot"
                          aria-hidden="true"
                        ></span>
                        <div class="min-w-0 flex-1 basis-56">
                          <b class="block font-semibold text-fg [overflow-wrap:anywhere]">{{
                            row.title
                          }}</b>
                          <span class="block text-ui text-fg-muted">{{ row.why }}</span>
                          <app-req-pills [refs]="row.refs" />
                        </div>
                        <div class="ml-auto flex flex-none items-center gap-1">
                          <a
                            [routerLink]="row.link.path"
                            [queryParams]="row.link.query"
                            class="inline-flex h-8 items-center rounded-tile px-3 text-ui font-medium focus-visible:outline-2 focus-visible:outline-accent"
                            [class]="
                              first
                                ? 'bg-accent text-white hover:bg-accent-2'
                                : 'border border-border bg-surface text-fg hover:bg-surface-2'
                            "
                            data-testid="home-todo-cta"
                          >
                            {{ row.ctaKey | transloco }}
                            <span class="sr-only">: {{ row.title }}</span>
                          </a>
                          <app-overflow-menu [iconOnly]="true" labelKey="home.next.menu.label">
                            <button
                              appMenuItem
                              type="button"
                              (click)="dismiss(row.key, snoozeDays)"
                            >
                              <app-icon name="clock" [size]="15" />
                              {{ 'home.next.menu.snooze' | transloco: { days: snoozeDays } }}
                            </button>
                            <button appMenuItem type="button" (click)="dismiss(row.key)">
                              <app-icon name="x" [size]="15" />
                              {{ 'home.next.menu.hide' | transloco }}
                            </button>
                          </app-overflow-menu>
                        </div>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-ui text-fg-muted" data-testid="home-todo-empty">
                    {{ 'home.oversikt.todo.empty' | transloco }}
                  </p>
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
                @if (h.my_work.total) {
                  <p class="mt-3 border-t border-border pt-3 text-ui">
                    <a
                      routerLink="/my-work"
                      class="font-medium text-accent hover:underline"
                      data-testid="home-all-work"
                      >{{
                        'home.oversikt.todo.allWork' | transloco: { count: h.my_work.total }
                      }}
                      →</a
                    >
                  </p>
                }
              </section>

              <div class="flex min-w-0 flex-col gap-5">
                <!-- Snart frist -->
                @if (showDeadlines()) {
                  <section
                    class="rounded-card border border-border bg-surface p-5"
                    aria-labelledby="home-deadlines-title"
                    data-testid="home-deadlines"
                  >
                    <div class="mb-3.5 flex items-baseline justify-between gap-3">
                      <h2
                        id="home-deadlines-title"
                        class="font-display text-card font-semibold text-fg"
                      >
                        {{ 'home.oversikt.deadlines.title' | transloco }}
                      </h2>
                      <a
                        routerLink="/annual-cycle"
                        class="text-ui font-medium text-accent hover:underline"
                        >{{ 'home.oversikt.deadlines.all' | transloco }}</a
                      >
                    </div>
                    @switch (deadlineState()) {
                      @case ('loading') {
                        <app-loading-state [rows]="3" />
                      }
                      @case ('error') {
                        <p class="text-ui text-fg-muted">
                          {{ 'home.oversikt.deadlines.error' | transloco }}
                          <button
                            type="button"
                            class="font-semibold text-accent hover:underline"
                            (click)="loadDeadlines()"
                          >
                            {{ 'home.oversikt.retry' | transloco }}
                          </button>
                        </p>
                      }
                      @default {
                        @if (deadlines().length) {
                          <ul>
                            @for (d of deadlines(); track d.key) {
                              <li
                                class="grid grid-cols-[54px_minmax(0,1fr)] gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0"
                                data-testid="home-deadline"
                              >
                                <div
                                  class="text-center font-display leading-tight font-semibold text-fg tabular-nums"
                                >
                                  {{ d.day }}
                                  <small
                                    class="block font-sans text-micro tracking-[.06em] text-fg-subtle uppercase"
                                    >{{ d.month }}</small
                                  >
                                </div>
                                <div class="min-w-0">
                                  @if (d.link) {
                                    <a
                                      [routerLink]="d.link.path"
                                      [queryParams]="d.link.query"
                                      class="font-semibold text-fg [overflow-wrap:anywhere] hover:underline"
                                      >{{ d.title }}</a
                                    >
                                  } @else {
                                    <b class="font-semibold text-fg">{{ d.title }}</b>
                                  }
                                  <span class="block text-meta text-fg-muted">{{ d.line }}</span>
                                </div>
                              </li>
                            }
                          </ul>
                        } @else {
                          <p class="text-ui text-fg-muted" data-testid="home-deadlines-empty">
                            {{ 'home.oversikt.deadlines.empty' | transloco }}
                          </p>
                        }
                      }
                    }
                  </section>
                }

                <!-- Hvor står dere? -->
                @if (standards().shown.length) {
                  <section
                    class="rounded-card border border-border bg-surface p-5"
                    aria-labelledby="home-standards-title"
                    data-testid="home-standards"
                  >
                    <h2
                      id="home-standards-title"
                      class="mb-3.5 font-display text-card font-semibold text-fg"
                    >
                      {{ 'home.oversikt.standards.title' | transloco }}
                    </h2>
                    <ul class="flex flex-col gap-3.5">
                      @for (fw of standards().shown; track fw.framework) {
                        <li>
                          <a
                            [routerLink]="journeyLink(fw.framework)"
                            class="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
                            data-testid="home-standard"
                          >
                            <span class="min-w-0 text-fg group-hover:underline">
                              {{ 'home.standards.' + fw.framework + '.name' | transloco }}
                              <span class="text-meta text-fg-muted">{{
                                'home.standards.' + fw.framework + '.short' | transloco
                              }}</span>
                            </span>
                            <span class="font-semibold text-fg tabular-nums">{{
                              'home.oversikt.standards.percent' | transloco: { percent: fw.percent }
                            }}</span>
                            <span
                              class="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
                              role="progressbar"
                              [attr.aria-valuenow]="fw.percent"
                              aria-valuemin="0"
                              aria-valuemax="100"
                              [attr.aria-label]="
                                'home.standards.' + fw.framework + '.name' | transloco
                              "
                            >
                              <i
                                class="block h-full rounded-full"
                                [class]="barClass(fw.percent)"
                                [style.width.%]="fw.percent"
                              ></i>
                            </span>
                          </a>
                        </li>
                      }
                    </ul>
                    @if (standards().hidden) {
                      <button
                        type="button"
                        class="mt-3 text-ui font-medium text-accent hover:underline"
                        data-testid="home-standards-more"
                        (click)="showAllStandards.set(true)"
                      >
                        {{
                          'home.oversikt.standards.more' | transloco: { count: standards().hidden }
                        }}
                      </button>
                    }
                    <p class="mt-3.5 text-meta text-fg-muted">
                      {{ 'home.oversikt.standards.footnote' | transloco }}
                    </p>
                  </section>
                }
              </div>
            </div>
          }
        }
      }
    </div>
  `,
})
export class HomePage {
  private readonly homeApi = inject(HomeApi);
  private readonly oversiktApi = inject(OversiktApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly modules = inject(ModuleService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly snoozeDays = SNOOZE_DAYS;
  protected readonly setupLinks = SETUP_LINKS;

  protected readonly state = signal<LoadState>('loading');
  protected readonly home = signal<HomeResponse | null>(null);
  /** The full next-action list (`GET /next-actions`); null until loaded or on failure. */
  private readonly allActions = signal<readonly NextAction[] | null>(null);
  /** Actions hidden in this visit (the API stores the dismissal; this hides it at once). */
  private readonly hidden = signal<ReadonlySet<string>>(new Set());
  protected readonly deadlineState = signal<LoadState>('loading');
  private readonly deadlineItems = signal<readonly DeadlineItem[]>([]);
  protected readonly showAllStandards = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);

  /** "Snart frist" reads the calendar aggregation (reports module + `reports:read`). */
  protected readonly showDeadlines = computed(
    () => this.modules.isEnabled('reports') && hasAnyPermission(this.permissions(), 'reports:read'),
  );

  protected readonly tiles = computed(() =>
    quickTiles(
      this.permissions(),
      (m) => this.modules.isEnabled(m),
      this.home()?.quick_actions ?? [],
    ),
  );

  private readonly visibleActions = computed(() => {
    const hidden = this.hidden();
    const list = this.allActions() ?? this.home()?.next_actions ?? [];
    return list.filter((a) => !hidden.has(a.key));
  });

  protected readonly todoTotal = computed(() => this.visibleActions().length);

  protected readonly todo = computed(() => {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    return this.visibleActions()
      .slice(0, MAX_TODO)
      .map((action) => {
        const view = actionView(action, t);
        return {
          key: action.key,
          title: view.title,
          why: view.why,
          ctaKey: view.ctaKey,
          link: splitUrl(action.url),
          dot: DOT[actionTone(action)],
          refs: actionRefs(action, t),
        };
      });
  });

  protected readonly greeting = computed(() => {
    const name = firstName(this.auth.user()?.full_name);
    return this.language.translate(greetingKey(new Date().getHours()), { name });
  });

  protected readonly summary = computed(() => {
    const count = weekCount(this.home()?.my_work);
    const base = summaryKey(count);
    const text = this.language.translate(base.key, base.params);
    const top = this.todo()[0];
    if (count && top && isUrgent(this.visibleActions()[0])) {
      return `${text} ${this.language.translate('home.oversikt.summary.top', { title: top.title })}`;
    }
    return text;
  });

  protected readonly deadlines = computed(() => {
    const lang = this.language.active();
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    return upcomingDeadlines(this.deadlineItems()).map((d) => {
      const tile = dateTile(d.due_at, lang);
      const owner = d.owner?.name;
      return {
        key: `${d.entity_id}:${d.due_at}`,
        day: tile.day,
        month: tile.month,
        title: d.code ? `${d.code} · ${d.title}` : d.title,
        line: owner
          ? t('home.oversikt.deadlines.owner', { name: owner })
          : d.label_key
            ? t(d.label_key)
            : '',
        link: d.url ? splitUrl(d.url) : null,
      };
    });
  });

  /** Employees (home template `employee`) do not get the standards card. */
  protected readonly standards = computed(() => {
    const h = this.home();
    if (!h || h.workspace.key === 'employee') {
      return { shown: [], hidden: 0 };
    }
    return shownStandards(h.frameworks, this.showAllStandards());
  });

  /** Missing setup the caller can act on. */
  protected readonly missingSetup = computed(() => {
    const perms = this.permissions();
    const canAct: Record<string, boolean> = {
      standards: perms.includes('standards:manage'),
      members: perms.includes('users:invite') || perms.includes('org:manage'),
    };
    return (this.home()?.setup.missing ?? []).filter((item) => item in SETUP_LINKS && canAct[item]);
  });

  private request = new Subscription();
  private deadlineRequest = new Subscription();
  private loadedOrg: string | null = null;
  /** Module scope files already requested for action titles (`<scope>/<lang>`). */
  private readonly requestedScopes = new Set<string>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.deadlineRequest.unsubscribe();
    });

    providePageContext(() => ({
      module: null,
      view: 'dashboard',
      title: this.language.translate('home.oversikt.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const lang = this.language.active();
      untracked(() => this.load(orgId, lang));
    });

    // "Snart frist" follows the org and whether the card shows (modules may load late).
    effect(() => {
      this.selectedOrg.currentOrgId();
      this.showDeadlines();
      untracked(() => this.loadDeadlines());
    });

    // Module actions carry their module's keys (`risk:next.…`): load those scope files
    // so the texts translate (home and tasks come with the page).
    effect(() => {
      const lang = this.language.active();
      const scopes = new Set(
        this.visibleActions()
          .flatMap((a) => [keyScope(a.title_key), keyScope(a.why_key)])
          .filter((s): s is string => !!s && s !== 'home' && s !== 'tasks'),
      );
      untracked(() => {
        for (const scope of scopes) {
          const path = `${scope}/${lang}`;
          if (!this.requestedScopes.has(path)) {
            this.requestedScopes.add(path);
            this.transloco.load(path).subscribe({ error: () => undefined });
          }
        }
      });
    });
  }

  protected journeyLink(framework: string): string {
    return journeyUrl(framework);
  }

  protected barClass(percent: number): string {
    return BAR[barTone(percent)];
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.language.active());
  }

  protected dismiss(key: string, days?: number): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.hidden.update((keys) => new Set([...keys, key]));
    this.homeApi.dismiss(orgId, key, days).subscribe({
      next: () =>
        this.notifications.info(days ? 'home.next.snoozed' : 'home.next.hidden', { days }),
      error: () => {
        this.hidden.update((keys) => new Set([...keys].filter((k) => k !== key)));
        this.notifications.error('home.next.dismissFailed');
      },
    });
  }

  protected loadDeadlines(): void {
    this.deadlineRequest.unsubscribe();
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.showDeadlines()) {
      this.deadlineItems.set([]);
      return;
    }
    this.deadlineState.set('loading');
    const window = deadlineWindow(new Date());
    this.deadlineRequest = this.oversiktApi.deadlines(orgId, window.from, window.to).subscribe({
      next: (res) => {
        this.deadlineItems.set(res.items ?? []);
        this.deadlineState.set('ready');
      },
      error: () => this.deadlineState.set('error'),
    });
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
      this.allActions.set(null);
      this.state.set('loading');
      this.loadedOrg = orgId;
    } else if (this.state() === 'error') {
      this.state.set('loading');
    }
    // One container for both reads (a finished subscriber tears down what is added to it).
    this.request = new Subscription();
    this.request.add(
      this.homeApi.home(orgId, lang).subscribe({
        next: (home) => {
          this.home.set(home);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      }),
    );
    // The full list (the home payload carries only the first few): "n av m".
    this.request.add(
      this.homeApi.nextActions(orgId, lang, 20).subscribe({
        next: (list) => this.allActions.set(list.items),
        error: () => this.allActions.set(null),
      }),
    );
  }
}
