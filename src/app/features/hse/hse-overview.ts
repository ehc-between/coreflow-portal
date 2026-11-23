import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Term } from '../../shared/guidance/term';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { RegistrerService } from '../../shared/registrer/registrer.service';
import { HseApi } from './data/hse-api';
import { AttentionGroup, AttentionItem, HseOverview } from './data/hse.models';
import { HSE_MODULE, HSE_NAV, injectHsePermissions } from './shared/hse-shared';

/** One count on an overview card, linked to the filtered list. */
export interface Stat {
  readonly labelKey: string;
  readonly value: number;
  /** Needs attention when above zero (shown in the warning colour, never red). */
  readonly attention?: boolean;
  readonly link: string;
  readonly query?: Readonly<Record<string, string>>;
}

export interface Section {
  readonly key: 'sja' | 'ppe' | 'consultations' | 'safetyRounds';
  readonly icon: string;
  readonly link: string;
  readonly stats: readonly Stat[];
  /** Records that need attention under the card (≤ 3). */
  readonly attention: readonly AttentionItem[];
}

const ATTENTION_GROUP: Readonly<Record<Section['key'], AttentionGroup | null>> = {
  sja: 'sja',
  ppe: 'ppe',
  consultations: 'consultations',
  safetyRounds: null,
};

/** A portal URL (`/hse/ppe?overdue=true`) as a router path and query params. */
export function splitUrl(url: string): { path: string; query: Record<string, string> | null } {
  const [path, search] = url.split('?');
  if (!search) {
    return { path, query: null };
  }
  const query: Record<string, string> = {};
  new URLSearchParams(search).forEach((value, key) => (query[key] = value));
  return { path, query };
}

/** The overview counts as the four HSE cards, each with its "needs attention" items. */
export function overviewSections(o: HseOverview): Section[] {
  const attention = (key: Section['key']) => {
    const group = ATTENTION_GROUP[key];
    return group ? (o.attention?.[group] ?? []).slice(0, 3) : [];
  };
  return [
    {
      key: 'sja',
      icon: 'risk',
      link: '/hse/sja',
      attention: attention('sja'),
      stats: [
        {
          labelKey: 'hse.overview.sjaDraft',
          value: o.sja.draft,
          link: '/hse/sja',
          query: { status: 'draft' },
        },
        {
          labelKey: 'hse.overview.sjaAwaiting',
          value: o.sja.in_review,
          attention: true,
          link: '/hse/sja',
          query: { status: 'in_review' },
        },
        {
          labelKey: 'hse.overview.sjaApproved',
          value: o.sja.approved,
          link: '/hse/sja',
          query: { status: 'approved' },
        },
        {
          labelKey: 'hse.overview.sjaCompleted',
          value: o.sja.completed,
          link: '/hse/sja',
          query: { status: 'completed' },
        },
      ],
    },
    {
      key: 'ppe',
      icon: 'qa',
      link: '/hse/ppe',
      attention: attention('ppe'),
      stats: [
        {
          labelKey: 'hse.overview.ppeOverdue',
          value: o.ppe.overdue,
          attention: true,
          link: '/hse/ppe',
          query: { overdue: 'true' },
        },
        {
          labelKey: 'hse.overview.ppeDueSoon',
          value: o.ppe.due_within_30_days,
          attention: true,
          link: '/hse/ppe',
          query: { due: '30' },
        },
        {
          labelKey: 'hse.overview.ppeInStock',
          value: o.ppe.in_stock,
          link: '/hse/ppe',
          query: { status: 'in_stock' },
        },
        {
          labelKey: 'hse.overview.ppeIssued',
          value: o.ppe.issued,
          link: '/hse/ppe',
          query: { status: 'issued' },
        },
      ],
    },
    {
      key: 'consultations',
      icon: 'people',
      link: '/hse/consultations',
      attention: attention('consultations'),
      stats: [
        {
          labelKey: 'hse.overview.consultationsPlanned',
          value: o.consultations.planned,
          link: '/hse/consultations',
          query: { status: 'planned' },
        },
        {
          labelKey: 'hse.overview.heldLastYear',
          value: o.consultations.held_last_365_days,
          link: '/hse/consultations',
          query: { status: 'held' },
        },
      ],
    },
    {
      key: 'safetyRounds',
      icon: 'calendar',
      link: '/hse/safety-rounds',
      attention: [],
      stats: [
        {
          labelKey: 'hse.overview.roundsOpen',
          value: o.safety_rounds.open,
          link: '/hse/safety-rounds',
        },
        {
          labelKey: 'hse.overview.roundsOverdue',
          value: o.safety_rounds.overdue,
          attention: true,
          link: '/hse/safety-rounds',
        },
        {
          labelKey: 'hse.overview.walksOpen',
          value: o.safety_rounds.inspections_open ?? 0,
          link: '/hse/safety-rounds',
        },
      ],
    },
  ];
}

/**
 * `/hse` ("HMS"): where health and safety stands and what to do next. A "Kom i
 * gang" checklist for new organisations; incidents and near misses (from
 * Deviations) with injury and lost-time figures; safe job analyses, PPE, worker
 * consultation and safety rounds, each with its counts linked to the filtered
 * list and the top items that need attention; HSE risks (from Risk) and open
 * follow-up tasks. "Meld uønsket hendelse" is the first action.
 */
@Component({
  selector: 'app-hse-overview',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    PageHeader,
    StatusBadge,
    Term,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="modules.names.hse"
        descriptionKey="hse.overview.subtitle"
        outputsModule="hse"
      >
        @if (canReport()) {
          <app-button
            primary
            appTourStep="hse-quick-actions"
            data-testid="hse-report-incident"
            (click)="reportIncident()"
          >
            <app-icon name="flag" [size]="15" />
            {{ 'hse.overview.reportIncident' | transloco }}
          </app-button>
        }
        @if (perms.write()) {
          <a secondary routerLink="/hse/sja/new" tabindex="-1">
            <app-button [variant]="canReport() ? 'secondary' : 'primary'">
              <app-icon name="plus" [size]="15" />
              {{ 'hse.sja.new' | transloco }}
            </app-button>
          </a>
        }
        @if (perms.write()) {
          <a appMenuItem overflow routerLink="/hse/ppe/new">{{ 'hse.ppe.new' | transloco }}</a>
        }
        @if (perms.write()) {
          <a appMenuItem overflow routerLink="/hse/consultations/new">{{
            'hse.consultation.new' | transloco
          }}</a>
        }
        @if (perms.manage()) {
          <a appMenuItem overflow routerLink="/hse/safety-rounds" [queryParams]="{ plan: 1 }">{{
            'hse.rounds.plan' | transloco
          }}</a>
        }
      </app-page-header>

      <app-module-nav class="mb-4 block" [items]="nav" labelKey="modules.names.hse" />
      <app-help-strip scope="hse" page="overview" tour="overview" lesson="iso45001-basics" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state bodyKey="hse.overview.loadFailed" (retry)="reload()" />
        }
        @default {
          @if (overview(); as o) {
            @if (gettingStarted(); as gs) {
              <app-card class="mb-5 block" data-testid="hse-getting-started">
                <h2 class="font-display text-section font-bold text-fg">
                  {{ 'hse.overview.start.title' | transloco }}
                </h2>
                <p class="mt-1 mb-3 text-body text-fg-muted">
                  {{ 'hse.overview.start.body' | transloco }}
                </p>
                <ol class="flex flex-col gap-2">
                  @for (step of gs.steps; track step.key; let i = $index) {
                    @let link = split(step.url);
                    <li class="flex items-start gap-3">
                      <span
                        class="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-meta font-bold"
                        [class]="
                          step.done ? 'bg-pass-soft text-pass' : 'bg-surface-2 text-fg-muted'
                        "
                        aria-hidden="true"
                      >
                        @if (step.done) {
                          <app-icon name="check" [size]="13" />
                        } @else {
                          {{ i + 1 }}
                        }
                      </span>
                      <span class="min-w-0 flex-1">
                        <a
                          [routerLink]="link.path"
                          [queryParams]="link.query"
                          class="text-body font-semibold text-fg hover:text-accent hover:underline"
                          [class.line-through]="step.done"
                          >{{ 'hse.overview.start.' + step.key + '.title' | transloco }}</a
                        >
                        <span class="sr-only">
                          {{
                            (step.done ? 'hse.overview.start.done' : 'hse.overview.start.todo')
                              | transloco
                          }}
                        </span>
                        <span class="block text-meta text-fg-muted">{{
                          'hse.overview.start.' + step.key + '.body' | transloco
                        }}</span>
                      </span>
                    </li>
                  }
                </ol>
              </app-card>
            }

            @if (o.incidents?.available) {
              @let inc = o.incidents;
              <section
                class="mb-5 rounded-card border border-border bg-surface p-5 shadow-card"
                aria-labelledby="hse-ov-incidents"
                data-testid="overview-incidents"
              >
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2
                    id="hse-ov-incidents"
                    class="flex items-center gap-2 font-display text-card font-bold text-fg"
                  >
                    <app-icon name="flag" [size]="17" />
                    {{ 'hse.overview.incidents.title' | transloco }}
                  </h2>
                  @let incLink = split(inc.url);
                  <a
                    [routerLink]="incLink.path"
                    [queryParams]="incLink.query"
                    class="text-ui font-semibold text-accent hover:underline"
                    >{{ 'hse.overview.incidents.viewAll' | transloco }}</a
                  >
                </div>
                <p class="mb-3 text-meta text-fg-muted">
                  {{ 'hse.overview.incidents.hint' | transloco }}
                </p>
                <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  @for (fig of incidentFigures(); track fig.key) {
                    <li [attr.data-testid]="'incident-' + fig.key">
                      <ng-template #figure>
                        <span
                          class="font-display text-section leading-none font-bold"
                          [class]="fig.attention ? 'text-warn-ink' : 'text-fg'"
                          >{{ fig.value === null ? '—' : (fig.value | localNumber) }}</span
                        >
                        <span class="mt-1 text-meta leading-snug text-fg-muted">{{
                          'hse.overview.incidents.' + fig.key | transloco
                        }}</span>
                      </ng-template>
                      @if (fig.link; as figLink) {
                        <a
                          [routerLink]="figLink.path"
                          [queryParams]="figLink.query"
                          class="flex h-full flex-col rounded-tile border border-border bg-surface-2 px-3 py-2 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                          [attr.data-testid]="'incident-link-' + fig.key"
                        >
                          <ng-container [ngTemplateOutlet]="figure" />
                        </a>
                      } @else {
                        <div
                          class="flex h-full flex-col rounded-tile border border-border bg-surface-2 px-3 py-2"
                        >
                          <ng-container [ngTemplateOutlet]="figure" />
                        </div>
                      }
                    </li>
                  }
                </ul>
                @if (inc.recent?.length) {
                  <h3 class="mt-4 mb-1 text-meta font-semibold text-fg-subtle">
                    {{ 'hse.overview.incidents.recent' | transloco }}
                  </h3>
                  <ul class="divide-y divide-border">
                    @for (r of inc.recent; track r.id) {
                      <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-ui">
                        <span class="font-mono text-meta text-fg-subtle">{{ r.code }}</span>
                        <a
                          [routerLink]="r.url"
                          class="min-w-0 flex-1 truncate font-semibold text-fg hover:underline"
                          >{{ r.title }}</a
                        >
                        @if (r.severity) {
                          <app-status-badge meaning="severity" [value]="r.severity" />
                        }
                        <span class="text-meta whitespace-nowrap text-fg-muted">{{
                          r.raised_at | localDay
                        }}</span>
                      </li>
                    }
                  </ul>
                }
              </section>
            }

            <div class="grid gap-4 md:grid-cols-2" appTourStep="hse-overview-cards">
              @for (section of sections(); track section.key) {
                <section
                  class="rounded-card border border-border bg-surface p-5 shadow-card"
                  [attr.aria-labelledby]="'hse-ov-' + section.key"
                  [attr.data-testid]="'overview-' + section.key"
                >
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <h2
                      [id]="'hse-ov-' + section.key"
                      class="flex items-center gap-2 font-display text-card font-bold text-fg"
                    >
                      <app-icon [name]="section.icon" [size]="17" />
                      @if (section.key === 'sja') {
                        <app-term key="sja" scope="hse">{{
                          'hse.overview.sections.sja' | transloco
                        }}</app-term>
                      } @else {
                        {{ 'hse.overview.sections.' + section.key | transloco }}
                      }
                    </h2>
                    <a
                      [routerLink]="section.link"
                      class="text-ui font-semibold text-accent hover:underline"
                    >
                      {{ 'hse.overview.viewAll' | transloco }}
                    </a>
                  </div>
                  <ul class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    @for (stat of section.stats; track stat.labelKey) {
                      <li>
                        <a
                          [routerLink]="stat.link"
                          [queryParams]="stat.query ?? null"
                          class="flex h-full flex-col rounded-tile border border-border bg-surface-2 px-3 py-2 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        >
                          <span
                            class="font-display text-section leading-none font-bold"
                            [class]="stat.attention && stat.value > 0 ? 'text-warn-ink' : 'text-fg'"
                            >{{ stat.value | localNumber }}</span
                          >
                          <span class="mt-1 text-meta leading-snug text-fg-muted">{{
                            stat.labelKey | transloco
                          }}</span>
                        </a>
                      </li>
                    }
                  </ul>
                  @if (section.attention.length) {
                    <h3 class="mt-4 mb-1 text-meta font-semibold text-fg-subtle">
                      {{ 'hse.overview.attentionTitle' | transloco }}
                    </h3>
                    <ul
                      class="divide-y divide-border"
                      [attr.data-testid]="'attention-' + section.key"
                    >
                      @for (item of section.attention; track item.id) {
                        <li class="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-ui">
                          <span class="font-mono text-meta text-fg-subtle">{{ item.code }}</span>
                          <a
                            [routerLink]="item.url"
                            class="min-w-0 flex-1 truncate font-semibold text-fg hover:underline"
                            >{{ item.title }}</a
                          >
                          <span class="text-meta whitespace-nowrap text-warn-ink">
                            {{
                              'hse.overview.reason.' + item.reason
                                | transloco: { date: (item.due_at | localDay) }
                            }}
                          </span>
                        </li>
                      }
                    </ul>
                  }
                </section>
              }

              @if (o.risks?.available) {
                @let risks = o.risks;
                @let riskLink = split(risks.url);
                <section
                  class="rounded-card border border-border bg-surface p-5 shadow-card"
                  aria-labelledby="hse-ov-risks"
                  data-testid="overview-risks"
                >
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <h2
                      id="hse-ov-risks"
                      class="flex items-center gap-2 font-display text-card font-bold text-fg"
                    >
                      <app-icon name="risk" [size]="17" />
                      {{ 'hse.overview.risks.title' | transloco }}
                    </h2>
                    <a
                      [routerLink]="riskLink.path"
                      [queryParams]="riskLink.query"
                      class="text-ui font-semibold text-accent hover:underline"
                      >{{ 'hse.overview.viewAll' | transloco }}</a
                    >
                  </div>
                  <ul class="grid grid-cols-2 gap-2">
                    <li class="rounded-tile border border-border bg-surface-2 px-3 py-2">
                      <span
                        class="block font-display text-section leading-none font-bold text-fg"
                        >{{ risks.open ?? 0 | localNumber }}</span
                      >
                      <span class="mt-1 block text-meta text-fg-muted">{{
                        'hse.overview.risks.open' | transloco
                      }}</span>
                    </li>
                    <li class="rounded-tile border border-border bg-surface-2 px-3 py-2">
                      <span
                        class="block font-display text-section leading-none font-bold"
                        [class]="(risks.high ?? 0) > 0 ? 'text-warn-ink' : 'text-fg'"
                        >{{ risks.high ?? 0 | localNumber }}</span
                      >
                      <span class="mt-1 block text-meta text-fg-muted">{{
                        'hse.overview.risks.high' | transloco
                      }}</span>
                    </li>
                  </ul>
                  @if (risks.top?.length) {
                    <h3 class="mt-4 mb-1 text-meta font-semibold text-fg-subtle">
                      {{ 'hse.overview.risks.top' | transloco }}
                    </h3>
                    <ul class="divide-y divide-border">
                      @for (r of risks.top; track r.id) {
                        <li class="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-ui">
                          <span class="font-mono text-meta text-fg-subtle">{{ r.code }}</span>
                          <a
                            [routerLink]="r.url"
                            class="min-w-0 flex-1 truncate font-semibold text-fg hover:underline"
                            >{{ r.title }}</a
                          >
                          @if (r.level) {
                            <app-status-badge meaning="severity" [value]="r.level" />
                          }
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="mt-3 text-meta text-fg-muted">
                      {{ 'hse.overview.risks.none' | transloco }}
                    </p>
                  }
                </section>
              }

              @if (o.tasks; as tasks) {
                @let taskLink = split(tasks.url);
                <section
                  class="rounded-card border border-border bg-surface p-5 shadow-card"
                  aria-labelledby="hse-ov-tasks"
                  data-testid="overview-tasks"
                >
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <h2
                      id="hse-ov-tasks"
                      class="flex items-center gap-2 font-display text-card font-bold text-fg"
                    >
                      <app-icon name="check" [size]="17" />
                      {{ 'hse.overview.tasks.title' | transloco }}
                    </h2>
                    <a
                      [routerLink]="taskLink.path"
                      [queryParams]="taskLink.query"
                      class="text-ui font-semibold text-accent hover:underline"
                      >{{ 'hse.overview.viewAll' | transloco }}</a
                    >
                  </div>
                  <p class="mb-3 text-meta text-fg-muted">
                    {{ 'hse.overview.tasks.hint' | transloco }}
                  </p>
                  <ul class="grid grid-cols-2 gap-2">
                    <li class="rounded-tile border border-border bg-surface-2 px-3 py-2">
                      <span
                        class="block font-display text-section leading-none font-bold text-fg"
                        >{{ tasks.open | localNumber }}</span
                      >
                      <span class="mt-1 block text-meta text-fg-muted">{{
                        'hse.overview.tasks.open' | transloco
                      }}</span>
                    </li>
                    <li class="rounded-tile border border-border bg-surface-2 px-3 py-2">
                      <span
                        class="block font-display text-section leading-none font-bold"
                        [class]="tasks.overdue > 0 ? 'text-warn-ink' : 'text-fg'"
                        >{{ tasks.overdue | localNumber }}</span
                      >
                      <span class="mt-1 block text-meta text-fg-muted">{{
                        'hse.overview.tasks.overdue' | transloco
                      }}</span>
                    </li>
                  </ul>
                </section>
              }
            </div>
          }
        }
      }

      <div class="mt-8"><app-why-it-matters scope="hse" page="overview" /></div>
    </div>
  `,
})
export class HseOverviewPage {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly registrer = inject(RegistrerService);
  protected readonly perms = injectHsePermissions();
  protected readonly nav = HSE_NAV;
  protected readonly split = splitUrl;
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly overview = signal<HseOverview | null>(null);
  private readonly reloads = signal(0);

  protected readonly canReport = this.perms.has('deviations:write');
  protected readonly sections = computed(() => {
    const o = this.overview();
    return o ? overviewSections(o) : [];
  });
  protected readonly gettingStarted = computed(() => {
    const o = this.overview();
    if (!o) {
      return null;
    }
    const gs = o.getting_started;
    return gs?.show && gs.steps?.length ? gs : null;
  });
  /** Injury and absence figures of the last 12 months (null = no lost-time injury yet). */
  protected readonly incidentFigures = computed(() => {
    const inc = this.overview()?.incidents;
    if (!inc?.available) {
      return [];
    }
    // U33: counts open the filtered list (derived figures - lost days, days since - do not).
    const base = splitUrl(inc.url);
    const link = (url: string | undefined) => (url ? splitUrl(url) : null);
    return [
      {
        key: 'open',
        value: inc.open ?? 0,
        attention: (inc.open ?? 0) > 0,
        link: { path: base.path, query: { ...(base.query ?? {}), active: 'true' } },
      },
      {
        key: 'nearMisses',
        value: inc.near_misses_365 ?? 0,
        attention: false,
        link: link(inc.near_misses_url),
      },
      {
        key: 'injuries',
        value: inc.injuries_365 ?? 0,
        attention: (inc.injuries_365 ?? 0) > 0,
        link: link(inc.injuries_url),
      },
      {
        key: 'lostTime',
        value: inc.lost_time_injuries_365 ?? 0,
        attention: (inc.lost_time_injuries_365 ?? 0) > 0,
        link: null,
      },
      { key: 'lostDays', value: inc.lost_days_365 ?? 0, attention: false, link: null },
      { key: 'daysSince', value: inc.days_since_lost_time ?? null, attention: false, link: null },
    ];
  });

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      view: 'dashboard',
      title: this.language.translate('modules.names.hse'),
    }));

    effect((onCleanup) => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reloads();
      if (!orgId) {
        return;
      }
      if (!untracked(this.overview)) {
        this.state.set('loading');
      }
      const sub = this.api.overview(orgId).subscribe({
        next: (overview) => {
          this.overview.set(overview);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  /** U33: the short HMS form (near miss, injury, dangerous condition …) from "Registrer". */
  protected reportIncident(): void {
    this.registrer.show({ type: 'near_miss' });
  }
}
