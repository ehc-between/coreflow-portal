import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Icon } from '../../shared/ui/icon/icon';
import { REPORTS_PERMISSIONS } from './data/reports.models';

interface Section {
  readonly path: string;
  readonly labelKey: string;
  readonly icon: string;
  readonly exact: boolean;
  readonly permission?: string;
}

const SECTIONS: readonly Section[] = [
  { path: '/reports', labelKey: 'reports.nav.overview', icon: 'reports', exact: true },
  { path: '/reports/calendar', labelKey: 'reports.nav.calendar', icon: 'calendar', exact: false },
  {
    path: '/reports/registers',
    labelKey: 'reports.nav.registers',
    icon: 'documents',
    exact: false,
  },
  {
    path: '/reports/definitions',
    labelKey: 'reports.nav.definitions',
    icon: 'history',
    exact: false,
  },
  {
    path: '/reports/audit-packs',
    labelKey: 'reports.nav.auditPacks',
    icon: 'audit',
    exact: false,
    permission: REPORTS_PERMISSIONS.auditPack,
  },
  {
    path: '/reports/dashboards',
    labelKey: 'reports.nav.dashboards',
    icon: 'sliders',
    exact: false,
    permission: REPORTS_PERMISSIONS.manage,
  },
];

/**
 * Frame of the reports area: a section bar (overview, calendar, registers, saved
 * reports, audit packs, role dashboards — the last two only with their
 * permission) above the routed page.
 */
@Component({
  selector: 'app-reports-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="mx-auto max-w-[1180px] px-4 pt-5 sm:px-8"
      [attr.aria-label]="'reports.nav.label' | transloco"
    >
      <ul class="flex gap-1 overflow-x-auto border-b border-border">
        @for (section of sections(); track section.path) {
          <li class="flex-none">
            <a
              [routerLink]="section.path"
              routerLinkActive="border-accent text-fg"
              [routerLinkActiveOptions]="{ exact: section.exact }"
              ariaCurrentWhenActive="page"
              class="-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
              [attr.data-testid]="'reports-nav-' + section.icon"
            >
              <app-icon [name]="section.icon" [size]="15" />
              {{ section.labelKey | transloco }}
            </a>
          </li>
        }
      </ul>
    </nav>
    <router-outlet />
  `,
})
export class ReportsShell {
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly sections = computed(() => {
    const granted = this.selectedOrg.currentOrg()?.permissions ?? [];
    return SECTIONS.filter((s) => !s.permission || granted.includes(s.permission));
  });
}
