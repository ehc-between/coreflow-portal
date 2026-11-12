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
import { AskPanelService } from '../ask/ask-panel.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
import { TeachMe } from '../../shared/guidance/teach-me';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { ContinuityApi } from './data/continuity-api';
import { ATTENTION_GROUPS, Overview } from './data/continuity.models';
import { ContinuityNav } from './shared/continuity-nav';

/**
 * The continuity overview (`/continuity`): headline figures for BIAs, plans,
 * exercises, ICT readiness and crisis contacts, and the lists that need attention
 * (BIAs without a plan, plans overdue for review or never exercised, overdue
 * exercises, ICT services with a readiness gap).
 */
@Component({
  selector: 'app-continuity-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Button,
    Card,
    ContinuityNav,
    GuideIntro,
    Icon,
    KpiTile,
    LessonView,
    TeachMe,
    TourButton,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-7 pb-12 sm:px-8">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'continuity.overview.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">
            {{ 'continuity.overview.subtitle' | transloco }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-tour-button scope="continuity" tour="overview" />
          <app-button variant="ghost" size="sm" (click)="askReadiness()">
            <app-icon name="spark" [size]="14" />
            {{ 'continuity.ai.readiness' | transloco }}
          </app-button>
        </div>
      </div>
      <app-continuity-nav />

      <div class="mt-5 flex flex-col gap-3">
        <app-guide-intro scope="continuity" page="overview" />
        <div class="flex flex-wrap items-center gap-3">
          <app-lesson scope="continuity" lesson="continuity-basics" />
          <app-teach-me
            topic="continuity.overview"
            [subject]="'continuity.overview.title' | transloco"
          />
        </div>
      </div>

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted">
            {{ 'continuity.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="py-10 text-center text-[14px] text-fail" role="alert">
            {{ 'continuity.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (overview(); as o) {
            <div
              class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
              appTourStep="continuity-figures"
              data-testid="overview-tiles"
            >
              <a routerLink="/continuity/bias" class="block rounded-tile">
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
              <a routerLink="/continuity/plans" class="block rounded-tile">
                <app-kpi-tile
                  [label]="'continuity.overview.tiles.plans' | transloco"
                  [value]="o.plans.total"
                  [delta]="
                    'continuity.overview.tiles.plansDelta'
                      | transloco: { approved: o.plans.approved, overdue: o.plans.review_overdue }
                  "
                  [tone]="o.plans.review_overdue ? 'fail' : 'neutral'"
                />
              </a>
              <a routerLink="/continuity/exercises" class="block rounded-tile">
                <app-kpi-tile
                  [label]="'continuity.overview.tiles.exercises' | transloco"
                  [value]="o.exercises.planned"
                  [delta]="
                    'continuity.overview.tiles.exercisesDelta'
                      | transloco: { overdue: o.exercises.overdue }
                  "
                  [tone]="o.exercises.overdue ? 'fail' : 'info'"
                />
              </a>
              <a routerLink="/continuity/ict-systems" class="block rounded-tile">
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
              <a routerLink="/continuity/contacts" class="block rounded-tile">
                <app-kpi-tile
                  [label]="'continuity.overview.tiles.contacts' | transloco"
                  [value]="o.contacts.total"
                  [delta]="
                    'continuity.overview.tiles.contactsDelta'
                      | transloco: { count: o.contacts.needs_verification }
                  "
                  [tone]="o.contacts.needs_verification ? 'warn' : 'neutral'"
                />
              </a>
            </div>

            @if (o.exercises.next; as next) {
              <app-card class="mt-4 block">
                <p class="text-[13.5px] text-fg">
                  <span class="font-semibold">{{
                    'continuity.overview.nextExercise' | transloco
                  }}</span>
                  <a [routerLink]="next.url" class="ml-2 text-accent hover:underline">
                    {{ next.code }} {{ next.title }}
                  </a>
                  @if (next.scheduled_on) {
                    <span class="ml-2 text-fg-muted">{{ next.scheduled_on | localDay }}</span>
                  }
                </p>
              </app-card>
            }

            <section class="mt-6" appTourStep="continuity-attention">
              <h2 class="mb-3 font-display text-[17px] font-bold text-fg">
                {{ 'continuity.overview.attention' | transloco }}
              </h2>
              @if (attentionCount() === 0) {
                <app-card>
                  <p class="text-[13.5px] text-fg-muted">
                    {{ 'continuity.overview.allClear' | transloco }}
                  </p>
                </app-card>
              } @else {
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  @for (group of groups; track group) {
                    @if (o.attention[group].length) {
                      <app-card>
                        <h3 class="mb-2 text-[13.5px] font-semibold text-fg">
                          {{ 'continuity.overview.groups.' + group | transloco }}
                        </h3>
                        <ul class="flex flex-col gap-1.5">
                          @for (item of o.attention[group]; track item.url) {
                            <li class="text-[13px]">
                              <a [routerLink]="item.url" class="text-fg hover:underline">
                                <span class="font-mono text-[12px] text-fg-muted">{{
                                  item.code
                                }}</span>
                                {{ item.title }}
                              </a>
                            </li>
                          }
                        </ul>
                      </app-card>
                    }
                  }
                </div>
              }
            </section>
          }
        }
      }

      <div class="mt-6">
        <app-why-it-matters scope="continuity" page="overview" />
      </div>
    </div>
  `,
})
export class ContinuityOverview {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);

  protected readonly groups = ATTENTION_GROUPS;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly overview = signal<Overview | null>(null);
  protected readonly attentionCount = computed(() => {
    const o = this.overview();
    return o ? ATTENTION_GROUPS.reduce((n, g) => n + o.attention[g].length, 0) : 0;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'continuity',
      view: 'dashboard',
      title: this.language.translate('continuity.overview.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  protected askReadiness(): void {
    this.ask.showWith(this.language.translate('continuity.ai.prompts.readiness'));
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
