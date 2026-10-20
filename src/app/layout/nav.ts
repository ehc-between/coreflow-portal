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
  /** Placeholder agent context, rendered on the module placeholder page. */
  readonly agentName?: string;
  readonly agentRole?: string;
}

/** A labelled group of nav items. */
export interface NavSection {
  readonly labelKey: string;
  readonly items: readonly NavItem[];
}

/**
 * The full sidebar structure. Drives both the side-nav rendering and the child
 * routes registered under the shell. Dashboard is the only real surface; every
 * other item resolves to the shared module placeholder.
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
    labelKey: 'nav.sections.quality',
    items: [
      {
        path: 'inspections',
        labelKey: 'nav.inspections',
        icon: 'checkcircle',
        agentName: 'Vera',
        agentRole: 'Inspection Lead',
      },
      {
        path: 'deviations',
        labelKey: 'nav.deviations',
        icon: 'alert',
        permission: 'deviations:read',
        agentName: 'Nils',
        agentRole: 'Deviation Analyst',
      },
      {
        path: 'risk',
        labelKey: 'nav.risk',
        icon: 'risk',
        agentName: 'Sol',
        agentRole: 'Risk Officer',
      },
      {
        path: 'audits',
        labelKey: 'nav.audits',
        icon: 'audit',
        agentName: 'Audun',
        agentRole: 'Audit Coordinator',
      },
      {
        path: 'standards',
        labelKey: 'nav.iso',
        icon: 'iso',
        permission: 'standards:read',
        agentName: 'Stella',
        agentRole: 'Standards Guide',
      },
    ],
  },
  {
    labelKey: 'nav.sections.modules',
    items: [
      {
        path: 'documents',
        labelKey: 'nav.documents',
        icon: 'documents',
        permission: 'documents:read',
        agentName: 'Dora',
        agentRole: 'Document Steward',
      },
      {
        path: 'people',
        labelKey: 'nav.people',
        icon: 'people',
        agentName: 'Petra',
        agentRole: 'People Coordinator',
      },
      {
        path: 'projects',
        labelKey: 'nav.projects',
        icon: 'projects',
        agentName: 'Pax',
        agentRole: 'Project Planner',
      },
      {
        path: 'procedures',
        labelKey: 'nav.procedures',
        icon: 'procedures',
        agentName: 'Pernille',
        agentRole: 'Procedure Author',
      },
      {
        path: 'training',
        labelKey: 'nav.training',
        icon: 'training',
        agentName: 'Tor',
        agentRole: 'Training Lead',
      },
      {
        path: 'reports',
        labelKey: 'nav.reports',
        icon: 'reports',
        agentName: 'Rune',
        agentRole: 'Reporting Analyst',
      },
    ],
  },
];

/** Flattened list of every nav item, in section order. */
export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/**
 * Org Settings nav item. Kept out of NAV_SECTIONS / NAV_ITEMS because its route
 * is registered explicitly (with the settingsGuard) rather than via the shared
 * module placeholder, and the side-nav shows it when the user holds `org:manage`
 * OR `users:invite` in the current org (via *appHasPermission).
 */
export const SETTINGS_NAV_ITEM: NavItem = {
  path: 'settings',
  labelKey: 'nav.settings',
  icon: 'sliders',
  permission: ['org:manage', 'users:invite'],
};

/**
 * Super-admin-only section. Kept out of NAV_SECTIONS / NAV_ITEMS because its
 * routes are registered explicitly (with the superAdminGuard) rather than via
 * the shared module placeholder, and the side-nav gates it on `isSuperuser()`.
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
