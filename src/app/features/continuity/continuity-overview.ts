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
import { pluralKey } from '../../shared/i18n/plural';
import { EntityChip } from '../../shared/kit/entity-chip';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { KpiBand } from '../../shared/ui/kpi-band/kpi-band';
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { ContinuityApi } from './data/continuity-api';
import {
  ATTENTION_GROUPS,
  AttentionGroup,
  AttentionItem,
  FOUNDATION_GROUPS,
  Overview,
} from './data/continuity.models';
import { CONTINUITY_NAV, ContinuityAskButton } from './shared/continuity-page';

/** Where the overview's "Grunnlag" card sends the user to add the missing piece. */
const FOUNDATION_LINKS = {
  scope: '/context/scopes',
  policies: '/context/policies',
  objectives: '/objectives',
  obligations: '/obligations',
} as const;

/** The list each attention group opens with "Se alle". */
const ATTENTION_LINKS: Readonly<Record<AttentionGroup, string>> = {
  plans_ict_gap: '/continuity/plans',
  ict_gaps: '/continuity/ict-systems',
  uncovered_bias: '/continuity/bias',
  plans_review_overdue: '/continuity/plans',
  plans_not_exercised: '/continuity/plans',
  exercises_overdue: '/continuity/exercises',
};

/**
 * The continuity overview (`/continuity`): headline figures for BIAs, plans,
 * exercises, ICT readiness and crisis contacts; what needs attention, most urgent
 * first (plans whose ICT services cannot meet their targets, ICT gaps, BIAs without
 * a plan, plans overdue for review or never exercised, overdue exercises); and the
 * foundation the work rests on (scope, policy, objectives, legal duties).
 */
@Component({
  selector: 'app-continuity-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Card,
    ContinuityAskButton,
    EntityChip,
    ErrorState,
    HelpStrip,
    KpiBand,
    KpiTile,
    LoadingState,
    ModuleNav,
    PageHeader,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="modules.names.continuity"
        descriptionKey="continuity.overview.subtitle"
      >
        <app-continuity-ask-button
          secondary
          labelKey="continuity.ai.readiness"
          promptKey="continuity.ai.prompts.readiness"
        />
      </app-page-header>
      <app-module-nav
        labelKey="continuity.nav.label"
        [items]="nav"
        appTourStep="continuity-sections"
      />
      <app-help-strip
        scope="continuity"
        page="overview"
        tour="overview"
        lesson="continuity-basics"
      />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="4" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (overview(); as o) {
            <app-kpi-band
              scope="continuity.overview"
              appTourStep="continuity-figures"
              data-testid="overview-tiles"
            >
              <a routerLink="/continuity/bias" [class]="tileLink">
                <app-kpi-tile
                  [label]="'continuity.overview.tiles.bias' | transloco"
                  [value]="o.bia.total"
                  [delta]="
                    'continuity.overview.tiles.biasDelta'
                      | transloco: { approved: o.bia.approved, uncovered: o.bia.uncovered }
                  "
                  [tone]="o.bia.uncovered ? 'warn' : 'neutral'"
                />
              </a>
              <a routerLink="/continuity/plans" [class]="tileLink">
                <app-kpi-tile
                  [label]="'continuity.overview.tiles.plans' | transloco"
                  [value]="o.plans.total"
                  [delta]="
                    'continuity.overview.tiles.plansDelta'
                      | transloco: { approved: o.plans.approved, overdue: o.plans.review_overdue }
                  "
                  [tone]="o.plans.ict_gap || o.plans.review_overdue ? 'warn' : 'neutral'"
                />
              </a>
              <a routerLink="/continuity/exercises" [class]="tileLink">
                <app-kpi-tile
                  [label]="'continuity.overview.tiles.exercises' | transloco"
                  [value]="o.exercises.planned"
                  [delta]="
                    'continuity.overview.tiles.exercisesDelta'
                      | transloco: { overdue: o.exercises.overdue }
                  "
                  [tone]="o.exercises.overdue ? 'warn' : 'info'"
                />
              </a>
              <a routerLink="/continuity/ict-systems" [class]="tileLink">
                <app-kpi-tile
                  [label]="'continuity.overview.tiles.ict' | transloco"
                  [value]="o.ict.total"
                  [delta]="
                    'continuity.overview.tiles.ictDelta'
                      | transloco: { ready: o.ict.ready, gap: o.ict.gap }
                  "
                  [tone]="o.ict.gap ? 'fail' : o.ict.attention ? 'warn' : 'pass'"
                />
              </a>
              <a routerLink="/continuity/contacts" [class]="tileLink">
                <app-kpi-tile
                  [label]="'continuity.overview.tiles.contacts' | transloco"
                  [value]="o.contacts.total"
                  [delta]="contactsDelta()"
                  [tone]="o.contacts.needs_verification ? 'warn' : 'neutral'"
                />
              </a>
            </app-kpi-band>

            @if (o.exercises.next; as next) {
              <p class="mt-4 text-body text-fg">
                <span class="font-semibold">{{
                  'continuity.overview.nextExercise' | transloco
                }}</span>
                <a [routerLink]="next.url" class="ml-2 text-accent hover:underline">
                  <span class="font-mono text-meta">{{ next.code }}</span> {{ next.title }}
                </a>
                @if (next.scheduled_on) {
                  <span class="ml-2 text-fg-muted">{{ next.scheduled_on | localDay }}</span>
                }
              </p>
            }

            <section class="mt-6" appTourStep="continuity-attention">
              <h2 class="mb-3 font-display text-section font-bold text-fg">
                {{ 'continuity.overview.attention' | transloco }}
              </h2>
              @if (attentionCount() === 0) {
                <app-card>
                  <p class="text-body text-fg-muted">
                    {{ 'continuity.overview.allClear' | transloco }}
                  </p>
                </app-card>
              } @else {
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="attention">
                  @for (group of groups; track group) {
                    @if (items(o, group); as list) {
                      @if (list.length) {
                        <app-card>
                          <div class="mb-2 flex items-baseline justify-between gap-2">
                            <h3 class="text-card font-semibold text-fg">
                              {{ 'continuity.overview.groups.' + group | transloco }}
                            </h3>
                            <a
                              [routerLink]="attentionLinks[group]"
                              class="flex-none text-meta font-semibold text-accent hover:underline"
                              >{{ 'continuity.common.seeAll' | transloco }}</a
                            >
                          </div>
                          <p class="mb-2 text-meta text-fg-muted">
                            {{ 'continuity.overview.groupHelp.' + group | transloco }}
                          </p>
                          <ul class="flex flex-col gap-1.5">
                            @for (item of list; track item.url) {
                              <li class="text-ui">
                                <a [routerLink]="item.url" class="text-fg hover:underline">
                                  <span class="font-mono text-meta text-fg-muted">{{
                                    item.code
                                  }}</span>
                                  {{ item.title }}
                                </a>
                                @if (services(item); as names) {
                                  <span class="block text-meta text-fg-subtle">
                                    {{
                                      'continuity.overview.dependsOn'
                                        | transloco: { services: names }
                                    }}
                                  </span>
                                }
                              </li>
                            }
                          </ul>
                        </app-card>
                      }
                    }
                  }
                </div>
              }
            </section>

            <section class="mt-6" data-testid="foundation">
              <h2 class="mb-1 font-display text-section font-bold text-fg">
                {{ 'continuity.overview.foundation.title' | transloco }}
              </h2>
              <p class="mb-3 max-w-[72ch] text-body text-fg-muted">
                {{ 'continuity.overview.foundation.intro' | transloco }}
              </p>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                @for (group of foundationGroups; track group) {
                  <app-card>
                    <h3 class="mb-2 text-card font-semibold text-fg">
                      {{ 'continuity.overview.foundation.' + group | transloco }}
                    </h3>
                    @if (foundation(o, group); as refs) {
                      @if (refs.length) {
                        <ul class="flex flex-col gap-1.5">
                          @for (ref of refs; track ref.entity_id) {
                            <li><app-entity-chip [ref]="ref" [showType]="false" /></li>
                          }
                        </ul>
                      } @else {
                        <p class="text-meta text-fg-muted">
                          {{ 'continuity.overview.foundation.empty.' + group | transloco }}
                        </p>
                        <a
                          [routerLink]="foundationLinks[group]"
                          class="mt-2 inline-flex text-meta font-semibold text-accent hover:underline"
                          >{{ 'continuity.overview.foundation.open.' + group | transloco }}</a
                        >
                      }
                    }
                  </app-card>
                }
              </div>
            </section>
          }
        }
      }

      <div class="mt-8">
        <app-why-it-matters scope="continuity" page="overview" />
      </div>
    </div>
  `,
})
export class ContinuityOverview {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly nav = CONTINUITY_NAV;
  protected readonly groups = ATTENTION_GROUPS;
  protected readonly foundationGroups = FOUNDATION_GROUPS;
  protected readonly foundationLinks = FOUNDATION_LINKS;
  protected readonly attentionLinks = ATTENTION_LINKS;
  /** Tiles in one row share the tallest tile's height. */
  protected readonly tileLink =
    'block h-full rounded-tile [&_app-kpi-tile]:block [&_app-kpi-tile]:h-full [&_app-kpi-tile>div]:h-full';
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly overview = signal<Overview | null>(null);
  protected readonly attentionCount = computed(() => {
    const o = this.overview();
    return o ? ATTENTION_GROUPS.reduce((n, g) => n + this.items(o, g).length, 0) : 0;
  });

  /** "2 in total: 1 shared, 1 in plans" (+ how many must be verified). */
  protected readonly contactsDelta = computed(() => {
    const c = this.overview()?.contacts;
    if (!c) {
      return '';
    }
    const planSpecific = c.plan_specific ?? Math.max(c.total - c.org_wide, 0);
    const split = this.language.translate('continuity.overview.tiles.contactsSplit', {
      shared: c.org_wide,
      plans: planSpecific,
    });
    if (!c.needs_verification) {
      return split;
    }
    const verify = this.language.translate(
      pluralKey('continuity.overview.tiles.contactsVerify', c.needs_verification),
      { count: c.needs_verification },
    );
    return `${split} · ${verify}`;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'continuity',
      view: 'dashboard',
      title: this.language.translate('modules.names.continuity'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  protected items(o: Overview, group: AttentionGroup): readonly AttentionItem[] {
    return o.attention[group] ?? [];
  }

  protected foundation(o: Overview, group: (typeof FOUNDATION_GROUPS)[number]) {
    return o.foundation?.[group] ?? [];
  }

  /** The ICT services named on a "plans with an ICT gap" row ("ICT-0001 ERP, …"). */
  protected services(item: AttentionItem): string {
    const services = item['services'];
    return Array.isArray(services) ? services.filter((s) => typeof s === 'string').join(', ') : '';
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  private load(orgId: string | null): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.overview(orgId).subscribe({
      next: (o) => {
        this.overview.set(o);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
