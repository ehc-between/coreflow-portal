import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { hasAnyPermission } from '../../../core/auth/permission';
import { LanguageService } from '../../../core/i18n/language.service';
import { OrgApi } from '../../../core/org/org-api';
import { DepartmentSummary } from '../../../core/org/org.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Card } from '../../../shared/ui/card/card';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { countKey, departmentsWithoutLead } from '../departments/departments-page';
import { OrgNavSettings } from '../nav-settings/org-nav-settings';
import { HomeWorkspaceSettings } from '../../dashboard/settings/home-workspace-settings';
import { SettingsLinks } from '../settings-links/settings-links';

/**
 * `/settings`: the settings hub. One card per settings page, grouped into
 * Organisation, People and access, Notifications and workflows, Learning and
 * Traceability, then the per-module settings. Above the cards it points out
 * setup gaps worth fixing (departments without a lead, so escalations reach
 * nobody). Members, departments, invitations and roles have their own pages.
 */
@Component({
  selector: 'app-org-settings',
  imports: [
    RouterLink,
    TranslocoPipe,
    Card,
    HelpStrip,
    Icon,
    PageHeader,
    SettingsLinks,
    OrgNavSettings,
    HomeWorkspaceSettings,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './org-settings.html',
})
export class OrgSettings {
  private readonly orgApi = inject(OrgApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  /** The active org id; the page is scoped to and reloads on changes to it. */
  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly countKey = countKey;

  private readonly granted = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canManage = computed(() => hasAnyPermission(this.granted(), 'org:manage'));

  protected readonly departments = signal<readonly DepartmentSummary[]>([]);
  protected readonly withoutLead = computed(() => departmentsWithoutLead(this.departments()));
  protected readonly withoutLeadNames = computed(() =>
    this.withoutLead()
      .map((d) => d.name)
      .join(', '),
  );

  constructor() {
    providePageContext(() => ({
      module: null,
      view: 'settings',
      title: this.language.translate('settings.hub.title'),
    }));

    effect(() => {
      const orgId = this.orgId();
      const canManage = this.canManage();
      this.departments.set([]);
      // Departments need org:manage — don't request them (403) for other users.
      if (orgId && canManage) {
        this.orgApi.listDepartments(orgId).subscribe({
          next: (departments) => {
            if (this.orgId() === orgId) this.departments.set(departments);
          },
          error: () => undefined,
        });
      }
    });
  }
}
