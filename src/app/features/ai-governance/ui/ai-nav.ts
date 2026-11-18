import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ModuleNav, ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';

/** The module's sub-pages (docs/ux-guide.md: `app-module-nav` directly under the header). */
export const AI_GOV_NAV_ITEMS: readonly ModuleNavItem[] = [
  {
    labelKey: 'aiGovernance.nav.overview',
    link: '/ai-governance',
    exact: true,
    testId: 'ai-nav-overview',
  },
  {
    labelKey: 'aiGovernance.nav.systems',
    link: '/ai-governance/systems',
    testId: 'ai-nav-systems',
  },
  {
    labelKey: 'aiGovernance.nav.assessments',
    link: '/ai-governance/assessments',
    testId: 'ai-nav-assessments',
  },
  {
    labelKey: 'aiGovernance.nav.literacy',
    link: '/ai-governance/literacy',
    testId: 'ai-nav-literacy',
  },
];

/** Sub-navigation of AI governance: overview, systems, assessments, literacy (settings: the gear, U10). */
@Component({
  selector: 'app-ai-nav',
  imports: [ModuleNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<app-module-nav labelKey="modules.names.ai_governance" [items]="items" />`,
})
export class AiNav {
  protected readonly items = AI_GOV_NAV_ITEMS;
}
