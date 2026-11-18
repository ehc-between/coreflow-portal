import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import {
  findingStatusBadge,
  findingTypeBadge,
  leadAuditorName,
  planStatusBadge,
  sumCounts,
} from '../data/audit-display';
import { AuditsOverview, FINDING_TYPES, OverviewSetup } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';

/** Statuses counted as "running" on the overview. */
const RUNNING = ['in_progress', 'reporting', 'report_review'];

/** One step of the "getting started" checklist. */
export interface SetupStep {
  readonly key: 'programme' | 'auditors' | 'audit' | 'closed' | 'certification';
  readonly done: boolean;
  readonly link: string;
  /** Who may do it (the button is hidden otherwise). */
  readonly allowed: boolean;
}

/** The getting-started steps in the order a beginner should take them. */
export function setupSteps(
  setup: OverviewSetup,
  can: { readonly write: boolean; readonly manage: boolean },
): SetupStep[] {
  return [
    {
      key: 'programme',
      done: setup.programmes > 0,
      link: '/audits/programmes/new',
      allowed: can.write,
    },
    { key: 'auditors', done: setup.auditors > 0, link: '/audits/auditors', allowed: can.manage },
    { key: 'audit', done: setup.audits > 0, link: '/audits/plans/new', allowed: can.write },
    { key: 'closed', done: setup.audits_closed > 0, link: '/audits/plans', allowed: true },
    {
      key: 'certification',
      done: setup.certifications > 0,
      link: '/audits/certifications/new',
      allowed: can.manage,
    },
  ];
}

/**
 * `/audits`: the audit module at a glance. Tiles that open the matching list, a
 * "getting started" checklist until the basics exist, the caller's own audits and
 * findings to answer, the next audits, open findings by type and certificates
 * that need attention.
 */
@Component({
  selector: 'app-audits-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Button,
    Card,
    HelpStrip,
    Icon,
    KpiTile,
    PageHeader,
    StatusBadge,
    TourStepDirective,
    WhyItMatters,
    AuditsNav,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header titleKey="modules.names.audits" descriptionKey="audits.overview.subtitle">
        @if (access.canWrite()) {
          <app-button primary [appTourStep]="'audits-new'" (click)="newPlan()">
            <app-icon name="plus" [size]="14" />
            {{ 'audits.plans.new' | transloco }}
          </app-button>
        }
      </app-page-header>
      <app-audits-nav />
      <app-help-strip scope="audits" page="overview" tour="overview" lesson="internal-audits" />

      <app-audit-load-state [state]="data.state()" [rows]="6" (retry)="reload()" />
      @if (data.value(); as o) {
        <div
          class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          role="group"
          [attr.aria-label]="'audits.overview.kpiGroup' | transloco"
          [appTourStep]="'audits-kpis'"
        >
          @for (k of kpis(); track k.key) {
            <app-kpi-tile
              [link]="k.link"
              [queryParams]="k.params"
              [attr.data-testid]="'audits-kpi-' + k.key"
              [label]="'audits.overview.kpi.' + k.key | transloco"
              [value]="k.value"
              [tone]="k.tone"
            />
          }
        </div>

        @if (steps(); as steps) {
          <app-card class="mt-5 block" data-testid="audits-getting-started">
            <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="font-display text-section font-bold text-fg">
                {{ 'audits.overview.start.title' | transloco }}
              </h2>
              <span class="text-meta text-fg-muted">
                {{
                  'audits.overview.start.progress'
                    | transloco: { done: stepsDone(), total: steps.length }
                }}
              </span>
            </div>
            <p class="mb-3 text-body text-fg-muted">
              {{ 'audits.overview.start.body' | transloco }}
            </p>
            <ol class="flex flex-col divide-y divide-border">
              @for (s of steps; track s.key; let i = $index) {
                <li class="flex flex-wrap items-center gap-3 py-2.5">
                  <span
                    class="flex h-6 w-6 flex-none items-center justify-center rounded-full text-micro font-bold"
                    [class]="s.done ? 'bg-pass-soft text-pass-ink' : 'bg-surface-2 text-fg-muted'"
                    aria-hidden="true"
                  >
                    @if (s.done) {
                      <app-icon name="check" [size]="13" />
                    } @else {
                      {{ i + 1 }}
                    }
                  </span>
                  <div class="min-w-0 flex-1">
                    <p
                      class="text-body font-semibold"
                      [class]="s.done ? 'text-fg-muted' : 'text-fg'"
                    >
                      {{ 'audits.overview.start.steps.' + s.key + '.title' | transloco }}
                      @if (s.done) {
                        <span class="sr-only"
                          >({{ 'audits.overview.start.done' | transloco }})</span
                        >
                      }
                    </p>
                    @if (!s.done) {
                      <p class="text-meta text-fg-muted">
                        {{ 'audits.overview.start.steps.' + s.key + '.body' | transloco }}
                      </p>
                    }
                  </div>
                  @if (!s.done && s.allowed) {
                    <a
                      [routerLink]="s.link"
                      class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      {{ 'audits.overview.start.steps.' + s.key + '.cta' | transloco }}
                    </a>
                  }
                </li>
              }
            </ol>
          </app-card>
        }

        @if (o.mine; as mine) {
          @if (mine.audits.length || mine.findings.length) {
            <app-card class="mt-5 block" data-testid="audits-mine">
              <h2 class="mb-3 font-display text-section font-bold text-fg">
                {{ 'audits.overview.mine.title' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
                <section>
                  <h3 class="mb-2 text-ui font-semibold text-fg-muted">
                    {{ 'audits.overview.mine.audits' | transloco }}
                  </h3>
                  <ul class="flex flex-col divide-y divide-border">
                    @for (p of mine.audits; track p.id) {
                      <li class="flex flex-wrap items-center gap-2 py-2">
                        <a
                          [routerLink]="['/audits/plans', p.id]"
                          class="min-w-0 flex-1 text-body font-semibold text-fg hover:text-accent"
                        >
                          <span class="font-mono text-meta font-normal text-fg-subtle">{{
                            p.code
                          }}</span>
                          {{ p.title }}
                        </a>
                        @let pb = planBadge(p.status);
                        <app-status-badge
                          [meaning]="pb.meaning"
                          [value]="pb.value"
                          [labelKey]="pb.labelKey"
                        />
                      </li>
                    } @empty {
                      <li class="py-2 text-meta text-fg-muted">
                        {{ 'audits.overview.mine.noAudits' | transloco }}
                      </li>
                    }
                  </ul>
                </section>
                <section>
                  <h3 class="mb-2 text-ui font-semibold text-fg-muted">
                    {{ 'audits.overview.mine.findings' | transloco }}
                  </h3>
                  <ul class="flex flex-col divide-y divide-border">
                    @for (f of mine.findings; track f.id) {
                      <li class="flex flex-wrap items-center gap-2 py-2">
                        <a
                          [routerLink]="['/audits/findings', f.id]"
                          class="min-w-0 flex-1 text-body font-semibold text-fg hover:text-accent"
                        >
                          <span class="font-mono text-meta font-normal text-fg-subtle">{{
                            f.code
                          }}</span>
                          {{ f.title }}
                        </a>
                        @if (f.response_due_at) {
                          <span
                            class="text-meta"
                            [class]="f.overdue ? 'font-semibold text-warn-ink' : 'text-fg-muted'"
                          >
                            {{ f.response_due_at | localDay }}
                            @if (f.overdue) {
                              · {{ 'common.status.overdue' | transloco }}
                            }
                          </span>
                        }
                        @let fb = findingStatus(f.status);
                        <app-status-badge
                          [meaning]="fb.meaning"
                          [value]="fb.value"
                          [labelKey]="fb.labelKey"
                        />
                      </li>
                    } @empty {
                      <li class="py-2 text-meta text-fg-muted">
                        {{ 'audits.overview.mine.noFindings' | transloco }}
                      </li>
                    }
                  </ul>
                </section>
              </div>
            </app-card>
          }
        }

        <div class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <app-card class="lg:col-span-2">
            <div class="mb-3 flex items-baseline justify-between gap-2">
              <h2 class="font-display text-section font-bold text-fg">
                {{ 'audits.overview.upcoming' | transloco }}
              </h2>
              <a
                routerLink="/audits/plans"
                class="text-ui font-semibold text-accent hover:underline"
                >{{ 'audits.overview.seeAll' | transloco }} →</a
              >
            </div>
            @if (o.upcoming_audits.length) {
              <ul class="divide-y divide-border">
                @for (p of o.upcoming_audits; track p.id) {
                  <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <a
                      [routerLink]="['/audits/plans', p.id]"
                      class="min-w-0 flex-1 basis-[240px] text-body font-semibold text-fg hover:text-accent"
                    >
                      <span class="font-mono text-meta font-normal text-fg-subtle">{{
                        p.code
                      }}</span>
                      {{ p.title }}
                    </a>
                    <span class="text-meta text-fg-muted">{{ p.planned_start | localDay }}</span>
                    <span class="text-meta text-fg-muted">
                      {{ lead(p) || ('audits.common.noLead' | transloco) }}
                    </span>
                    @let ub = planBadge(p.status);
                    <app-status-badge
                      [meaning]="ub.meaning"
                      [value]="ub.value"
                      [labelKey]="ub.labelKey"
                    />
                  </li>
                }
              </ul>
            } @else {
              <p class="text-body text-fg-muted">
                {{ 'audits.overview.noUpcoming' | transloco }}
              </p>
            }
          </app-card>

          <div class="flex flex-col gap-4">
            <app-card>
              <div class="mb-3 flex items-baseline justify-between gap-2">
                <h2 class="font-display text-section font-bold text-fg">
                  {{ 'audits.overview.findingsByType' | transloco }}
                </h2>
                <a
                  routerLink="/audits/findings"
                  class="text-ui font-semibold text-accent hover:underline"
                  >{{ 'audits.overview.seeAll' | transloco }} →</a
                >
              </div>
              <ul class="flex flex-col gap-2">
                @for (t of findingTypes; track t) {
                  <li class="flex items-center justify-between gap-2 text-ui">
                    <a
                      [routerLink]="['/audits/findings']"
                      [queryParams]="{ type: t }"
                      class="hover:underline"
                    >
                      @let tb = typeBadge(t);
                      <app-status-badge
                        [meaning]="tb.meaning"
                        [value]="tb.value"
                        [labelKey]="tb.labelKey"
                      />
                    </a>
                    <span class="font-semibold text-fg">{{ o.findings_open_by_type[t] ?? 0 }}</span>
                  </li>
                }
              </ul>
            </app-card>
            <app-card>
              <div class="mb-3 flex items-baseline justify-between gap-2">
                <h2 class="font-display text-section font-bold text-fg">
                  {{ 'audits.overview.expiring' | transloco }}
                </h2>
                <a
                  routerLink="/audits/certifications"
                  class="text-ui font-semibold text-accent hover:underline"
                  >{{ 'audits.overview.seeAll' | transloco }} →</a
                >
              </div>
              @if (o.certifications_expiring.length) {
                <ul class="flex flex-col gap-2">
                  @for (c of o.certifications_expiring; track c.id) {
                    <li class="flex flex-wrap items-center justify-between gap-2 text-ui">
                      <a
                        [routerLink]="['/audits/certifications', c.id]"
                        class="font-semibold text-fg hover:text-accent"
                      >
                        {{
                          c.title ||
                            ('audits.certification.titleFallback'
                              | transloco
                                : {
                                    framework: ('audits.frameworks.' + c.framework | transloco),
                                    body: c.certification_body,
                                  })
                        }}
                      </a>
                      <app-status-badge
                        meaning="lifecycle"
                        value="expiring"
                        labelKey="audits.certification.expiresIn"
                        [labelParams]="{ days: c.days_to_expiry ?? 0 }"
                      />
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-body text-fg-muted">
                  {{ 'audits.overview.noExpiring' | transloco }}
                </p>
              }
            </app-card>
          </div>
        </div>
      }

      <div class="mt-8"><app-why-it-matters scope="audits" page="overview" /></div>
    </div>
  `,
})
export class AuditsOverviewPage {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  protected readonly access = inject(AuditAccess);
  protected readonly data = loadable<AuditsOverview>();
  protected readonly findingTypes = FINDING_TYPES;
  protected readonly planBadge = planStatusBadge;
  protected readonly typeBadge = findingTypeBadge;
  protected readonly findingStatus = findingStatusBadge;
  protected readonly lead = leadAuditorName;

  protected readonly kpis = computed(() => {
    const o = this.data.value();
    if (!o) {
      return [];
    }
    const open = o.findings_open_total ?? sumCounts(o.findings_open_by_type);
    return [
      {
        key: 'planned',
        value: o.plans_by_status['planned'] ?? 0,
        tone: 'accent' as const,
        link: '/audits/plans',
        params: { status: 'planned' },
      },
      {
        key: 'running',
        value: sumCounts(o.plans_by_status, RUNNING),
        tone: 'info' as const,
        link: '/audits/plans',
        params: { status: 'in_progress' },
      },
      {
        key: 'closed',
        value: o.plans_by_status['closed'] ?? 0,
        tone: 'pass' as const,
        link: '/audits/plans',
        params: { status: 'closed' },
      },
      {
        key: 'openFindings',
        value: open,
        tone: 'warn' as const,
        link: '/audits/findings',
        params: { status: 'unresolved' },
      },
      {
        key: 'overdue',
        value: o.findings_overdue,
        tone: o.findings_overdue ? ('warn' as const) : ('neutral' as const),
        link: '/audits/findings',
        params: { status: 'unresolved', overdue: '1' },
      },
    ];
  });

  /** The getting-started steps, or null once everything is in place (or unknown). */
  protected readonly steps = computed(() => {
    const setup = this.data.value()?.setup;
    if (!setup) {
      return null;
    }
    const steps = setupSteps(setup, {
      write: this.access.canWrite(),
      manage: this.access.canManage(),
    });
    return steps.every((s) => s.done) ? null : steps;
  });
  protected readonly stepsDone = computed(() => (this.steps() ?? []).filter((s) => s.done).length);

  constructor() {
    providePageContext(() => ({ module: 'audits', view: 'dashboard' }));
    effect(() => {
      this.access.orgId();
      untracked(() => this.reload());
    });
  }

  protected reload(): void {
    const orgId = this.access.orgId();
    if (orgId) {
      this.data.load(this.api.overview(orgId));
    }
  }

  protected newPlan(): void {
    void this.router.navigate(['/audits/plans/new']);
  }
}
