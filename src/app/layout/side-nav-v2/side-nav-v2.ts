import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LanguageService } from '../../core/i18n/language.service';
import { ModuleService } from '../../core/modules/module.service';
import { roleLabel } from '../../core/org/roles';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ShellPreferencesService } from '../../core/shell/shell-preferences.service';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Icon } from '../../shared/ui/icon/icon';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { ADMIN_SECTION, MODULE_NAV_ITEMS } from '../nav';
import {
  LIBRARY_MODULES,
  NAV_DESTINATIONS,
  PIN_TARGETS,
  REGISTER_ACTIONS,
  defaultPins,
  hasShellRoute,
  isAllowed,
  navWorkspace,
  registerGroups,
} from '../nav-v2';
import { OrgSwitcher } from '../org-switcher/org-switcher';

/** A rendered nav link. */
interface NavLink {
  readonly key: string;
  readonly path: string;
  readonly labelKey: string;
  readonly icon: string;
  /** Paths (without leading slash) that count as "inside" this link. */
  readonly owns: readonly string[];
}

/**
 * Shell v2 side nav (U03): "Registrer", then at most six fixed destinations named
 * after jobs (Hjem, Mitt arbeid, Standarder, Registre, Dokumenter og rapporter,
 * Innstillinger) and up to five pins. Which destinations show depends on the role
 * (an employee gets Registrer, Hjem, Mitt arbeid and Dokumenter og rapporter) unless
 * the user turned on "Vis alt" in the account menu; permissions and enabled modules
 * always apply. Every module stays reachable through Registre (`/registers`).
 *
 * Lives in the same drawer container as the old nav (main layout), so the mobile
 * drawer, focus trap and Escape behave the same.
 */
@Component({
  selector: 'app-side-nav-v2',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    Icon,
    Avatar,
    OrgSwitcher,
    OverflowMenu,
    MenuItem,
  ],
  viewProviders: [provideSharedScope('shell')],
  host: { class: 'flex min-h-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      [attr.aria-label]="'ui.shell.mainNav' | transloco"
      data-testid="side-nav-v2"
      class="flex w-full flex-none flex-col gap-0.5 overflow-y-auto border-r border-border bg-surface px-3 pt-3.5 pb-3 lg:w-[248px]"
    >
      <app-org-switcher class="mb-2" />

      @if (registerActions().length > 0) {
        <app-overflow-menu
          class="mb-2 w-full"
          variant="primary"
          icon="plus"
          align="start"
          labelKey="shell.registrer.label"
          triggerTestId="nav-registrer"
        >
          <div
            class="px-2.5 pt-1 pb-1.5 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
            aria-hidden="true"
          >
            {{ 'shell.registrer.heading' | transloco }}
          </div>
          @for (action of registerActions(); track action.key) {
            <a
              appMenuItem
              [routerLink]="'/' + action.path"
              [attr.data-testid]="'registrer-' + action.key"
            >
              <span class="flex text-fg-subtle"><app-icon [name]="action.icon" [size]="16" /></span>
              {{ action.labelKey | transloco }}
            </a>
          }
        </app-overflow-menu>
      }

      <ul class="flex flex-col gap-0.5" data-testid="nav-destinations">
        @for (link of destinations(); track link.key) {
          @if (link.key !== 'settings') {
            <li><ng-container *ngTemplateOutlet="navLink; context: { $implicit: link }" /></li>
          }
        }
      </ul>

      @if (pins().length > 0) {
        <div
          class="mt-3 flex min-h-7 items-center justify-between px-2.5 pt-1 pb-1 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
        >
          <span id="nav-pins-heading">{{ 'shell.pins.heading' | transloco }}</span>
          @if (hasRegisters()) {
            <a
              routerLink="/registers"
              class="rounded-md px-1 text-micro font-semibold tracking-normal text-fg-subtle normal-case hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              data-testid="nav-pins-edit"
              >{{ 'shell.pins.edit' | transloco }}</a
            >
          }
        </div>
        <ul class="flex flex-col gap-0.5" aria-labelledby="nav-pins-heading" data-testid="nav-pins">
          @for (link of pins(); track link.key) {
            <li><ng-container *ngTemplateOutlet="navLink; context: { $implicit: link }" /></li>
          }
        </ul>
      }

      @if (auth.isSuperuser()) {
        <div
          class="mt-3 px-2.5 pt-1 pb-1 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
        >
          {{ adminSection.labelKey | transloco }}
        </div>
        <ul class="flex flex-col gap-0.5">
          @for (item of adminLinks; track item.key) {
            <li><ng-container *ngTemplateOutlet="navLink; context: { $implicit: item }" /></li>
          }
        </ul>
      }

      <div class="min-h-[14px] flex-1"></div>

      @if (settingsLink(); as settings) {
        <ul class="flex flex-col gap-0.5 border-t border-border pt-2">
          <li><ng-container *ngTemplateOutlet="navLink; context: { $implicit: settings }" /></li>
        </ul>
      }

      <div class="mt-1.5 flex items-center gap-2.5 border-t border-border px-2 pt-2.5 pb-1">
        <app-avatar [name]="auth.displayName()" size="md" />
        <div class="min-w-0">
          <div class="truncate text-ui font-semibold text-fg">{{ auth.displayName() }}</div>
          <div class="truncate text-meta text-fg-subtle">
            {{ currentRole() ?? ('workspace.role' | transloco) }}
          </div>
        </div>
      </div>
    </nav>

    <ng-template #navLink let-link>
      @let active = activeKey() === link.key;
      <a
        [routerLink]="'/' + link.path"
        [attr.aria-current]="active ? 'page' : null"
        [attr.data-testid]="'nav-v2-' + link.key"
        class="flex min-h-9 items-center gap-2.5 rounded-tile px-2.5 py-2 text-ui font-semibold hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        [class]="active ? '!bg-accent-soft !text-accent' : 'text-fg-muted'"
      >
        <span class="flex"><app-icon [name]="link.icon" [size]="18" /></span>
        <span class="flex-1 text-left">{{ link.labelKey | transloco }}</span>
      </a>
    </ng-template>
  `,
})
export class SideNavV2 {
  protected readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);
  private readonly prefs = inject(ShellPreferencesService);
  private readonly router = inject(Router);

  protected readonly adminSection = ADMIN_SECTION;
  protected readonly adminLinks: readonly NavLink[] = ADMIN_SECTION.items.map((item) => ({
    key: item.path,
    path: item.path,
    labelKey: item.labelKey,
    icon: item.icon,
    owns: [item.path],
  }));

  /** The `/library` hub (U11) when it exists; until then Documents stands in for it. */
  private readonly hasLibrary = hasShellRoute(this.router.config, 'library');

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => cleanPath(e.urlAfterRedirects)),
    ),
    { initialValue: cleanPath(this.router.url) },
  );

  private readonly granted = computed(() => this.selectedOrg.currentOrg()?.permissions);
  private readonly roles = computed(() => this.selectedOrg.currentOrg()?.roles ?? []);
  private readonly workspace = computed(() => navWorkspace(this.roles(), this.granted()));

  private allowed(entry: {
    readonly module?: string;
    readonly permission?: string | readonly string[];
  }): boolean {
    return isAllowed(entry, this.granted(), (m) => this.modules.isEnabled(m));
  }

  /** Module registers the user can open (Registre holds them). */
  private readonly registerModules = computed(() => {
    const keys = new Set(registerGroups(this.hasLibrary).flatMap((group) => group.modules));
    return MODULE_NAV_ITEMS.filter((item) => keys.has(item.module) && this.allowed(item));
  });
  protected readonly hasRegisters = computed(() => this.registerModules().length > 0);

  protected readonly registerActions = computed(() =>
    REGISTER_ACTIONS.filter((action) => this.allowed(action)),
  );

  /** The fixed destinations this user gets, in order (Innstillinger included, shown last). */
  protected readonly destinations = computed<readonly NavLink[]>(() => {
    const showAll = this.prefs.showAll();
    const workspace = this.workspace();
    const library = this.libraryLink();
    const links: NavLink[] = [];
    for (const dest of NAV_DESTINATIONS) {
      if (!showAll && !dest.workspaces.includes(workspace)) {
        continue;
      }
      if (dest.key === 'registers') {
        if (this.hasRegisters()) {
          // Pages "Dokumenter og rapporter" opens light that entry, not Registre.
          const libraryOwns = library?.owns ?? [];
          links.push({
            ...dest,
            owns: [
              'registers',
              ...this.registerModules()
                .map((item) => item.path)
                .filter((path) => !libraryOwns.includes(path)),
            ],
          });
        }
        continue;
      }
      if (dest.key === 'library') {
        if (library) {
          links.push(library);
        }
        continue;
      }
      if (this.allowed(dest)) {
        links.push({ ...dest, owns: [dest.path] });
      }
    }
    return links;
  });

  protected readonly settingsLink = computed(
    () => this.destinations().find((link) => link.key === 'settings') ?? null,
  );

  /** "Dokumenter og rapporter": `/library`, else Documents (or Reports) until it ships. */
  private libraryLink(): NavLink | null {
    const dest = NAV_DESTINATIONS.find((d) => d.key === 'library')!;
    if (this.hasLibrary) {
      return this.allowed(dest) ? { ...dest, owns: ['library', 'documents', 'reports'] } : null;
    }
    const fallback = MODULE_NAV_ITEMS.find(
      (item) => LIBRARY_MODULES.includes(item.module) && this.allowed(item),
    );
    return fallback ? { ...dest, path: fallback.path, owns: [fallback.path] } : null;
  }

  /** Pins: the user's own, else the role defaults; unknown or closed targets drop out. */
  protected readonly pins = computed<readonly NavLink[]>(() => {
    const keys = this.prefs.pins() ?? defaultPins(this.roles());
    return keys.flatMap((key) => {
      const target = PIN_TARGETS.get(key);
      return target && this.allowed(target)
        ? [
            {
              key: `pin:${key}`,
              path: target.path,
              labelKey: target.labelKey,
              icon: target.icon,
              owns: [target.path],
            },
          ]
        : [];
    });
  });

  /** The link of the current page: the most specific match, pins before destinations. */
  protected readonly activeKey = computed(() => {
    const path = this.path();
    let best: { key: string; length: number } | null = null;
    const links = [...this.pins(), ...this.destinations(), ...this.adminLinks];
    for (const link of links) {
      for (const owned of link.owns) {
        if (
          (path === owned || path.startsWith(`${owned}/`)) &&
          owned.length > (best?.length ?? -1)
        ) {
          best = { key: link.key, length: owned.length };
        }
      }
    }
    return best?.key ?? null;
  });

  private readonly language = inject(LanguageService);

  /** The user's first role in the current org as a readable name, or null without one. */
  protected readonly currentRole = computed(() => {
    const role = this.roles()[0];
    return role ? roleLabel((key) => this.language.translate(key), role) : null;
  });
}

function cleanPath(url: string): string {
  return url.split(/[?#]/)[0].replace(/^\//, '');
}
