import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { hasAnyPermission } from '../../core/auth/permission';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Icon } from '../../shared/ui/icon/icon';
import {
  ADMIN_SECTION,
  LEARNING_NAV_ITEM,
  NAV_SECTIONS,
  NavItem,
  NavSection,
  SETTINGS_NAV_ITEM,
} from '../nav';
import { NavDrawerService } from '../nav-drawer.service';
import { OrgSwitcher } from '../org-switcher/org-switcher';
import { ChatNavBadge } from '../../shared/chat/chat-nav-badge';

/**
 * Sidebar navigation: org switcher, collapsible sections (remembered per org), the
 * learning centre and settings at the bottom, and the user card.
 *
 * Items with a `permission` are hidden unless the current org grants it, and items
 * with a `module` while the module is disabled. "Tilpass menyen" switches to a
 * list of visibility switches (no links), and the choice is remembered per org
 * (see {@link NavDrawerService}). From `lg` it is a fixed column; below that the
 * main layout shows it as an off-canvas drawer.
 */
@Component({
  selector: 'app-side-nav',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    Icon,
    Avatar,
    HasPermissionDirective,
    OrgSwitcher,
    ChatNavBadge,
  ],
  host: { class: 'flex min-h-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      [attr.aria-label]="'ui.shell.mainNav' | transloco"
      data-testid="side-nav"
      class="flex w-full flex-none flex-col gap-0.5 overflow-y-auto border-r border-border bg-surface px-3 pt-3.5 pb-3 lg:w-[248px]"
    >
      <app-org-switcher class="mb-2" />

      @if (customizing()) {
        <div
          class="mb-1.5 rounded-tile border border-accent-border bg-accent-soft px-2.5 py-2.5 text-meta leading-snug font-semibold text-accent"
        >
          {{ 'nav.customizeHint' | transloco }}
        </div>
      }

      @for (section of sections(); track section.labelKey) {
        @if (hasShownItem(section)) {
          @let collapsed = isCollapsed(section) && !customizing() && !hasActive(section);
          <button
            type="button"
            class="mt-2 flex min-h-7 w-full items-center justify-between rounded-lg px-2.5 pt-1 pb-1 text-left text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.aria-expanded]="!collapsed"
            [attr.data-testid]="'nav-section-' + section.labelKey"
            (click)="drawer.toggleCollapsed(section.labelKey)"
          >
            <span>{{ section.labelKey | transloco }}</span>
            <span
              class="flex transition-transform motion-reduce:transition-none"
              [class.-rotate-90]="collapsed"
              aria-hidden="true"
              ><app-icon name="chevron" [size]="13"
            /></span>
          </button>
          @if (!collapsed) {
            <ul class="flex flex-col gap-0.5">
              @for (item of section.items; track item.path) {
                @if (customizing()) {
                  <li>
                    <ng-container *ngTemplateOutlet="customizeRow; context: { $implicit: item }" />
                  </li>
                } @else if (isVisible(item)) {
                  <li>
                    <ng-container *ngTemplateOutlet="navLink; context: { $implicit: item }" />
                  </li>
                }
              }
            </ul>
          }
        }
      }

      @if (auth.isSuperuser()) {
        <div
          class="mt-2 px-2.5 pt-1 pb-1 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
        >
          {{ adminSection.labelKey | transloco }}
        </div>
        <ul class="flex flex-col gap-0.5">
          @for (item of adminSection.items; track item.path) {
            <li><ng-container *ngTemplateOutlet="navLink; context: { $implicit: item }" /></li>
          }
        </ul>
      }

      <div class="min-h-[14px] flex-1"></div>

      <ul class="flex flex-col gap-0.5 border-t border-border pt-2">
        <li><ng-container *ngTemplateOutlet="navLink; context: { $implicit: learningItem }" /></li>
        <li *appHasPermission="settingsItem.permission!">
          <ng-container *ngTemplateOutlet="navLink; context: { $implicit: settingsItem }" />
        </li>
        <li>
          <button
            type="button"
            data-testid="nav-customize"
            [attr.aria-pressed]="customizing()"
            (click)="customizing.set(!customizing())"
            class="flex min-h-9 w-full items-center gap-2.5 rounded-tile px-2.5 py-2 text-left text-ui font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <span class="flex"><app-icon name="sliders" [size]="18" /></span>
            {{ (customizing() ? 'nav.customizeDone' : 'nav.customize') | transloco }}
          </button>
        </li>
      </ul>

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

    <ng-template #navLink let-item>
      <a
        [routerLink]="'/' + item.path"
        routerLinkActive="!bg-accent-soft !text-accent"
        ariaCurrentWhenActive="page"
        class="flex min-h-9 items-center gap-2.5 rounded-tile px-2.5 py-2 text-ui font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <span class="flex"><app-icon [name]="item.icon" [size]="18" /></span>
        <span class="flex-1 text-left">{{ item.labelKey | transloco }}</span>
        @if (item.path === 'chat') {
          <app-chat-nav-badge />
        }
      </a>
    </ng-template>

    <ng-template #customizeRow let-item>
      @let shown = isVisible(item);
      <button
        type="button"
        role="switch"
        [attr.aria-checked]="shown"
        [attr.aria-label]="'nav.showItem' | transloco: { name: (item.labelKey | transloco) }"
        [attr.data-testid]="'nav-toggle-' + item.path"
        (click)="drawer.toggleHidden(item.path)"
        class="flex min-h-9 w-full items-center gap-2.5 rounded-tile px-2.5 py-2 text-left text-ui font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        [class.opacity-60]="!shown"
      >
        <span class="flex"><app-icon [name]="item.icon" [size]="18" /></span>
        <span class="flex-1">{{ item.labelKey | transloco }}</span>
        <span
          aria-hidden="true"
          class="inline-flex h-[18px] w-8 flex-none items-center rounded-full px-[2px] transition-colors"
          [class]="shown ? 'bg-accent' : 'bg-border-strong'"
        >
          <span
            class="h-[14px] w-[14px] rounded-full bg-white transition-transform"
            [style.transform]="shown ? 'translateX(14px)' : 'none'"
          ></span>
        </span>
      </button>
    </ng-template>
  `,
})
export class SideNav {
  protected readonly auth = inject(AuthService);
  protected readonly drawer = inject(NavDrawerService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);
  private readonly router = inject(Router);

  /** The current URL path without the leading slash and query. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => cleanPath(e.urlAfterRedirects)),
    ),
    { initialValue: cleanPath(this.router.url) },
  );

  /** Sections with only the items the current org allows (module on + permission held). */
  protected readonly sections = computed<readonly NavSection[]>(() => {
    const granted = this.selectedOrg.currentOrg()?.permissions;
    const allowed = (item: NavItem): boolean =>
      (!item.module || this.modules.isEnabled(item.module)) &&
      (!item.permission || hasAnyPermission(granted, item.permission));
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter(allowed),
    })).filter((section) => section.items.length > 0);
  });
  protected readonly adminSection = ADMIN_SECTION;
  protected readonly settingsItem = SETTINGS_NAV_ITEM;
  protected readonly learningItem = LEARNING_NAV_ITEM;

  /** The user's first role in the current org, or null when there is none. */
  protected readonly currentRole = computed(() => this.selectedOrg.currentOrg()?.roles[0] ?? null);

  protected readonly customizing = signal(false);

  /** Whether a section still shows anything (outside customize mode, hidden items count as gone). */
  protected hasShownItem(section: NavSection): boolean {
    return this.customizing() || section.items.some((item) => this.isVisible(item));
  }

  protected isVisible(item: NavItem): boolean {
    return !this.drawer.hidden().has(item.path);
  }

  protected isCollapsed(section: NavSection): boolean {
    return this.drawer.collapsed().has(section.labelKey);
  }

  /** A collapsed section still opens while one of its pages is the current page. */
  protected hasActive(section: NavSection): boolean {
    const path = this.path();
    return section.items.some((item) => path === item.path || path.startsWith(`${item.path}/`));
  }
}

function cleanPath(url: string): string {
  return url.split(/[?#]/)[0].replace(/^\//, '');
}
