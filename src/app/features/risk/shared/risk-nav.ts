import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { ModuleNav, ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';

/** The module's sub-pages (docs/ux-guide.md: `app-module-nav` directly under the header). */
export const RISK_NAV_ITEMS: readonly ModuleNavItem[] = [
  { labelKey: 'risk.nav.overview', link: '/risk', exact: true, testId: 'risk-nav-overview' },
  { labelKey: 'risk.nav.risks', link: '/risk/risks', testId: 'risk-nav-risks' },
  {
    labelKey: 'risk.nav.opportunities',
    link: '/risk/opportunities',
    testId: 'risk-nav-opportunities',
  },
  // U17: the treatment plan is a work tab; the SoA moved to the standard page.
  { labelKey: 'risk.nav.treatments', link: '/risk/treatments', testId: 'risk-nav-treatments' },
];

/**
 * Sub-navigation of the risk module: overview, risks, opportunities, treatments. Registers and
 * matrices are configuration (U10), behind the gear at /settings/modules/risk.
 */
@Component({
  selector: 'app-risk-nav',
  imports: [ModuleNav, TourStepDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<div [appTourStep]="'risk-nav'">
    <app-module-nav labelKey="modules.names.risk" [items]="items" />
  </div>`,
})
export class RiskNav {
  protected readonly items = RISK_NAV_ITEMS;
}
