import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { hasAnyPermission } from '../../../core/auth/permission';
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

/** Hub sections, in display order. */
export const SETTINGS_GROUPS = ['organisation', 'people', 'work', 'learning', 'trace'] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

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
    // U11: logo, colour, footer and classification of every generated document.
    path: '/settings/branding',
    labelKey: 'settings.hub.cards.branding',
    hintKey: 'settings.hub.cards.brandingHint',
    icon: 'flag',
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
    icon: 'template',
    permission: 'records:admin',
    group: 'work',
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
    group: 'trace',
  },
  {
    path: '/settings/attachment-deletions',
    labelKey: 'settings.hub.cards.attachmentDeletions',
    hintKey: 'settings.hub.cards.attachmentDeletionsHint',
    icon: 'trash',
    permission: 'audit:read',
    group: 'trace',
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
 * Module configuration pages (types, templates, matrices, settings). Each module
 * also links here from the gear (`settingsLink`) in its page header. Area items
 * add their module's pages to this list.
 */
export const MODULE_SETTINGS_CARDS: readonly ModuleSettingsCard[] = [
  {
    module: 'documents',
    icon: 'documents',
    links: [
      { path: '/documents/types', labelKey: 'settings.hub.moduleLinks.types' },
      { path: '/documents/templates', labelKey: 'settings.hub.moduleLinks.templates' },
      { path: '/documents/retention', labelKey: 'settings.hub.moduleLinks.retention' },
    ],
  },
  {
    module: 'deviations',
    icon: 'alert',
    links: [
      { path: '/deviations/types', labelKey: 'settings.hub.moduleLinks.types' },
      { path: '/deviations/templates', labelKey: 'settings.hub.moduleLinks.templates' },
      { path: '/deviations/intake/settings', labelKey: 'settings.hub.moduleLinks.intake' },
    ],
  },
  {
    module: 'inspections',
    icon: 'checkcircle',
    links: [{ path: '/inspections/templates', labelKey: 'settings.hub.moduleLinks.checklists' }],
  },
  {
    module: 'risk',
    icon: 'risk',
    links: [{ path: '/risk/matrices', labelKey: 'settings.hub.moduleLinks.matrices' }],
  },
  {
    module: 'management_review',
    icon: 'calendar',
    links: [{ path: '/management-review/settings', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
  {
    module: 'contracts',
    icon: 'contract',
    links: [{ path: '/contracts/settings', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
  {
    module: 'environment',
    icon: 'leaf',
    links: [
      {
        path: '/environment/scoring',
        labelKey: 'settings.hub.moduleLinks.significanceMethod',
      },
    ],
  },
  {
    module: 'suppliers',
    icon: 'link',
    links: [{ path: '/suppliers/questionnaires', labelKey: 'settings.hub.moduleLinks.templates' }],
  },
  {
    module: 'recruitment',
    icon: 'userplus',
    links: [{ path: '/recruitment/settings', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
  {
    module: 'feedback',
    icon: 'smile',
    links: [{ path: '/feedback/settings', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
  {
    module: 'ai_governance',
    icon: 'spark',
    links: [{ path: '/ai-governance/settings', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
  {
    module: 'reports',
    icon: 'reports',
    links: [{ path: '/reports/dashboards', labelKey: 'settings.hub.moduleLinks.roleOverviews' }],
  },
  {
    module: 'privacy',
    icon: 'shield',
    links: [{ path: '/privacy/settings', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
];

/** The settings hub: grouped organisation cards, then one card per enabled module. */
@Component({
  selector: 'app-settings-links',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (section of sections(); track section.group; let first = $first) {
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
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (card of section.cards; track card.labelKey) {
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
  `,
})
export class SettingsLinks {
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);

  private readonly granted = computed(() => this.selectedOrg.currentOrg()?.permissions);

  protected readonly sections = computed(() => hubSections(this.granted()));

  protected readonly moduleCards = computed(() =>
    MODULE_SETTINGS_CARDS.filter(
      (card) =>
        this.modules.isEnabled(card.module) &&
        hasAnyPermission(this.granted(), `${card.module}:read`),
    ),
  );
}
