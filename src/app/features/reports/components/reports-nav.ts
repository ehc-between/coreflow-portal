import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ModuleNav, ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';
import { REPORTS_PERMISSIONS } from '../data/reports.models';

interface Section extends ModuleNavItem {
  readonly permission?: string;
}

/** The sub-pages of Reports, in nav order (the last two need their own permission). */
export const REPORTS_SECTIONS: readonly Section[] = [
  {
    labelKey: 'reports.nav.overview',
    link: '/reports',
    exact: true,
    testId: 'reports-nav-overview',
  },
  { labelKey: 'reports.nav.calendar', link: '/reports/calendar', testId: 'reports-nav-calendar' },
  {
    labelKey: 'reports.nav.registers',
    link: '/reports/registers',
    testId: 'reports-nav-registers',
  },
  {
    labelKey: 'reports.nav.definitions',
    link: '/reports/definitions',
    testId: 'reports-nav-definitions',
  },
  {
    labelKey: 'reports.nav.auditPacks',
    link: '/reports/audit-packs',
    testId: 'reports-nav-audit-packs',
    permission: REPORTS_PERMISSIONS.auditPack,
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
