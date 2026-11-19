import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { ModuleNav, ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';

export const AUDIT_SECTIONS = [
  { key: 'overview', path: '/audits', exact: true },
  { key: 'plans', path: '/audits/plans', exact: false },
  // U37: daily work first; programmes and auditors are planning, under "Mer".
  { key: 'findings', path: '/audits/findings', exact: false },
  { key: 'certifications', path: '/audits/certifications', exact: false },
  { key: 'programmes', path: '/audits/programmes', exact: false },
  { key: 'auditors', path: '/audits/auditors', exact: false },
] as const;

export const AUDIT_NAV_ITEMS: readonly ModuleNavItem[] = AUDIT_SECTIONS.map((s) => ({
  labelKey: `audits.nav.${s.key}`,
  link: s.path,
  exact: s.exact,
  testId: `audits-nav-${s.key}`,
}));

/**
 * Sub-navigation of the audit module (overview, audits, programmes, findings,
 * certifications, auditors) on the shared `app-module-nav`, so the active tab is
 * underlined like everywhere else.
 */
@Component({
  selector: 'app-audits-nav',
  imports: [ModuleNav, TourStepDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<div [appTourStep]="'audits-nav'">
    <app-module-nav labelKey="audits.nav.label" [items]="items" />
  </div>`,
})
export class AuditsNav {
  protected readonly items = AUDIT_NAV_ITEMS;
}
