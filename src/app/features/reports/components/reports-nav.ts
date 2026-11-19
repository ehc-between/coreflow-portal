import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ModuleNav, ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';
import { REPORTS_PERMISSIONS } from '../data/reports.models';

interface Section extends ModuleNavItem {
  readonly permission?: string;
}

/** The sub-pages of Reports, in nav order (the designer needs its own permission). */
export const REPORTS_SECTIONS: readonly Section[] = [
  {
    labelKey: 'reports.nav.overview',
    link: '/reports',
    exact: true,
    testId: 'reports-nav-overview',
  },
  { labelKey: 'reports.nav.calendar', link: '/reports/calendar', testId: 'reports-nav-calendar' },
  {
    // U11: register exports, saved reports and audit packs live in the library now.
    labelKey: 'reports.nav.library',
    link: '/library',
    testId: 'reports-nav-library',
  },
  {
    labelKey: 'reports.nav.dashboards',
    link: '/reports/dashboards',
    testId: 'reports-nav-dashboards',
    permission: REPORTS_PERMISSIONS.manage,
  },
];

/**
 * The Reports sub-navigation (`app-module-nav`, scrollable with fade hints on
 * phones), directly under each page header. Sections the caller may not open are
 * left out.
 */
@Component({
  selector: 'app-reports-nav',
  imports: [ModuleNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<app-module-nav [items]="items()" labelKey="modules.names.reports" />`,
})
export class ReportsNav {
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly items = computed<readonly ModuleNavItem[]>(() => {
    const granted = this.selectedOrg.currentOrg()?.permissions ?? [];
    return REPORTS_SECTIONS.filter((s) => !s.permission || granted.includes(s.permission));
  });
}
