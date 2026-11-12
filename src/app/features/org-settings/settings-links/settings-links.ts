import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { hasAnyPermission } from '../../../core/auth/permission';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Icon } from '../../../shared/ui/icon/icon';

/** One settings sub-page link (its route lives in `org-settings.routes.ts`). */
export interface SettingsLink {
  readonly path: string;
  readonly labelKey: string;
  readonly hintKey: string;
  readonly icon: string;
  readonly permission: string | readonly string[];
}

/**
 * The settings section nav: one card per settings sub-page. Items join this
 * list additively (F3 notifications, F4 record types, F6 guidance each add one).
 */
export const SETTINGS_LINKS: readonly SettingsLink[] = [
  {
    path: '/settings/profile',
    labelKey: 'modules.links.profile',
    hintKey: 'modules.links.profileHint',
    icon: 'flag',
    permission: 'org:manage',
  },
  {
    path: '/settings/modules',
    labelKey: 'modules.links.modules',
    hintKey: 'modules.links.modulesHint',
    icon: 'sliders',
    permission: 'org:manage',
  },
  {
    path: '/settings/terminology',
    labelKey: 'modules.links.terminology',
    hintKey: 'modules.links.terminologyHint',
    icon: 'comment',
    permission: 'org:manage',
  },
  {
    path: '/setup',
    labelKey: 'modules.links.setup',
    hintKey: 'modules.links.setupHint',
    icon: 'spark',
    permission: 'org:manage',
  },
];

/** Grid of settings sub-page links the current org grants. */
@Component({
  selector: 'app-settings-links',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (links().length) {
      <section aria-labelledby="settings-links-title" data-testid="settings-links">
        <h2
          id="settings-links-title"
          class="mb-3 font-display text-[18px] font-bold tracking-[-0.02em] text-fg"
        >
          {{ 'modules.links.title' | transloco }}
        </h2>
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          @for (link of links(); track link.path) {
            <li>
              <a
                [routerLink]="link.path"
                class="flex h-full flex-col gap-1.5 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent-border hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span class="flex items-center gap-2 text-[14px] font-bold text-fg">
                  <span class="flex text-accent" aria-hidden="true">
                    <app-icon [name]="link.icon" [size]="17" />
                  </span>
                  {{ link.labelKey | transloco }}
                </span>
                <span class="text-[12.5px] text-fg-muted">{{ link.hintKey | transloco }}</span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class SettingsLinks {
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly links = computed(() => {
    const granted = this.selectedOrg.currentOrg()?.permissions;
    return SETTINGS_LINKS.filter((link) => hasAnyPermission(granted, link.permission));
  });
}
