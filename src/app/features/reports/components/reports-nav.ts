import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { ModuleService } from '../../../core/modules/module.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ModuleNav, ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';
import { REPORTS_MODULE, REPORTS_PERMISSIONS } from '../data/reports.models';

interface Section extends ModuleNavItem {
  readonly permission?: string;
  /** Needs the Reports module (the pages below the Rapporter hub are module pages). */
  readonly module?: boolean;
}

/**
 * The sub-pages of Rapporter (IA v2 §5.9), in nav order. The hub itself is open to
 * every member; the rest are Reports module pages. The compliance calendar moved to
 * Årshjul, the role overview designer is reached from "Status og nøkkeltall".
 */
export const REPORTS_SECTIONS: readonly Section[] = [
  { labelKey: 'reports.nav.hub', link: '/reports', exact: true, testId: 'reports-nav-hub' },
  {
    labelKey: 'reports.nav.status',
    link: '/reports/status',
    testId: 'reports-nav-status',
    permission: REPORTS_PERMISSIONS.read,
    module: true,
  },
  {
    labelKey: 'reports.nav.custom',
    link: '/reports/custom',
    testId: 'reports-nav-custom',
    permission: REPORTS_PERMISSIONS.read,
    module: true,
  },
  {
    labelKey: 'reports.nav.auditPacks',
    link: '/reports/audit-packs',
    testId: 'reports-nav-audit-packs',
    permission: REPORTS_PERMISSIONS.auditPack,
    module: true,
  },
  {
    labelKey: 'reports.nav.exports',
    link: '/reports/exports',
    testId: 'reports-nav-exports',
    permission: REPORTS_PERMISSIONS.read,
    module: true,
  },
  {
    labelKey: 'reports.nav.archive',
    link: '/reports/saved',
    testId: 'reports-nav-archive',
    permission: REPORTS_PERMISSIONS.read,
    module: true,
  },
];

/**
 * The Rapporter sub-navigation (`app-module-nav`, scrollable with fade hints on
 * phones), directly under each sub-page header. Sections the caller may not open are
 * left out.
 */
@Component({
  selector: 'app-reports-nav',
  imports: [ModuleNav],
  viewProviders: [provideSharedScope('reports')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<app-module-nav [items]="items()" labelKey="reports.hub.title" />`,
})
export class ReportsNav {
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);

  protected readonly items = computed<readonly ModuleNavItem[]>(() => {
    const granted = this.selectedOrg.currentOrg()?.permissions ?? [];
    const reportsOn = this.modules.isEnabled(REPORTS_MODULE);
    return REPORTS_SECTIONS.filter(
      (s) => (!s.permission || granted.includes(s.permission)) && (!s.module || reportsOn),
    ).map(({ labelKey, link, exact, testId }) => ({ labelKey, link, exact, testId }));
  });
}
