import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { topicTiles } from './company-tiles';
import { HubLoader } from './hub-kit/hub-loader';
import { provideHubsScope } from './hub-kit/hub-scope';
import { PAGE } from './hub-kit/hub-styles';
import { HubTiles } from './hub-kit/hub-tiles';

/**
 * Bedriften › Fagområder (`/company/topics`, docs/ia-v2.md §5.4 / decision D3): the
 * management areas without a top-level slot (privacy registers, IT and equipment,
 * AI systems, environment, continuity), each with its count and a status line.
 */
@Component({
  selector: 'app-company-topics-page',
  imports: [EmptyState, ErrorState, HubTiles, LoadingState, PageHeader],
  viewProviders: [provideHubsScope()],
  providers: [HubLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page">
      <app-page-header
        titleKey="hubs.topics.title"
        descriptionKey="hubs.topics.intro"
        [breadcrumbs]="[
          { labelKey: 'hubs.topics.crumb', link: '/company' },
          { labelKey: 'hubs.topics.title' },
        ]"
      />
      @switch (hub.state()) {
        @case ('loading') {
          <app-loading-state [rows]="3" />
        }
        @case ('error') {
          <app-error-state (retry)="hub.reload()" />
        }
        @default {
          @if (tiles().length) {
            <app-hub-tiles [tiles]="tiles()" />
          } @else {
            <app-empty-state icon="grid" titleKey="hubs.topics.empty" />
          }
        }
      }
    </div>
  `,
})
export class CompanyTopicsPage {
  protected readonly hub = inject(HubLoader);
  protected readonly page = PAGE;
  protected readonly tiles = computed(() => topicTiles(this.hub.counts(), this.hub.actions()));
}
