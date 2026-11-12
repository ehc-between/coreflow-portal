/** A single sidebar navigation item. */
export interface NavItem {
  /** Route path segment under the shell (e.g. 'my-work'). */
  readonly path: string;
  /** i18n key for the label. */
  readonly labelKey: string;
  /** Icon name (see shared Icon set). */
  readonly icon: string;
  /**
   * Optional permission gating the item's visibility in the current org (e.g.
   * dashboard); a list means the user needs ANY one of them. Keep in sync with
   * the route's guard (app.routes).
   */
  readonly permission?: string | readonly string[];
  /**
   * Module key (backend `ModuleSpec.key`) the item belongs to. The side nav
   * hides the item while the module is disabled for the current org, and the
   * route is wrapped in `moduleGuard(module)`.
   */
  readonly module?: string;
  /** Placeholder agent context, rendered on the module placeholder page. */
  readonly agentName?: string;
  readonly agentRole?: string;
}

/** A labelled group of nav items. */
export interface NavSection {
  readonly labelKey: string;
  readonly items: readonly NavItem[];
}

/** A module's nav item: path, module key, `nav.<camelCaseKey>` label, icon, `<key>:read`. */
function moduleItem(
  path: string,
  key: string,
  icon: string,
  extra: Partial<NavItem> = {},
): NavItem {
  return {
    path,
    module: key,
    labelKey: `nav.${camelCase(key)}`,
    icon,
    permission: `${key}:read`,
    ...extra,
  };
}

function camelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * The full sidebar structure: every module of the platform (contracts §1.1),
 * each gated on its module being enabled and on its read permission. A module
 * without a feature yet renders the shared placeholder (its stub routes file).
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    labelKey: 'nav.sections.workspace',
    items: [
      {
        path: 'dashboard',
        labelKey: 'nav.dashboard',
        icon: 'qa',
        permission: 'dashboard:view',
      },
      {
        path: 'my-work',
        labelKey: 'nav.myWork',
        icon: 'inbox',
        agentName: 'Iris',
        agentRole: 'Work Planner',
      },
      {
        path: 'review',
        labelKey: 'nav.review',
        icon: 'inbox',
        permission: 'documents:approve',
      },
    ],
  },
  {
    labelKey: 'nav.sections.governance',
    items: [
      moduleItem('context', 'context', 'flag'),
      moduleItem('objectives', 'objectives', 'qa'),
      moduleItem('management-review', 'management_review', 'calendar'),
      moduleItem('obligations', 'obligations', 'lock'),
      moduleItem('reports', 'reports', 'reports', {
        agentName: 'Rune',
        agentRole: 'Reporting Analyst',
      }),
    ],
  },
  {
    labelKey: 'nav.sections.operations',
    items: [
      moduleItem('processes', 'processes', 'procedures', {
        agentName: 'Pernille',
        agentRole: 'Procedure Author',
      }),
      moduleItem('documents', 'documents', 'documents', {
        agentName: 'Dora',
        agentRole: 'Document Steward',
      }),
      moduleItem('projects', 'projects', 'projects', {
        agentName: 'Pax',
        agentRole: 'Project Planner',
      }),
      moduleItem('suppliers', 'suppliers', 'link'),
      moduleItem('contracts', 'contracts', 'documents'),
      moduleItem('assets', 'assets', 'devices'),
      moduleItem('continuity', 'continuity', 'history'),
    ],
  },
  {
    labelKey: 'nav.sections.improvement',
    items: [
      moduleItem('deviations', 'deviations', 'alert', {
        agentName: 'Nils',
        agentRole: 'Deviation Analyst',
      }),
      moduleItem('inspections', 'inspections', 'checkcircle', {
        agentName: 'Vera',
        agentRole: 'Inspection Lead',
      }),
      moduleItem('audits', 'audits', 'audit', {
        agentName: 'Audun',
        agentRole: 'Audit Coordinator',
      }),
      moduleItem('risk', 'risk', 'risk', { agentName: 'Sol', agentRole: 'Risk Officer' }),
      moduleItem('feedback', 'feedback', 'comment'),
    ],
  },
  {
    labelKey: 'nav.sections.people',
    items: [
      moduleItem('people', 'people', 'people', {
        agentName: 'Petra',
        agentRole: 'People Coordinator',
      }),
      moduleItem('recruitment', 'recruitment', 'userplus'),
      moduleItem('training', 'training', 'training', {
        agentName: 'Tor',
        agentRole: 'Training Lead',
      }),
    ],
  },
  {
    labelKey: 'nav.sections.compliance',
    items: [
      moduleItem('standards', 'standards', 'iso', {
        agentName: 'Stella',
        agentRole: 'Standards Guide',
      }),
      moduleItem('privacy', 'privacy', 'lock'),
      moduleItem('ai-governance', 'ai_governance', 'spark'),
      moduleItem('environment', 'environment', 'sun'),
      moduleItem('hse', 'hse', 'checkcircle'),
    ],
  },
];

/** Flattened list of every nav item, in section order. */
export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Nav items that belong to a module (everything except the workspace pages). */
export const MODULE_NAV_ITEMS: readonly (NavItem & { readonly module: string })[] =
  NAV_ITEMS.filter((item): item is NavItem & { readonly module: string } => !!item.module);

/**
 * Org Settings nav item. Kept out of NAV_SECTIONS / NAV_ITEMS because its route
 * is registered explicitly (with the settingsGuard), and the side-nav shows it
 * when the user holds `org:manage` OR `users:invite` in the current org.
 */
export const SETTINGS_NAV_ITEM: NavItem = {
  path: 'settings',
  labelKey: 'nav.settings',
  icon: 'sliders',
  permission: ['org:manage', 'users:invite'],
};

/**
 * Super-admin-only section. Kept out of NAV_SECTIONS / NAV_ITEMS because its
 * routes are registered explicitly (with the superAdminGuard), and the side-nav
 * gates it on `isSuperuser()`.
 */
export const ADMIN_SECTION: NavSection = {
  labelKey: 'nav.sections.administration',
  items: [
    {
      path: 'admin/organizations',
      labelKey: 'nav.organizations',
      icon: 'userplus',
    },
  ],
};
