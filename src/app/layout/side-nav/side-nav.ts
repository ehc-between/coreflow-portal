import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Icon } from '../../shared/ui/icon/icon';
import { SectionLabel } from '../../shared/ui/section-label/section-label';
import { ADMIN_SECTION, NAV_SECTIONS, NavItem, SETTINGS_NAV_ITEM } from '../nav';
import { OrgSwitcher } from '../org-switcher/org-switcher';

/**
 * Sidebar navigation (248px): org switcher, grouped nav sections with active
 * states, a "customize workspace" mode that reveals per-item visibility toggles
 * (local signal), and a bottom user card. Items with a `permission` are hidden
 * unless the current org grants it (in addition to the customize visibility).
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
    SectionLabel,
    HasPermissionDirective,
    OrgSwitcher,
  ],
  // Make the host a flex container that fills the row height so the <aside>
  // stretches all the way down instead of stopping at its content.
  host: { class: 'flex min-h-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside
      class="flex w-[248px] flex-none flex-col gap-[3px] overflow-y-auto border-r border-border bg-surface px-3 pt-3.5 pb-3"
    >
      <app-org-switcher class="mb-2" />

      @if (customizing()) {
        <div
          class="mb-1.5 rounded-[9px] border border-accent-border bg-accent-soft px-2.5 py-2.5 text-[12px] leading-snug font-semibold text-accent"
        >
          {{ 'nav.customizeHint' | transloco }}
        </div>
      }

      @for (section of sections; track section.labelKey) {
        <app-section-label>{{ section.labelKey | transloco }}</app-section-label>
        @for (item of section.items; track item.path) {
          @if (item.permission) {
            <ng-container *appHasPermission="item.permission">
              @if (isVisible(item) || customizing()) {
                <ng-container *ngTemplateOutlet="navLink; context: { $implicit: item }" />
              }
            </ng-container>
          } @else if (isVisible(item) || customizing()) {
            <ng-container *ngTemplateOutlet="navLink; context: { $implicit: item }" />
          }
        }
      }

      @if (auth.isSuperuser()) {
        <app-section-label>{{ adminSection.labelKey | transloco }}</app-section-label>
        @for (item of adminSection.items; track item.path) {
          <a
            [routerLink]="'/' + item.path"
            routerLinkActive="!bg-accent-soft !text-accent"
            class="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <span class="flex"><app-icon [name]="item.icon" [size]="18" /></span>
            <span class="flex-1 text-left">{{ item.labelKey | transloco }}</span>
          </a>
        }
      }

      <div class="min-h-[14px] flex-1"></div>

      <a
        *appHasPermission="settingsItem.permission!"
        [routerLink]="'/' + settingsItem.path"
        routerLinkActive="!bg-accent-soft !text-accent"
        class="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        <span class="flex"><app-icon [name]="settingsItem.icon" [size]="18" /></span>
        <span class="flex-1 text-left">{{ settingsItem.labelKey | transloco }}</span>
      </a>

      <button
        type="button"
        (click)="toggleCustomize()"
        class="flex w-full items-center gap-2.5 rounded-[9px] border border-transparent bg-transparent px-2.5 py-2.5 text-left text-[13px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        <span class="flex"><app-icon name="sliders" [size]="18" /></span>
        {{ 'nav.customize' | transloco }}
      </button>

      <div class="mt-1.5 flex items-center gap-2.5 border-t border-border px-2 pt-2.5 pb-1">
        <app-avatar [name]="auth.displayName()" size="md" />
        <div class="min-w-0">
          <div class="truncate text-[13px] font-semibold text-fg">{{ auth.displayName() }}</div>
          <div class="truncate text-[11.5px] text-fg-subtle">
            {{ currentRole() ?? ('workspace.role' | transloco) }}
          </div>
        </div>
      </div>
    </aside>

    <ng-template #navLink let-item>
      <a
        [routerLink]="['/', item.path]"
        routerLinkActive="!bg-accent-soft !text-accent"
        class="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
        [class.opacity-50]="customizing() && !isVisible(item)"
      >
        <span class="flex"><app-icon [name]="item.icon" [size]="18" /></span>
        <span class="flex-1 text-left">{{ item.labelKey | transloco }}</span>
        @if (customizing()) {
          <button
            type="button"
            (click)="toggleVisible(item, $event)"
            [attr.aria-pressed]="isVisible(item)"
            class="inline-flex h-[18px] w-8 flex-none items-center rounded-full px-[2px] transition-colors"
            [class]="isVisible(item) ? 'bg-accent' : 'bg-border-strong'"
          >
            <span
              class="h-[14px] w-[14px] rounded-full bg-white transition-transform"
              [style.transform]="isVisible(item) ? 'translateX(14px)' : 'none'"
            ></span>
          </button>
        }
      </a>
    </ng-template>
  `,
})
export class SideNav {
  protected readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  protected readonly sections = NAV_SECTIONS;
  protected readonly adminSection = ADMIN_SECTION;
  protected readonly settingsItem = SETTINGS_NAV_ITEM;

  /** The user's first role in the current org, or null when there is none. */
  protected readonly currentRole = computed(() => this.selectedOrg.currentOrg()?.roles[0] ?? null);

  protected readonly customizing = signal(false);
  /** Paths the user has hidden for this workspace (customize mode). */
  private readonly hidden = signal<ReadonlySet<string>>(new Set());

  protected toggleCustomize(): void {
    this.customizing.update((c) => !c);
  }

  protected isVisible(item: NavItem): boolean {
    return !this.hidden().has(item.path);
  }

  protected toggleVisible(item: NavItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.hidden.update((set) => {
      const next = new Set(set);
      if (next.has(item.path)) {
        next.delete(item.path);
      } else {
        next.add(item.path);
      }
      return next;
    });
  }
}
