import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { hasAnyPermission } from '../../../core/auth/permission';
import { MODULE_CONFIG_AREAS, moduleConfigLink } from '../../../core/modules/module-config';
import { ModuleService } from '../../../core/modules/module.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Icon } from '../../../shared/ui/icon/icon';

/** One settings sub-page link (its route lives in `org-settings.routes.ts`). */
export interface SettingsLink {
  readonly path: string;
  readonly labelKey: string;
  readonly hintKey: string;
  readonly icon: string;
  readonly permission: string | readonly string[];
  /** In-page anchor (`#id`) instead of a route. */
  readonly anchor?: string;
  /** Hub section the card sits in (A26). */
  readonly group?: SettingsGroup;
}

/** Hub sections, in display order. `advanced` is folded away under "Advanced" (U10). */
export const SETTINGS_GROUPS = [
  'organisation',
  'people',
  'work',
  'learning',
  'trace',
  'advanced',
] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

/** Sections shown folded, under one "Advanced" toggle at the bottom of the hub. */
export const ADVANCED_GROUPS: readonly SettingsGroup[] = ['advanced'];

/**
 * The F1 organisation links (modules scope keys). Kept for the F1 i18n spec; the
 * hub below shows them through {@link SETTINGS_HUB_CARDS}.
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

/**
 * The settings hub (docs/ux-guide.md, "Settings"): one card per organisation-wide
 * settings page, grouped into sections, in a fixed order. Items join additively.
 */
export const SETTINGS_HUB_CARDS: readonly SettingsLink[] = [
  {
    path: '/settings/profile',
    labelKey: 'settings.hub.cards.organisation',
    hintKey: 'settings.hub.cards.organisationHint',
    icon: 'flag',
    permission: 'org:manage',
    group: 'organisation',
  },
  {
    path: '/settings/modules',
    labelKey: 'settings.hub.cards.modules',
    hintKey: 'settings.hub.cards.modulesHint',
    icon: 'sliders',
    permission: 'org:manage',
    group: 'organisation',
  },
  {
    path: '/settings/terminology',
    labelKey: 'settings.hub.cards.terminology',
    hintKey: 'settings.hub.cards.terminologyHint',
    icon: 'comment',
    permission: 'org:manage',
    group: 'organisation',
  },
  {
    path: '/setup',
    labelKey: 'settings.hub.cards.setup',
    hintKey: 'settings.hub.cards.setupHint',
    icon: 'spark',
    permission: 'org:manage',
    group: 'organisation',
  },
  {
    path: '/settings/members',
    labelKey: 'settings.hub.cards.members',
    hintKey: 'settings.hub.cards.membersHint',
    icon: 'people',
    permission: 'org:manage',
    group: 'people',
  },
  {
    path: '/settings/departments',
    labelKey: 'settings.hub.cards.departments',
    hintKey: 'settings.hub.cards.departmentsHint',
    icon: 'grid',
    permission: 'org:manage',
    group: 'people',
  },
  {
    path: '/settings/invitations',
    labelKey: 'settings.hub.cards.invitations',
    hintKey: 'settings.hub.cards.invitationsHint',
    icon: 'userplus',
    permission: 'users:invite',
    group: 'people',
  },
  {
    path: '/settings/roles',
    labelKey: 'settings.hub.cards.roles',
    hintKey: 'settings.hub.cards.rolesHint',
    icon: 'shield',
    permission: ['users:invite', 'org:manage', 'audit:read'],
    group: 'people',
  },
  {
    path: '/settings/security',
    labelKey: 'settings.hub.cards.security',
    hintKey: 'settings.hub.cards.securityHint',
    icon: 'lock',
    permission: 'org:manage',
    group: 'people',
  },
  {
    path: '/settings/notifications',
    labelKey: 'settings.hub.cards.notifications',
    hintKey: 'settings.hub.cards.notificationsHint',
    icon: 'bell',
    permission: 'org:manage',
    group: 'work',
  },
  {
    path: '/settings/record-types',
    labelKey: 'settings.hub.cards.recordTypes',
    hintKey: 'settings.hub.cards.recordTypesHint',
    icon: 'procedures',
    permission: 'records:admin',
    group: 'advanced',
  },
  {
    path: '/settings/guidance',
    labelKey: 'settings.hub.cards.guidance',
    hintKey: 'settings.hub.cards.guidanceHint',
    icon: 'book',
    permission: 'org:manage',
    group: 'learning',
  },
  {
    path: '/settings/audit-log',
    labelKey: 'settings.hub.cards.auditLog',
    hintKey: 'settings.hub.cards.auditLogHint',
    icon: 'history',
    permission: 'audit:read',
    group: 'trace',
  },
  {
    path: '/settings/deleted-documents',
    labelKey: 'settings.hub.cards.deleted',
    hintKey: 'settings.hub.cards.deletedHint',
    icon: 'trash',
    permission: 'org:manage',
    group: 'advanced',
  },
  {
    path: '/settings/attachment-deletions',
    labelKey: 'settings.hub.cards.attachmentDeletions',
    hintKey: 'settings.hub.cards.attachmentDeletionsHint',
    icon: 'trash',
    permission: 'audit:read',
    group: 'advanced',
  },
];

/** Cards the caller may open, grouped by section (empty sections dropped). */
export function hubSections(
  granted: readonly string[] | null | undefined,
): { group: SettingsGroup; cards: SettingsLink[] }[] {
  return SETTINGS_GROUPS.map((group) => ({
    group,
    cards: SETTINGS_HUB_CARDS.filter(
      (card) => card.group === group && hasAnyPermission(granted, card.permission),
    ),
  })).filter((section) => section.cards.length > 0);
}

/** A module's own configuration pages, listed on its card in the hub. */
export interface ModuleSettingsCard {
  /** Backend module key (`modules.names.<key>`). */
  readonly module: string;
  readonly icon: string;
  readonly links: readonly { readonly path: string; readonly labelKey: string }[];
}

/**
 * Module configuration pages (types, templates, matrices, settings), one card per
 * module, from the U10 registry: they all live under `/settings/modules/<slug>`,
 * and each module's gear (`settingsLink`) points there too. Role overviews are a
 * reports page, not module configuration, and keep their own address.
 */
export const MODULE_SETTINGS_CARDS: readonly ModuleSettingsCard[] = [
  ...MODULE_CONFIG_AREAS.map((area) => ({
    module: area.module,
    icon: area.icon,
    links: area.pages.map((page) => ({
      path: moduleConfigLink(area.slug, page.path),
      labelKey: page.labelKey,
    })),
  })),
  {
    module: 'reports',
    icon: 'reports',
    links: [{ path: '/reports/dashboards', labelKey: 'settings.hub.moduleLinks.roleOverviews' }],
  },
];

/**
 * The settings hub: grouped organisation cards, then one card per enabled module
 * (its configuration pages), then the rarely needed pages folded under "Advanced".
 */
@Component({
  selector: 'app-settings-links',
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #cardGrid let-cards>
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (card of cards; track card.labelKey) {
          <li>
            <a
              [routerLink]="card.path"
              [attr.data-testid]="'settings-card-' + card.labelKey"
              class="flex h-full flex-col gap-1.5 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent-border hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span class="flex items-center gap-2 text-card font-bold text-fg">
                <span class="flex text-accent" aria-hidden="true">
                  <app-icon [name]="card.icon" [size]="17" />
                </span>
                {{ card.labelKey | transloco }}
              </span>
              <span class="text-meta text-fg-muted">{{ card.hintKey | transloco }}</span>
            </a>
          </li>
        }
      </ul>
    </ng-template>

    @for (section of mainSections(); track section.group; let first = $first) {
      <section
        [attr.aria-labelledby]="'settings-hub-' + section.group"
        [class.mt-8]="!first"
        [attr.data-testid]="'settings-section-' + section.group"
      >
        <h2
          [id]="'settings-hub-' + section.group"
          class="mb-3 font-display text-section font-bold text-fg"
        >
          {{ 'settings.hub.groups.' + section.group | transloco }}
        </h2>
        <ng-container *ngTemplateOutlet="cardGrid; context: { $implicit: section.cards }" />
      </section>
    }

    @if (moduleCards().length) {
      <section
        aria-labelledby="settings-hub-modules"
        class="mt-8"
        data-testid="settings-module-cards"
      >
        <h2 id="settings-hub-modules" class="font-display text-section font-bold text-fg">
          {{ 'settings.hub.moduleSettings' | transloco }}
        </h2>
        <p class="mt-1 mb-3 text-ui text-fg-muted">
          {{ 'settings.hub.moduleSettingsHint' | transloco }}
        </p>
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (card of moduleCards(); track card.module) {
            <li
              class="flex h-full flex-col gap-2 rounded-card border border-border bg-surface p-4 shadow-card"
              [attr.data-testid]="'settings-module-' + card.module"
            >
              <span class="flex items-center gap-2 text-card font-bold text-fg">
                <span class="flex text-accent" aria-hidden="true">
                  <app-icon [name]="card.icon" [size]="17" />
                </span>
                {{ 'modules.names.' + card.module | transloco }}
              </span>
              <ul class="flex flex-wrap gap-x-4 gap-y-1">
                @for (link of card.links; track link.path) {
                  <li>
                    <a
                      [routerLink]="link.path"
                      class="inline-flex min-h-6 items-center text-ui font-semibold text-accent hover:underline"
                      >{{ link.labelKey | transloco }}</a
                    >
                  </li>
                }
              </ul>
            </li>
          }
        </ul>
      </section>
    }

    @if (advancedCards().length) {
      <details
        class="group mt-8 rounded-card border border-border bg-surface-2/40"
        data-testid="settings-section-advanced"
        [open]="advancedOpen()"
      >
        <summary
          class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 font-display text-section font-bold text-fg focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
          data-testid="settings-advanced-toggle"
        >
          <span
            class="flex text-fg-muted -rotate-90 transition-transform group-open:rotate-0"
            aria-hidden="true"
          >
            <app-icon name="chevron" [size]="16" />
          </span>
          {{ 'settings.hub.groups.advanced' | transloco }}
          <span class="ml-1 text-meta font-normal text-fg-muted">
            {{ 'settings.hub.advancedHint' | transloco }}
          </span>
        </summary>
        <div class="px-4 pb-4">
          <ng-container *ngTemplateOutlet="cardGrid; context: { $implicit: advancedCards() }" />
        </div>
      </details>
    }
  `,
})
export class SettingsLinks {
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);

  private readonly granted = computed(() => this.selectedOrg.currentOrg()?.permissions);

  private readonly sections = computed(() => hubSections(this.granted()));

  protected readonly mainSections = computed(() =>
    this.sections().filter((section) => !ADVANCED_GROUPS.includes(section.group)),
  );

  protected readonly advancedCards = computed(() =>
    this.sections()
      .filter((section) => ADVANCED_GROUPS.includes(section.group))
      .flatMap((section) => section.cards),
  );

  /** Open the fold when it is all the caller may see (nothing else to scan past). */
  protected readonly advancedOpen = computed(
    () => this.mainSections().length === 0 && this.moduleCards().length === 0,
  );

  protected readonly moduleCards = computed(() =>
    MODULE_SETTINGS_CARDS.filter(
      (card) =>
        this.modules.isEnabled(card.module) &&
        hasAnyPermission(this.granted(), `${card.module}:read`),
    ),
  );
}
