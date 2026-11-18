import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ModuleNav, ModuleNavItem } from '../ui/module-nav/module-nav';

interface Section extends ModuleNavItem {
  readonly permission?: string;
  readonly module?: string;
}

/**
 * The tabs of "Dokumenter og rapporter" (simplify plan 3.1): Hent ut (every output,
 * by audience), Arkiv (the generated files), Lagrede rapporter (saved register
 * reports) and Revisjonspakker. Styrende dokumenter is the document register
 * (`/documents`), linked from the library header. Tabs the caller cannot open are
 * left out.
 */
export const LIBRARY_SECTIONS: readonly Section[] = [
  { labelKey: 'outputs.nav.outputs', link: '/library', exact: true, testId: 'library-nav-outputs' },
  { labelKey: 'outputs.nav.saved', link: '/library/saved', testId: 'library-nav-saved' },
  {
    labelKey: 'outputs.nav.reports',
    link: '/library/reports',
    testId: 'library-nav-reports',
    permission: 'reports:read',
    module: 'reports',
  },
  {
    labelKey: 'outputs.nav.auditPacks',
    link: '/library/audit-packs',
    testId: 'library-nav-audit-packs',
    permission: 'reports:audit_pack',
    module: 'reports',
  },
];

/** The library tab row, directly under each library page header. */
@Component({
  selector: 'app-library-nav',
  imports: [ModuleNav],
  viewProviders: [provideSharedScope('outputs')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<app-module-nav [items]="items()" labelKey="outputs.title" />`,
})
export class LibraryNav {
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);

  protected readonly items = computed<readonly ModuleNavItem[]>(() => {
    const granted = this.selectedOrg.currentOrg()?.permissions ?? [];
    const enabled = this.modules.enabledKeys();
    return LIBRARY_SECTIONS.filter(
      (s) =>
        (!s.permission || granted.includes(s.permission)) && (!s.module || enabled.has(s.module)),
    ).map(({ labelKey, link, exact, testId }) => ({ labelKey, link, exact, testId }));
  });
}
