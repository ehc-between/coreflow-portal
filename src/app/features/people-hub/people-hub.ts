import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { AttentionList } from '../company/hub-kit/attention-list';
import { PEOPLE_MODULES, TileSpec, actionsFor, buildTiles } from '../company/hub-kit/hub-data';
import { HubLoader } from '../company/hub-kit/hub-loader';
import { provideHubsScope } from '../company/hub-kit/hub-scope';
import { BTN_PRIMARY, LINK, PAGE } from '../company/hub-kit/hub-styles';
import { HubTiles } from '../company/hub-kit/hub-tiles';

/** Folk's cards (docs/ia-v2.md §5.5, prototype `folk`), in prototype order. */
export const PEOPLE_TILES: readonly TileSpec[] = [
  { key: 'employees', locations: ['people.employees'], link: '/people/employees' },
  { key: 'training', locations: ['training.courses'], link: '/training' },
  { key: 'competences', locations: ['people.competences'], link: '/people/competences' },
  { key: 'recruitment', locations: ['recruitment.requisitions'], link: '/recruitment' },
  {
    key: 'hse',
    locations: ['hse.sja', 'hse.safety_rounds', 'hse.ppe', 'hse.consultations'],
    link: '/hse',
  },
  { key: 'access', locations: ['assets.access_reviews'], link: '/assets/access-reviews' },
];

/** Most items in "Dette trenger oppmerksomhet". */
const ATTENTION_MAX = 5;

/**
 * Folk (`/people`, docs/ia-v2.md §5.5): everyone who works for the company, what
 * they know and what they must learn. One card per register with its count, then
 * what needs attention in the people, training, recruitment and HSE modules, each
 * with one button. Not module-guarded; the module pages keep their own guards.
 */
@Component({
  selector: 'app-people-hub',
  imports: [
    RouterLink,
    TranslocoPipe,
    AttentionList,
    ErrorState,
    HubTiles,
    LoadingState,
    PageHeader,
  ],
  viewProviders: [provideHubsScope()],
  providers: [HubLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page">
      <app-page-header titleKey="hubs.people.title" descriptionKey="hubs.people.intro">
        @if (hub.enabled('people') && hub.can('people:write')) {
          <a
            primary
            routerLink="/people/employees/new"
            [class]="btnPrimary"
            data-testid="people-new"
          >
            {{ 'hubs.people.newEmployee' | transloco }}
          </a>
        }
      </app-page-header>

      @switch (hub.state()) {
        @case ('loading') {
          <app-loading-state [rows]="4" />
        }
        @case ('error') {
          <app-error-state (retry)="hub.reload()" />
        }
        @default {
          <app-hub-tiles [tiles]="tiles()" />

          <section
            class="mt-[22px] rounded-card border border-border bg-surface p-5"
            data-testid="people-attention"
          >
            <h2 class="mb-3.5 font-display text-section font-semibold text-fg">
              {{ 'hubs.common.attentionTitle' | transloco }}
            </h2>
            <app-attention-list [actions]="attention()" />
          </section>

          <p class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-ui" data-testid="people-links">
            @if (hub.can('org:manage')) {
              <a routerLink="/settings/members" [class]="link">{{
                'hubs.people.links.members' | transloco
              }}</a>
            }
            @if (hub.enabled('people') && hub.can('people:read')) {
              <a routerLink="/people/checklists" [class]="link">{{
                'hubs.people.links.checklists' | transloco
              }}</a>
              <a routerLink="/people/positions" [class]="link">{{
                'hubs.people.links.positions' | transloco
              }}</a>
              <a routerLink="/people/matrix" [class]="link">{{
                'hubs.people.links.matrix' | transloco
              }}</a>
            }
            @if (hub.enabled('ai_governance') && hub.can('ai_governance:read')) {
              <a routerLink="/ai-governance/literacy" [class]="link">{{
                'hubs.people.links.literacy' | transloco
              }}</a>
            }
          </p>
        }
      }
    </div>
  `,
})
export class PeopleHub {
  protected readonly hub = inject(HubLoader);
  protected readonly page = PAGE;
  protected readonly btnPrimary = BTN_PRIMARY;
  protected readonly link = LINK;

  protected readonly tiles = computed(() =>
    buildTiles(PEOPLE_TILES, this.hub.counts(), 'hubs.people.tiles'),
  );
  protected readonly attention = computed(() =>
    actionsFor(this.hub.actions(), PEOPLE_MODULES, ATTENTION_MAX),
  );
}
