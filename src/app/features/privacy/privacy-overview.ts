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
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachMe } from '../../shared/guidance/teach-me';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../shared/ui/kpi-tile/kpi-tile';
import { PrivacyApi } from './data/privacy-api';
import { DataBreach, DataSubjectRequest, PrivacyOverview as Overview } from './data/privacy.models';
import { clockFact } from './data/privacy-display';
import { REGISTERS, REGISTER_LIST } from './data/privacy-registers';
import { PrivacyLessonLink, PrivacyNav, privacyPermissions } from './privacy-nav';

interface Tile {
  readonly key: string;
  readonly value: number;
  readonly tone: KpiTone;
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
 * The privacy overview (`/privacy`): headline numbers (`GET /overview`), what
 * needs attention now (breaches on the 72-hour clock, requests nearing their
 * deadline), and a card per register.
 */
@Component({
  selector: 'app-privacy-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    GuideIntro,
    TeachMe,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    Badge,
    Card,
    Icon,
    KpiTile,
    PrivacyNav,
    PrivacyLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'privacy.overview.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">
            {{ 'privacy.overview.subtitle' | transloco }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-tour-button scope="privacy" tour="overview" />
          <app-teach-me topic="privacy.overview" />
        </div>
      </header>

      <app-privacy-nav active="overview" />
      <app-guide-intro scope="privacy" page="overview" />

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'privacy.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="py-10 text-center text-[14px] text-fail" role="alert">
            {{ 'privacy.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          <section
            class="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
            appTourStep="privacy-kpis"
            [attr.aria-label]="'privacy.overview.kpis' | transloco"
            data-testid="privacy-kpis"
          >
            @for (t of tiles(); track t.key) {
              <a
                [routerLink]="t.link"
                [queryParams]="t.query ?? null"
                class="rounded-card outline-none focus-visible:ring-2 focus-visible:ring-accent"
                [attr.data-testid]="'kpi-' + t.key"
              >
                <app-kpi-tile
                  [label]="'privacy.overview.tiles.' + t.key | transloco"
                  [value]="t.value"
                  [tone]="t.tone"
                />
              </a>
            }
          </section>
        }
      }

      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <app-card appTourStep="privacy-breaches">
          <h2 class="mb-3 flex items-center gap-2 font-display text-[15px] font-bold text-fg">
            <app-icon name="alert" [size]="16" />
            {{ 'privacy.overview.breachesNow' | transloco }}
          </h2>
          @if (breaches().length === 0) {
            <p class="text-[13px] text-fg-muted">{{ 'privacy.overview.noBreaches' | transloco }}</p>
          } @else {
            <ul class="divide-y divide-border" data-testid="attention-breaches">
              @for (b of breaches(); track b.id) {
                <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                  <a
                    [routerLink]="['/privacy', 'breaches', b.id]"
                    class="min-w-0 truncate text-[13px] font-semibold text-fg hover:underline"
                  >
                    <span class="font-mono text-[12px] text-fg-subtle">{{ b.code }}</span>
                    {{ b.title }}
                  </a>
                  <app-badge [tone]="clockTone(b)">{{
                    clock(b).key | transloco: clock(b).params
                  }}</app-badge>
                </li>
              }
            </ul>
          }
        </app-card>

        @if (canRequests()) {
          <app-card>
            <h2 class="mb-3 flex items-center gap-2 font-display text-[15px] font-bold text-fg">
              <app-icon name="inbox" [size]="16" />
              {{ 'privacy.overview.requestsNow' | transloco }}
            </h2>
            @if (requests().length === 0) {
              <p class="text-[13px] text-fg-muted">
                {{ 'privacy.overview.noRequests' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="attention-requests">
                @for (r of requests(); track r.id) {
                  <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                    <a
                      [routerLink]="['/privacy', 'data-subject-requests', r.id]"
                      class="min-w-0 truncate text-[13px] font-semibold text-fg hover:underline"
                    >
                      <span class="font-mono text-[12px] text-fg-subtle">{{ r.code }}</span>
                      {{ 'privacy.options.dsrType.' + r.request_type | transloco }}
                    </a>
                    <span
                      class="text-[12.5px]"
                      [class.text-fail]="r.is_overdue"
                      [class.font-semibold]="r.is_overdue"
                    >
                      {{
                        'privacy.overview.dueOn'
                          | transloco: { date: (r.effective_due_at | localDate: 'mediumDate') }
                      }}
                    </span>
                  </li>
                }
              </ul>
            }
          </app-card>
        }
      </div>

      <h2 class="mt-8 mb-3 font-display text-[16px] font-bold text-fg">
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
              <span class="block text-[14px] font-semibold text-fg group-hover:underline">
                {{ 'privacy.registers.' + r.key + '.plural' | transloco }}
              </span>
              <span class="mt-0.5 block text-[12.5px] leading-snug text-fg-muted">
                {{ 'privacy.registers.' + r.key + '.description' | transloco }}
              </span>
            </span>
          </a>
        }
      </div>

      <div class="mt-8 flex flex-col gap-3">
        <app-why-it-matters scope="privacy" page="overview" />
        <div class="flex flex-wrap gap-2" data-testid="overview-lessons">
          @for (l of lessons; track l) {
            <app-privacy-lesson-link [lesson]="l" />
          }
        </div>
      </div>
    </div>
  `,
})
export class PrivacyOverview {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly perms = privacyPermissions();

  protected readonly lessons = OVERVIEW_LESSONS;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly overview = signal<Overview | null>(null);
  protected readonly breaches = signal<readonly DataBreach[]>([]);
  protected readonly requests = signal<readonly DataSubjectRequest[]>([]);

  protected readonly canRequests = computed(() => this.perms().has(REGISTERS.dsr.readPermission));
  protected readonly registers = computed(() =>
    REGISTER_LIST.filter((r) => this.perms().has(r.readPermission)),
  );

  protected readonly tiles = computed<readonly Tile[]>(() => {
    const o = this.overview();
    if (!o) {
      return [];
    }
    const warn = (n: number): KpiTone => (n > 0 ? 'warn' : 'pass');
    const fail = (n: number): KpiTone => (n > 0 ? 'fail' : 'pass');
    const tiles: Tile[] = [
      { key: 'ropaActive', value: o.ropa_active, tone: 'accent', link: ['/privacy', 'ropa'] },
      {
        key: 'breachesOpen',
        value: o.breaches_open,
        tone: warn(o.breaches_open),
        link: ['/privacy', 'breaches'],
      },
      {
        key: 'breachesOverdue',
        value: o.breaches_overdue,
        tone: fail(o.breaches_overdue),
        link: ['/privacy', 'breaches'],
        query: { overdue: '1' },
      },
      { key: 'dpiasOpen', value: o.dpias_open, tone: 'info', link: ['/privacy', 'dpias'] },
      {
        key: 'dpiasRequiredUndecided',
        value: o.dpias_required_undecided,
        tone: warn(o.dpias_required_undecided),
        link: ['/privacy', 'dpias'],
      },
      {
        key: 'processorsWithoutDpa',
        value: o.processors_without_dpa,
        tone: warn(o.processors_without_dpa),
        link: ['/privacy', 'processors'],
      },
      {
        key: 'transfersMissingTia',
        value: o.transfers_missing_tia,
        tone: warn(o.transfers_missing_tia),
        link: ['/privacy', 'transfers'],
      },
      {
        key: 'reviewsOverdue',
        value: o.reviews_overdue,
        tone: fail(o.reviews_overdue),
        link: ['/privacy', 'ropa'],
        query: { overdue: '1' },
      },
    ];
    if (o.dsr_open !== null) {
      tiles.splice(3, 0, {
        key: 'dsrOpen',
        value: o.dsr_open,
        tone: 'info',
        link: ['/privacy', 'data-subject-requests'],
      });
    }
    if (o.dsr_overdue !== null) {
      tiles.splice(4, 0, {
        key: 'dsrOverdue',
        value: o.dsr_overdue,
        tone: fail(o.dsr_overdue),
        link: ['/privacy', 'data-subject-requests'],
        query: { overdue: '1' },
      });
    }
    return tiles;
  });

  private requestsSub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.requestsSub.unsubscribe());
    providePageContext(() => ({
      module: 'privacy',
      view: 'dashboard',
      title: this.language.translate('privacy.overview.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const requests = this.canRequests();
      untracked(() => this.load(orgId, requests));
    });
  }

  protected clock(b: DataBreach) {
    return clockFact(b);
  }

  protected clockTone(b: DataBreach) {
    const tone = clockFact(b).tone;
    return tone === 'plain' ? 'neutral' : tone;
  }

  private load(orgId: string | null, requests: boolean): void {
    this.requestsSub.unsubscribe();
    this.requestsSub = new Subscription();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.requestsSub.add(
      this.api.overview(orgId).subscribe({
        next: (o) => {
          this.overview.set(o);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      }),
    );
    this.requestsSub.add(
      this.api
        .list<DataBreach>(orgId, REGISTERS.breach, {
          status: ['open', 'assessing'],
          sort: 'due',
          limit: 5,
        })
        .subscribe({ next: (p) => this.breaches.set(p.items), error: () => this.breaches.set([]) }),
    );
    if (requests) {
      this.requestsSub.add(
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
