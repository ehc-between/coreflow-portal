import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';

interface SubnavItem {
  readonly key: string;
  readonly link: string;
  readonly exact: boolean;
}

const ITEMS: readonly SubnavItem[] = [
  { key: 'overview', link: '/risk', exact: true },
  { key: 'risks', link: '/risk/risks', exact: false },
  { key: 'opportunities', link: '/risk/opportunities', exact: false },
  { key: 'soa', link: '/risk/soa', exact: false },
  { key: 'registers', link: '/risk/registers', exact: false },
  { key: 'matrices', link: '/risk/matrices', exact: false },
];

/** Section navigation of the risk module (overview, risks, opportunities, SoA, setup). */
@Component({
  selector: 'app-risk-subnav',
  imports: [TourStepDirective, RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="mx-auto max-w-[1180px] px-4 pt-4 sm:px-8"
      [attr.aria-label]="'risk.nav.label' | transloco"
    >
      <ul class="flex gap-1 overflow-x-auto border-b border-border">
        @for (item of items; track item.key) {
          <li>
            <a
              [routerLink]="item.link"
              routerLinkActive="!border-accent !text-fg"
              [routerLinkActiveOptions]="{ exact: item.exact }"
              ariaCurrentWhenActive="page"
              class="-mb-px block border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
              [appTourStep]="'risk-nav-' + item.key"
            >
              {{ 'risk.nav.' + item.key | transloco }}
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class RiskSubnav {
  protected readonly items = ITEMS;
}
