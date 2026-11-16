import { NgTemplateOutlet } from '@angular/common';
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
}

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

/** Element id of the members / departments / invitations block on the settings page. */
export const SETTINGS_MEMBERS_ANCHOR = 'settings-members';

/**
 * The settings hub (docs/ux-guide.md, "Settings"): one card per organisation-wide
 * settings page, in a fixed order. Items join this list additively.
 */
export const SETTINGS_HUB_CARDS: readonly SettingsLink[] = [
  {
    path: '/settings/profile',
    labelKey: 'settings.hub.cards.organisation',
    hintKey: 'settings.hub.cards.organisationHint',
    icon: 'flag',
    permission: 'org:manage',
  },
  {
    path: '/settings',
    anchor: SETTINGS_MEMBERS_ANCHOR,
    labelKey: 'settings.hub.cards.members',
    hintKey: 'settings.hub.cards.membersHint',
    icon: 'people',
    permission: ['org:manage', 'users:invite'],
  },
  {
    path: '/settings/modules',
    labelKey: 'settings.hub.cards.modules',
    hintKey: 'settings.hub.cards.modulesHint',
    icon: 'sliders',
    permission: 'org:manage',
  },
  {
    path: '/settings/notifications',
    labelKey: 'settings.hub.cards.notifications',
    hintKey: 'settings.hub.cards.notificationsHint',
    icon: 'bell',
    permission: 'org:manage',
  },
  {
    path: '/settings/terminology',
    labelKey: 'settings.hub.cards.terminology',
    hintKey: 'settings.hub.cards.terminologyHint',
    icon: 'comment',
    permission: 'org:manage',
  },
  {
    path: '/settings/guidance',
    labelKey: 'settings.hub.cards.guidance',
    hintKey: 'settings.hub.cards.guidanceHint',
    icon: 'book',
    permission: 'org:manage',
  },
  {
    path: '/settings/record-types',
    labelKey: 'settings.hub.cards.recordTypes',
    hintKey: 'settings.hub.cards.recordTypesHint',
    icon: 'grid',
    permission: 'records:admin',
  },
  {
    path: '/settings/deleted-documents',
    labelKey: 'settings.hub.cards.deleted',
    hintKey: 'settings.hub.cards.deletedHint',
    icon: 'trash',
    permission: 'org:manage',
  },
  {
    path: '/setup',
    labelKey: 'settings.hub.cards.setup',
    hintKey: 'settings.hub.cards.setupHint',
    icon: 'spark',
    permission: 'org:manage',
  },
];

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
    module: 'recruitment',
    icon: 'userplus',
    links: [{ path: '/recruitment/settings', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
  {
    module: 'ai_governance',
    icon: 'spark',
    links: [{ path: '/ai-governance/settings', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
];

/** The settings hub: organisation cards, then one card per enabled module with settings. */
@Component({
  selector: 'app-settings-links',
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cards().length) {
      <section aria-labelledby="settings-hub-general" data-testid="settings-links">
        <h2 id="settings-hub-general" class="mb-3 font-display text-section font-bold text-fg">
          {{ 'settings.hub.general' | transloco }}
        </h2>
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (card of cards(); track card.labelKey) {
            <li>
              @if (card.anchor) {
                <a
                  [href]="'#' + card.anchor"
                  (click)="jump($event, card.anchor)"
                  [attr.data-testid]="'settings-card-' + card.labelKey"
                  class="flex h-full flex-col gap-1.5 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent-border hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <ng-container
                    *ngTemplateOutlet="cardBody; context: { $implicit: card }"
                  ></ng-container>
                </a>
              } @else {
                <a
                  [routerLink]="card.path"
                  [attr.data-testid]="'settings-card-' + card.labelKey"
                  class="flex h-full flex-col gap-1.5 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent-border hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <ng-container
                    *ngTemplateOutlet="cardBody; context: { $implicit: card }"
                  ></ng-container>
                </a>
              }
            </li>
          }
        </ul>
      </section>
    }

    @if (moduleCards().length) {
      <section
        aria-labelledby="settings-hub-modules"
        class="mt-10"
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

    <ng-template #cardBody let-card>
      <span class="flex items-center gap-2 text-card font-bold text-fg">
        <span class="flex text-accent" aria-hidden="true">
          <app-icon [name]="card.icon" [size]="17" />
        </span>
        {{ card.labelKey | transloco }}
      </span>
      <span class="text-meta text-fg-muted">{{ card.hintKey | transloco }}</span>
    </ng-template>
  `,
})
export class SettingsLinks {
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);

  private readonly granted = computed(() => this.selectedOrg.currentOrg()?.permissions);

  protected readonly cards = computed(() =>
    SETTINGS_HUB_CARDS.filter((card) => hasAnyPermission(this.granted(), card.permission)),
  );

  protected readonly moduleCards = computed(() =>
    MODULE_SETTINGS_CARDS.filter(
      (card) =>
        this.modules.isEnabled(card.module) &&
        hasAnyPermission(this.granted(), `${card.module}:read`),
    ),
  );

  /** In-page jump (the shell's <main> is the scroll container, so move focus too). */
  protected jump(event: Event, anchor: string): void {
    event.preventDefault();
    const target = document.getElementById(anchor);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.focus({ preventScroll: true });
  }
}
