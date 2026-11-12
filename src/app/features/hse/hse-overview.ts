import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';
import { HseApi } from './data/hse-api';
import { HseOverview } from './data/hse.models';
import { HSE_MODULE, HseLessonButton, HseNav, injectHsePermissions } from './shared/hse-shared';

interface Stat {
  readonly labelKey: string;
  readonly value: number;
  readonly tone: 'neutral' | 'warn' | 'fail' | 'pass' | 'info';
  readonly link: string;
  readonly query?: Readonly<Record<string, string>>;
}

interface Section {
  readonly key: 'sja' | 'ppe' | 'consultations' | 'safetyRounds';
  readonly icon: string;
  readonly link: string;
  readonly stats: readonly Stat[];
}

/** The overview counts as the four landing-page cards. */
export function overviewSections(o: HseOverview): Section[] {
  return [
    {
      key: 'sja',
      icon: 'risk',
      link: '/hse/sja',
      stats: [
        {
          labelKey: 'hse.sja.status.draft',
          value: o.sja.draft,
          tone: 'neutral',
          link: '/hse/sja',
          query: { status: 'draft' },
        },
        {
          labelKey: 'hse.sja.status.in_review',
          value: o.sja.in_review,
          tone: o.sja.in_review ? 'warn' : 'neutral',
          link: '/hse/sja',
          query: { status: 'in_review' },
        },
        {
          labelKey: 'hse.sja.status.approved',
          value: o.sja.approved,
          tone: 'info',
          link: '/hse/sja',
          query: { status: 'approved' },
        },
        {
          labelKey: 'hse.sja.status.completed',
          value: o.sja.completed,
          tone: 'pass',
          link: '/hse/sja',
          query: { status: 'completed' },
        },
      ],
    },
    {
      key: 'ppe',
      icon: 'qa',
      link: '/hse/ppe',
      stats: [
        {
          labelKey: 'hse.ppe.status.in_stock',
          value: o.ppe.in_stock,
          tone: 'neutral',
          link: '/hse/ppe',
          query: { status: 'in_stock' },
        },
        {
          labelKey: 'hse.ppe.status.issued',
          value: o.ppe.issued,
          tone: 'info',
          link: '/hse/ppe',
          query: { status: 'issued' },
        },
        {
          labelKey: 'hse.overview.ppeOverdue',
          value: o.ppe.overdue,
          tone: o.ppe.overdue ? 'fail' : 'neutral',
          link: '/hse/ppe',
          query: { due: '0' },
        },
        {
          labelKey: 'hse.overview.ppeDueSoon',
          value: o.ppe.due_within_30_days,
          tone: o.ppe.due_within_30_days ? 'warn' : 'neutral',
          link: '/hse/ppe',
          query: { due: '30' },
        },
      ],
    },
    {
      key: 'consultations',
      icon: 'people',
      link: '/hse/consultations',
      stats: [
        {
          labelKey: 'hse.consultation.status.planned',
          value: o.consultations.planned,
          tone: 'info',
          link: '/hse/consultations',
          query: { status: 'planned' },
        },
        {
          labelKey: 'hse.overview.heldLastYear',
          value: o.consultations.held_last_365_days,
          tone: o.consultations.held_last_365_days ? 'pass' : 'warn',
          link: '/hse/consultations',
          query: { status: 'held' },
        },
      ],
    },
    {
      key: 'safetyRounds',
      icon: 'calendar',
      link: '/hse/safety-rounds',
      stats: [
        {
          labelKey: 'hse.overview.roundsOpen',
          value: o.safety_rounds.open,
          tone: 'info',
          link: '/hse/safety-rounds',
        },
        {
          labelKey: 'hse.overview.roundsOverdue',
          value: o.safety_rounds.overdue,
          tone: o.safety_rounds.overdue ? 'fail' : 'neutral',
          link: '/hse/safety-rounds',
        },
      ],
    },
  ];
}

const TONE_CLASS: Readonly<Record<Stat['tone'], string>> = {
  neutral: 'text-fg',
  info: 'text-info',
  pass: 'text-pass',
  warn: 'text-warn',
  fail: 'text-fail',
};

/**
 * `/hse`: the health and safety landing page — counts of safe job analyses, PPE
 * (with inspection and expiry due dates), worker consultation and safety rounds,
 * each linking to the filtered list, plus quick actions and learning content.
 */
@Component({
  selector: 'app-hse-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalNumberPipe,
    Button,
    Icon,
    GuideIntro,
    WhyItMatters,
    TourButton,
    TourStepDirective,
    HseNav,
    HseLessonButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'hse.overview.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">{{ 'hse.overview.subtitle' | transloco }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-tour-button scope="hse" tour="overview" />
          <app-hse-lesson-button lesson="iso45001-basics" labelKey="hse.overview.lesson" />
        </div>
      </div>

      <app-hse-nav />

      <div class="mb-5 grid gap-4 lg:grid-cols-[1fr_340px]">
        <app-guide-intro scope="hse" page="overview" />
        <app-why-it-matters scope="hse" page="overview" />
      </div>

      @if (perms.write()) {
        <div class="mb-5 flex flex-wrap gap-2" appTourStep="hse-quick-actions">
          <a routerLink="/hse/sja/new" tabindex="-1">
            <app-button>
              <app-icon name="plus" [size]="15" />
              {{ 'hse.sja.new' | transloco }}
            </app-button>
          </a>
          <a routerLink="/hse/ppe/new" tabindex="-1">
            <app-button variant="secondary">
              <app-icon name="plus" [size]="15" />
              {{ 'hse.ppe.new' | transloco }}
            </app-button>
          </a>
          <a routerLink="/hse/consultations/new" tabindex="-1">
            <app-button variant="secondary">
              <app-icon name="plus" [size]="15" />
              {{ 'hse.consultation.new' | transloco }}
            </app-button>
          </a>
        </div>
      }

      @if (state() === 'loading') {
        <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
          {{ 'hse.common.loading' | transloco }}
        </p>
      } @else if (state() === 'error') {
        <p class="py-10 text-center text-[14px] text-fail" role="alert">
          {{ 'hse.overview.loadFailed' | transloco }}
        </p>
      } @else if (sections().length) {
        <div class="grid gap-4 md:grid-cols-2" appTourStep="hse-overview-cards">
          @for (section of sections(); track section.key) {
            <section
              class="rounded-card border border-border bg-surface p-4 shadow-card"
              [attr.aria-labelledby]="'hse-ov-' + section.key"
              [attr.data-testid]="'overview-' + section.key"
            >
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2
                  [id]="'hse-ov-' + section.key"
                  class="flex items-center gap-2 font-display text-[16px] font-bold text-fg"
                >
                  <app-icon [name]="section.icon" [size]="17" />
                  {{ 'hse.overview.sections.' + section.key | transloco }}
                </h2>
                <a
                  [routerLink]="section.link"
                  class="text-[12.5px] font-semibold text-accent hover:underline"
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
                        class="font-display text-[22px] leading-none font-bold"
                        [class]="toneClass[stat.tone]"
                        >{{ stat.value | localNumber }}</span
                      >
                      <span class="mt-1 text-[12px] leading-snug text-fg-muted">{{
                        stat.labelKey | transloco
                      }}</span>
                    </a>
                  </li>
                }
              </ul>
            </section>
          }
        </div>
      }
    </div>
  `,
})
export class HseOverviewPage {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly perms = injectHsePermissions();
  protected readonly toneClass = TONE_CLASS;
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly sections = signal<readonly Section[]>([]);

  constructor() {
    providePageContext(() => ({ module: HSE_MODULE, view: 'dashboard' }));

    effect((onCleanup) => {
      const orgId = this.selectedOrg.currentOrgId();
      if (!orgId) {
        return;
      }
      this.state.set('loading');
      const sub = this.api.overview(orgId).subscribe({
        next: (overview) => {
          this.sections.set(overviewSections(overview));
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }
}
