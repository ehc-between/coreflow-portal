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
import { catchError, map, of } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { OrgMembersApi } from '../../../core/org/org-members-api';
import {
  OrgRole,
  RoleMatrix,
  RoleMatrixModule,
  RoleMatrixRole,
} from '../../../core/org/org.models';
import { ROLE_KEYS, roleDescription, roleLabel } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Switch } from '../../../shared/ui/switch/switch';
import { saveBlob } from '../download';
import { SettingsPeopleNav } from '../settings-nav/settings-nav';

/** Permission prefixes that belong to the platform rather than a module. */
export const PLATFORM_PREFIXES = [
  'org',
  'users',
  'audit',
  'dashboard',
  'records',
  'learning',
  'tasks',
];

/**
 * Build a matrix from the plain role catalogue (`GET roles`), for backends that
 * do not serve `roles/matrix` yet: modules come from the permission prefixes,
 * with the platform prefixes grouped first.
 */
export function matrixFromRoles(roles: readonly OrgRole[]): RoleMatrix {
  const byModule = new Map<string, Set<string>>();
  for (const role of roles) {
    for (const permission of role.permissions) {
      const [prefix] = permission.split(':');
      const module = PLATFORM_PREFIXES.includes(prefix) ? 'platform' : prefix;
      const set = byModule.get(module) ?? new Set<string>();
      set.add(permission);
      byModule.set(module, set);
    }
  }
  const modules: RoleMatrixModule[] = [...byModule.entries()]
    .sort(([a], [b]) => (a === 'platform' ? -1 : b === 'platform' ? 1 : a.localeCompare(b)))
    .map(([key, permissions]) => ({
      key,
      name_key: `modules.names.${key}`,
      enabled: true,
      permissions: [...permissions].sort().map((p) => ({
        key: p,
        action: p.split(':')[1] ?? p,
        description: '',
      })),
    }));
  return { roles: roles.map((role) => ({ ...role, member_count: -1 })), modules };
}

/** The actions of `module` a role holds (in the module's permission order). */
export function cellActions(
  role: Pick<OrgRole, 'permissions'>,
  module: RoleMatrixModule,
): string[] {
  const held = new Set(role.permissions);
  return module.permissions.filter((p) => held.has(p.key)).map((p) => p.action);
}

/** CSV (semicolon-separated, for Norwegian spreadsheets) of the visible matrix. */
export function matrixCsv(
  roles: readonly RoleMatrixRole[],
  modules: readonly RoleMatrixModule[],
  label: { role: (key: string) => string; module: (m: RoleMatrixModule) => string; header: string },
): string {
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [[label.header, ...roles.map((r) => label.role(r.key))].map(quote).join(';')];
  for (const module of modules) {
    for (const permission of module.permissions) {
      rows.push(
        [
          `${label.module(module)} · ${permission.action}`,
          ...roles.map((r) => (r.permissions.includes(permission.key) ? 'x' : '')),
        ]
          .map(quote)
          .join(';'),
      );
    }
  }
  return rows.join('\r\n');
}

/**
 * `/settings/roles` (users:invite, org:manage or audit:read): what each access
 * level may do, module by module (ISO 27001 A.5.15 / A.8.2). Read-only, with a
 * CSV export for auditors. Shows the seeded roles and roles in use by default.
 */
@Component({
  selector: 'app-roles-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    Card,
    ErrorState,
    Icon,
    LoadingState,
    PageHeader,
    HelpStrip,
    Switch,
    SettingsPeopleNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1280px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="settings.members.pageTitle"
        descriptionKey="settings.roles.description"
        [breadcrumbs]="[
          { labelKey: 'settings.hub.title', link: '/settings' },
          { labelKey: 'settings.roles.title' },
        ]"
      >
        <app-button secondary variant="secondary" [disabled]="!matrix()" (click)="exportCsv()">
          <app-icon name="download" [size]="15" />
          {{ 'settings.roles.export' | transloco }}
        </app-button>
      </app-page-header>
      <app-settings-people-nav />
      <div class="mb-4">
        <app-help-strip scope="platform" page="settings-roles" lesson="people-and-access" />
      </div>

      <p class="mb-4 max-w-3xl text-ui text-fg-muted">
        {{ 'settings.roles.intro' | transloco }}
        <a
          routerLink="/context/responsibilities"
          class="font-semibold text-accent hover:underline"
          >{{ 'settings.members.responsibilitiesLink' | transloco }}</a
        >
      </p>

      @if (loading()) {
        <app-loading-state [rows]="8" />
      } @else if (loadError()) {
        <app-error-state (retry)="reload()" />
      } @else if (matrix()) {
        <div class="mb-3 flex flex-wrap items-center gap-4">
          <app-switch [checked]="showAll()" (checkedChange)="showAll.set($event)">
            {{ 'settings.roles.showAllRoles' | transloco: { count: allRoleCount() } }}
          </app-switch>
          <app-switch [checked]="showDisabled()" (checkedChange)="showDisabled.set($event)">
            {{ 'settings.roles.showDisabledModules' | transloco }}
          </app-switch>
        </div>

        <app-card [padded]="false">
          <div class="overflow-x-auto">
            <table
              class="w-full min-w-[720px] border-collapse text-left text-ui"
              data-testid="role-matrix"
            >
              <caption class="sr-only">
                {{
                  'settings.roles.title' | transloco
                }}
              </caption>
              <thead>
                <tr class="border-b border-border align-bottom">
                  <th
                    scope="col"
                    class="sticky left-0 z-10 bg-surface px-4 py-3 text-meta font-semibold text-fg-subtle"
                  >
                    {{ 'settings.roles.module' | transloco }}
                  </th>
                  @for (role of visibleRoles(); track role.key) {
                    <th
                      scope="col"
                      class="min-w-32 px-3 py-3 align-bottom"
                      [attr.title]="describe(role.key) || null"
                    >
                      <span class="block font-semibold text-fg">{{ roleName(role.key) }}</span>
                      @if (role.member_count >= 0) {
                        <a
                          routerLink="/settings/members"
                          class="text-meta font-normal text-fg-muted hover:text-fg hover:underline"
                          >{{
                            (role.member_count === 1
                              ? 'settings.roles.memberCountOne'
                              : 'settings.roles.memberCount'
                            ) | transloco: { count: role.member_count }
                          }}</a
                        >
                      }
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (module of visibleModules(); track module.key) {
                  <tr class="border-b border-border last:border-b-0 align-top">
                    <th
                      scope="row"
                      class="sticky left-0 z-10 bg-surface px-4 py-2.5 font-semibold text-fg"
                    >
                      {{ moduleName(module) }}
                      @if (!module.enabled) {
                        <span class="block text-meta font-normal text-fg-subtle">{{
                          'settings.roles.moduleOff' | transloco
                        }}</span>
                      }
                    </th>
                    @for (role of visibleRoles(); track role.key) {
                      <td class="px-3 py-2.5">
                        @if (actions(role, module); as list) {
                          @if (list.length) {
                            <ul class="flex flex-wrap gap-1">
                              @for (action of list; track action) {
                                <li
                                  class="rounded-full bg-accent-soft px-2 py-0.5 text-meta text-accent"
                                >
                                  {{ action }}
                                </li>
                              }
                            </ul>
                          } @else {
                            <span
                              class="text-fg-subtle"
                              [attr.aria-label]="'settings.roles.noAccess' | transloco"
                              >—</span
                            >
                          }
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </app-card>
        <p class="mt-3 text-meta text-fg-subtle">{{ 'settings.roles.legend' | transloco }}</p>
      }
    </div>
  `,
})
export class RolesPage {
  private readonly api = inject(OrgMembersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly matrix = signal<RoleMatrix | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly showAll = signal(false);
  protected readonly showDisabled = signal(false);

  protected readonly allRoleCount = computed(() => this.matrix()?.roles.length ?? 0);
  protected readonly visibleRoles = computed(() => {
    const roles = this.matrix()?.roles ?? [];
    if (this.showAll()) return roles;
    const seeded = ROLE_KEYS as readonly string[];
    return [
      ...seeded.map((key) => roles.find((r) => r.key === key)).filter((r) => !!r),
      ...roles.filter((r) => !seeded.includes(r.key) && r.member_count > 0),
    ] as RoleMatrixRole[];
  });
  protected readonly visibleModules = computed(() =>
    (this.matrix()?.modules ?? []).filter((m) => this.showDisabled() || m.enabled),
  );

  constructor() {
    providePageContext(() => ({
      module: null,
      entityType: 'role',
      view: 'settings',
      title: this.language.translate('settings.roles.title'),
    }));
    effect(() => {
      const orgId = this.orgId();
      this.matrix.set(null);
      if (orgId) this.load(orgId);
    });
  }

  protected reload(): void {
    const orgId = this.orgId();
    if (orgId) this.load(orgId);
  }

  protected roleName(key: string): string {
    return roleLabel((k) => this.language.translate(k), key, this.matrix()?.roles ?? []);
  }

  protected describe(key: string): string {
    return roleDescription((k) => this.language.translate(k), key);
  }

  protected moduleName(module: RoleMatrixModule): string {
    const label = this.language.translate(module.name_key);
    return label === module.name_key ? module.key : label;
  }

  protected actionName(action: string): string {
    const key = `settings.roles.actions.${action}`;
    const label = this.language.translate(key);
    return label === key ? action : label;
  }

  /**
   * Readable permissions of `module` a role holds. The platform row mixes several
   * areas (organisation, users, audit log, …), so its labels name the area too.
   */
  protected actions(role: RoleMatrixRole, module: RoleMatrixModule): string[] {
    const held = new Set(role.permissions);
    return module.permissions
      .filter((p) => held.has(p.key))
      .map((p) => {
        const action = this.actionName(p.action);
        if (module.key !== 'platform') return action;
        const areaKey = `settings.roles.areas.${p.key.split(':')[0]}`;
        const area = this.language.translate(areaKey);
        return area === areaKey ? action : `${area}: ${action.toLocaleLowerCase()}`;
      });
  }

  protected exportCsv(): void {
    const csv = matrixCsv(this.visibleRoles(), this.visibleModules(), {
      role: (key) => this.roleName(key),
      module: (m) => this.moduleName(m),
      header: this.language.translate('settings.roles.module'),
    });
    saveBlob(
      new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }),
      'roles-matrix.csv',
    );
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.api
      .roleMatrix(orgId)
      .pipe(
        // Older backends: build the matrix from the role catalogue.
        catchError(() => this.api.listRoles(orgId).pipe(map((roles) => matrixFromRoles(roles)))),
        catchError(() => of(null)),
      )
      .subscribe((matrix) => {
        if (this.orgId() !== orgId) return;
        this.loading.set(false);
        this.matrix.set(matrix);
        this.loadError.set(matrix === null);
      });
  }
}
