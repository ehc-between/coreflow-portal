import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { AuditAccess } from '../data/audit-access';
import { certificationStatusTone, planStatusTone, sumCounts } from '../data/audit-display';
import { AuditsOverview, FINDING_TYPES } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';

/** Statuses counted as "running" on the overview. */
const RUNNING = ['in_progress', 'reporting', 'report_review'];

/**
 * `/audits`: the audit module at a glance — running and planned audits, open
 * findings by type, overdue responses, the next audits and certificates that are
 * about to expire — plus the learning content for the module.
 */
@Component({
  selector: 'app-audits-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Card,
    KpiTile,
    GuideIntro,
    WhyItMatters,
    LessonView,
    TourButton,
    TourStepDirective,
    AuditsNav,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'audits.overview.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">{{ 'audits.overview.subtitle' | transloco }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-tour-button scope="audits" tour="overview" />
          @if (access.canWrite()) {
            <a
              routerLink="/audits/plans/new"
              [appTourStep]="'audits-new'"
              class="inline-flex h-9 items-center rounded-[10px] bg-accent px-3.5 text-[13px] font-semibold text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {{ 'audits.plans.new' | transloco }}
            </a>
          }
        </div>
      </header>
      <app-audits-nav />

      <div class="mt-5 flex flex-col gap-3">
        <app-guide-intro scope="audits" page="overview" />
        <app-why-it-matters scope="audits" page="overview" />
      </div>

      <app-audit-load-state class="mt-4" [state]="data.state()" (retry)="reload()" />
      @if (data.value(); as o) {
        <div class="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5" [appTourStep]="'audits-kpis'">
          <app-kpi-tile
            [label]="'audits.overview.kpi.planned' | transloco"
            [value]="o.plans_by_status['planned'] ?? 0"
            tone="accent"
          />
          <app-kpi-tile
            [label]="'audits.overview.kpi.running' | transloco"
            [value]="running()"
            tone="info"
          />
          <app-kpi-tile
            [label]="'audits.overview.kpi.closed' | transloco"
            [value]="o.plans_by_status['closed'] ?? 0"
            tone="pass"
          />
          <app-kpi-tile
            [label]="'audits.overview.kpi.openFindings' | transloco"
            [value]="openFindings()"
            tone="warn"
          />
          <app-kpi-tile
            [label]="'audits.overview.kpi.overdue' | transloco"
            [value]="o.findings_overdue"
            [tone]="o.findings_overdue ? 'fail' : 'neutral'"
          />
        </div>

        <div class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <app-card class="lg:col-span-2">
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'audits.overview.upcoming' | transloco }}
            </h2>
            @if (o.upcoming_audits.length) {
              <ul class="divide-y divide-border">
                @for (p of o.upcoming_audits; track p.id) {
                  <li class="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <a
                      [routerLink]="['/audits/plans', p.id]"
                      class="min-w-0 flex-1 text-[13.5px] font-semibold text-fg hover:text-accent"
                    >
                      <span class="text-fg-subtle">{{ p.code }}</span> {{ p.title }}
                    </a>
                    <span class="text-[12.5px] text-fg-muted">
                      {{ p.planned_start | localDay }}
                    </span>
                    <app-badge [tone]="statusTone(p.status)">
                      {{ 'audits.planStatus.' + p.status | transloco }}
                    </app-badge>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-[13px] text-fg-muted">
                {{ 'audits.overview.noUpcoming' | transloco }}
              </p>
            }
          </app-card>

          <div class="flex flex-col gap-4">
            <app-card>
              <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
                {{ 'audits.overview.findingsByType' | transloco }}
              </h2>
              <ul class="flex flex-col gap-1.5">
                @for (t of findingTypes; track t) {
                  <li class="flex items-center justify-between text-[13px]">
                    <a
                      [routerLink]="['/audits/findings']"
                      [queryParams]="{ type: t }"
                      class="text-fg-muted hover:text-accent"
                    >
                      {{ 'audits.findingType.' + t | transloco }}
                    </a>
                    <span class="font-semibold text-fg">{{ o.findings_open_by_type[t] ?? 0 }}</span>
                  </li>
                }
              </ul>
            </app-card>
            <app-card>
              <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
                {{ 'audits.overview.expiring' | transloco }}
              </h2>
              @if (o.certifications_expiring.length) {
                <ul class="flex flex-col gap-2">
                  @for (c of o.certifications_expiring; track c.id) {
                    <li class="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                      <a
                        [routerLink]="['/audits/certifications', c.id]"
                        class="font-semibold text-fg hover:text-accent"
                      >
                        {{ 'audits.frameworks.' + c.framework | transloco }} ·
                        {{ c.certification_body }}
                      </a>
                      <app-badge [tone]="certTone(c.status)">
                        {{
                          'audits.certification.expiresIn'
                            | transloco: { days: c.days_to_expiry ?? 0 }
                        }}
                      </app-badge>
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-[13px] text-fg-muted">
                  {{ 'audits.overview.noExpiring' | transloco }}
                </p>
              }
            </app-card>
          </div>
        </div>
      }

      <section class="mt-6">
        <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
          {{ 'audits.overview.learn' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <app-lesson scope="audits" lesson="internal-audits" />
          <app-lesson scope="audits" lesson="findings-and-capa" />
        </div>
      </section>
    </div>
  `,
})
export class AuditsOverviewPage {
  private readonly api = inject(AuditsApi);
  protected readonly access = inject(AuditAccess);
  protected readonly data = loadable<AuditsOverview>();
  protected readonly findingTypes = FINDING_TYPES;
  protected readonly statusTone = planStatusTone;
  protected readonly certTone = certificationStatusTone;

  protected readonly running = computed(() =>
    sumCounts(this.data.value()?.plans_by_status ?? {}, RUNNING),
  );
  protected readonly openFindings = computed(() =>
    sumCounts(this.data.value()?.findings_open_by_type ?? {}),
  );

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
}
