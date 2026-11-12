import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { PERM_MANAGE } from './data/environment.models';

interface EnvTab {
  readonly path: string;
  readonly key: string;
  readonly exact: boolean;
}

const TABS: readonly EnvTab[] = [
  { path: '/environment', key: 'overview', exact: true },
  { path: '/environment/aspects', key: 'aspects', exact: false },
  { path: '/environment/emergency-plans', key: 'plans', exact: false },
  { path: '/environment/metrics', key: 'metrics', exact: false },
  { path: '/environment/emissions', key: 'emissions', exact: false },
];

/** The environment module's section navigation (overview, registers, emissions, scoring). */
@Component({
  selector: 'app-environment-tabs',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="mx-auto max-w-[1180px] px-4 pt-4 sm:px-8"
      [attr.aria-label]="'environment.tabs.label' | transloco"
    >
      <ul class="flex gap-1 overflow-x-auto border-b border-border">
        @for (tab of tabs(); track tab.path) {
          <li>
            <a
              [routerLink]="tab.path"
              routerLinkActive="border-accent text-fg"
              [routerLinkActiveOptions]="{ exact: tab.exact }"
              ariaCurrentWhenActive="page"
              class="-mb-px inline-block border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
              [attr.data-testid]="'env-tab-' + tab.key"
            >
              {{ 'environment.tabs.' + tab.key | transloco }}
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class EnvironmentTabs {
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly tabs = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_MANAGE)
      ? [...TABS, { path: '/environment/scoring', key: 'scoring', exact: false }]
      : TABS,
  );
}
