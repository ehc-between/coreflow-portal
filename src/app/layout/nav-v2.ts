import { Route } from '@angular/router';
import { hasAnyPermission } from '../core/auth/permission';
import { RegisterEntry } from '../core/registers/register-catalog.service';
import { MAX_PINS } from '../core/shell/shell-preferences.models';
import { MODULE_NAV_ITEMS, NavItem, SETTINGS_NAV_ITEM } from './nav';

/**
 * Shell v2 (U03, simplify-plan §3.1): seven destinations named after jobs instead of
 * one entry per module, plus up to five pins. Behind the per-org flag
 * `coreflow.nav.v2` (see `ShellPreferencesService`); `nav.ts` stays the data source
 * for the old menu and for Registre.
 *
 * Labels live in the `shell` Transloco scope (`assets/i18n/shell/`), module names in
 * the global `modules.names.*`.
 */

/** What the role is in the shell: decides which destinations show (ia.md §4.4). */
export type NavWorkspace = 'lead' | 'auditor' | 'employee';

/** Roles that run part of the management system: they get every destination. */
const LEAD_ROLES: ReadonlySet<string> = new Set([
  'admin',
  'quality_manager',
  'dpo',
  'ciso',
  'hse_manager',
  'hr_manager',
  'ai_officer',
]);

/**
 * The workspace of a member: a management role (or `org:manage`) leads; the
 * auditor role reads; someone holding only the seeded `member` role is an
 * employee. Custom org roles count as lead so nothing is hidden by surprise.
 */
export function navWorkspace(
  roles: readonly string[],
  permissions: readonly string[] | undefined,
): NavWorkspace {
  if (roles.some((role) => LEAD_ROLES.has(role)) || permissions?.includes('org:manage')) {
    return 'lead';
  }
  if (roles.includes('auditor')) {
    return 'auditor';
  }
  if (roles.every((role) => role === 'member')) {
    return 'employee';
  }
  return 'lead';
}

/** One of the fixed destinations (Registrer is the button above them). */
export interface NavDestination {
  readonly key: 'home' | 'myWork' | 'chat' | 'standards' | 'registers' | 'library' | 'settings';
  readonly path: string;
  readonly labelKey: string;
  readonly icon: string;
  readonly permission?: string | readonly string[];
  readonly module?: string;
  /** Workspaces the destination shows for without "Vis alt". */
  readonly workspaces: readonly NavWorkspace[];
}

const ALL: readonly NavWorkspace[] = ['lead', 'auditor', 'employee'];

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  {
    key: 'home',
    path: 'dashboard',
    labelKey: 'shell.nav.home',
    icon: 'home',
    permission: 'dashboard:view',
    workspaces: ALL,
  },
  { key: 'myWork', path: 'my-work', labelKey: 'shell.nav.myWork', icon: 'inbox', workspaces: ALL },
  {
    // Chat (docs/chat-design.md §4.5): for every workspace, with an unread badge.
    key: 'chat',
    path: 'chat',
    labelKey: 'shell.nav.chat',
    icon: 'comment',
    module: 'chat',
    permission: 'chat:use',
    workspaces: ALL,
  },
  {
    key: 'standards',
    path: 'standards',
    labelKey: 'shell.nav.standards',
    icon: 'iso',
    module: 'standards',
    permission: 'standards:read',
    workspaces: ['lead', 'auditor'],
  },
  {
    key: 'registers',
    path: 'registers',
    labelKey: 'shell.nav.registers',
    icon: 'grid',
    workspaces: ['lead', 'auditor'],
  },
  {
    key: 'library',
    path: 'library',
    labelKey: 'shell.nav.library',
    icon: 'documents',
    permission: ['documents:read', 'reports:read'],
    workspaces: ALL,
  },
  {
    key: 'settings',
    path: SETTINGS_NAV_ITEM.path,
    labelKey: 'shell.nav.settings',
    icon: 'sliders',
    permission: SETTINGS_NAV_ITEM.permission,
    workspaces: ALL,
  },
];

/** A shortcut in the "Registrer" menu: one create form the user may open. */
export interface RegisterAction {
  readonly key: string;
  readonly path: string;
  readonly labelKey: string;
  readonly icon: string;
  readonly permission: string;
  readonly module?: string;
}

/**
 * The most common things to register (simplify-plan §3.1), each opening today's
 * create form. U05 replaces the menu with the quick "Hva vil du registrere?" dialog.
 */
export const REGISTER_ACTIONS: readonly RegisterAction[] = [
  {
    key: 'deviation',
    path: 'deviations/new',
    labelKey: 'shell.registrer.deviation',
    icon: 'alert',
    permission: 'deviations:write',
    module: 'deviations',
  },
  {
    key: 'breach',
    path: 'privacy/breaches/new',
    labelKey: 'shell.registrer.breach',
    icon: 'shield',
    permission: 'privacy:write',
    module: 'privacy',
  },
  {
    key: 'feedback',
    path: 'feedback/items/new',
    labelKey: 'shell.registrer.feedback',
    icon: 'smile',
    permission: 'feedback:write',
    module: 'feedback',
  },
  {
    key: 'risk',
    path: 'risk/risks/new',
    labelKey: 'shell.registrer.risk',
    icon: 'risk',
    permission: 'risk:write',
    module: 'risk',
  },
  {
    key: 'task',
    path: 'tasks/new',
    labelKey: 'shell.registrer.task',
    icon: 'checkcircle',
    permission: 'tasks:write',
  },
  {
    key: 'document',
    path: 'documents/new',
    labelKey: 'shell.registrer.document',
    icon: 'documents',
    permission: 'documents:draft',
    module: 'documents',
  },
  {
    key: 'customer',
    path: 'customers/new',
    labelKey: 'shell.registrer.customer',
    icon: 'building',
    permission: 'customers:write',
    module: 'customers',
  },
  {
    key: 'supplier',
    path: 'suppliers/new',
    labelKey: 'shell.registrer.supplier',
    icon: 'link',
    permission: 'suppliers:write',
    module: 'suppliers',
  },
];

/** Registre areas (simplify-plan §3.1), named after jobs, with the modules they hold. */
export interface RegisterGroup {
  readonly key: string;
  readonly labelKey: string;
  readonly modules: readonly string[];
}

export const REGISTER_GROUPS: readonly RegisterGroup[] = [
  {
    key: 'governance',
    labelKey: 'shell.groups.governance',
    modules: ['context', 'objectives', 'management_review', 'processes', 'projects'],
  },
  { key: 'risk', labelKey: 'shell.groups.risk', modules: ['risk', 'obligations'] },
  {
    key: 'improvement',
    labelKey: 'shell.groups.improvement',
    modules: ['deviations', 'inspections', 'audits', 'feedback'],
  },
  { key: 'customers', labelKey: 'shell.groups.customers', modules: ['customers'] },
  {
    key: 'suppliersAssets',
    labelKey: 'shell.groups.suppliersAssets',
    modules: ['suppliers', 'contracts', 'assets'],
  },
  {
    key: 'people',
    labelKey: 'shell.groups.people',
    modules: ['people', 'training', 'recruitment'],
  },
  { key: 'privacy', labelKey: 'shell.groups.privacy', modules: ['privacy'] },
  { key: 'ai', labelKey: 'shell.groups.ai', modules: ['ai_governance'] },
  { key: 'envHse', labelKey: 'shell.groups.envHse', modules: ['environment', 'hse'] },
  { key: 'continuity', labelKey: 'shell.groups.continuity', modules: ['continuity'] },
];

/**
 * Modules that "Dokumenter og rapporter" holds. Until the `/library` hub exists the
 * destination opens Documents and Registre lists both under this group, so no old
 * nav target is lost.
 */
export const LIBRARY_MODULES: readonly string[] = ['documents', 'reports'];
export const LIBRARY_GROUP: RegisterGroup = {
  key: 'library',
  labelKey: 'shell.groups.library',
  modules: LIBRARY_MODULES,
};

/** A register (or sub-register) that can be pinned to the menu. */
export interface PinTarget {
  readonly key: string;
  readonly path: string;
  readonly labelKey: string;
  /** Ready text from the locations registry; shown instead of `labelKey` (U04). */
  readonly label?: string;
  readonly icon: string;
  readonly module?: string;
  readonly permission?: string | readonly string[];
}

/**
 * Sub-registers the role defaults pin, so the menu can name them without a request.
 * Any other register pinned in Registre is named from the locations registry
 * (`RegisterCatalogService`, see {@link resolvePin}).
 */
const SUB_REGISTER_PINS: readonly PinTarget[] = [
  {
    key: 'privacy/ropa',
    path: 'privacy/ropa',
    labelKey: 'shell.pins.ropa',
    icon: 'shield',
    module: 'privacy',
    permission: 'privacy:read',
  },
  {
    key: 'privacy/breaches',
    path: 'privacy/breaches',
    labelKey: 'shell.pins.breaches',
    icon: 'alert',
    module: 'privacy',
    permission: 'privacy:read',
  },
  {
    key: 'hse/sja',
    path: 'hse/sja',
    labelKey: 'shell.pins.sja',
    icon: 'hardhat',
    module: 'hse',
    permission: 'hse:read',
  },
  {
    key: 'privacy/data-subject-requests',
    path: 'privacy/data-subject-requests',
    labelKey: 'shell.pins.requests',
    icon: 'shield',
    module: 'privacy',
    permission: 'privacy:read',
  },
  {
    key: 'privacy/processors',
    path: 'privacy/processors',
    labelKey: 'shell.pins.processors',
    icon: 'link',
    module: 'privacy',
    permission: 'privacy:read',
  },
  {
    key: 'risk/risks',
    path: 'risk/risks',
    labelKey: 'shell.pins.risks',
    icon: 'risk',
    module: 'risk',
    permission: 'risk:read',
  },
  {
    key: 'feedback/items',
    path: 'feedback/items',
    labelKey: 'shell.pins.feedback',
    icon: 'smile',
    module: 'feedback',
    permission: 'feedback:read',
  },
  {
    key: 'hse/ppe',
    path: 'hse/ppe',
    labelKey: 'shell.pins.ppe',
    icon: 'hardhat',
    module: 'hse',
    permission: 'hse:read',
  },
  {
    key: 'assets/access-reviews',
    path: 'assets/access-reviews',
    labelKey: 'shell.pins.accessReviews',
    icon: 'devices',
    module: 'assets',
    permission: 'assets:read',
  },
  {
    key: 'assets/changes',
    path: 'assets/changes',
    labelKey: 'shell.pins.changes',
    icon: 'devices',
    module: 'assets',
    permission: 'assets:read',
  },
  {
    key: 'recruitment/candidates',
    path: 'recruitment/candidates',
    labelKey: 'shell.pins.candidates',
    icon: 'userplus',
    module: 'recruitment',
    permission: 'recruitment:read',
  },
  {
    key: 'ai-governance/assessments',
    path: 'ai-governance/assessments',
    labelKey: 'shell.pins.aiAssessments',
    icon: 'spark',
    module: 'ai_governance',
    permission: 'ai_governance:read',
  },
  {
    key: 'audits/findings',
    path: 'audits/findings',
    labelKey: 'shell.pins.auditFindings',
    icon: 'audit',
    module: 'audits',
    permission: 'audits:read',
  },
];

function moduleTarget(item: NavItem & { readonly module: string }): PinTarget {
  return {
    key: item.path,
    path: item.path,
    labelKey: item.labelKey,
    icon: item.icon,
    module: item.module,
    permission: item.permission,
  };
}

/** Every pinnable target by key: one per module register, then the sub-registers. */
export const PIN_TARGETS: ReadonlyMap<string, PinTarget> = new Map(
  [...MODULE_NAV_ITEMS.map(moduleTarget), ...SUB_REGISTER_PINS].map((t) => [t.key, t]),
);

/**
 * Pins a role starts with (ia.md §4.3, extended with the registers each role works in
 * daily, U04); admins start clean with the seven destinations, and employees do not
 * get Registre. Every key must be in {@link PIN_TARGETS}.
 */
export const ROLE_DEFAULT_PINS: Readonly<Record<string, readonly string[]>> = {
  quality_manager: ['deviations', 'audits', 'risk/risks', 'feedback/items'],
  hse_manager: ['hse/sja', 'deviations', 'hse/ppe'],
  dpo: ['privacy/ropa', 'privacy/breaches', 'privacy/data-subject-requests', 'privacy/processors'],
  ciso: ['risk/risks', 'assets', 'assets/access-reviews', 'assets/changes'],
  hr_manager: ['people', 'training', 'recruitment/candidates'],
  ai_officer: ['ai-governance', 'ai-governance/assessments'],
  auditor: ['audits', 'audits/findings', 'deviations'],
};

/** The default pins of a member with these roles, in role order, without repeats. */
export function defaultPins(roles: readonly string[]): string[] {
  const pins = roles.flatMap((role) => ROLE_DEFAULT_PINS[role] ?? []);
  return [...new Set(pins)].slice(0, MAX_PINS);
}

/**
 * The pin target of a key: a known one, else a register named by the locations
 * registry (gated like its module), else null (unknown, or the names are not loaded).
 */
export function resolvePin(
  key: string,
  catalog: ReadonlyMap<string, RegisterEntry> | null,
): PinTarget | null {
  const known = PIN_TARGETS.get(key);
  if (known) {
    return known;
  }
  const entry = catalog?.get(key);
  if (!entry) {
    return null;
  }
  const item = MODULE_NAV_ITEMS.find((i) => i.module === entry.module);
  return {
    key,
    path: entry.path,
    labelKey: '',
    label: entry.title,
    icon: item?.icon ?? 'grid',
    module: item?.module,
    permission: item?.permission,
  };
}

/** Whether a module/permission-gated entry is open to the user in the current org. */
export function isAllowed(
  entry: { readonly module?: string; readonly permission?: string | readonly string[] },
  granted: readonly string[] | undefined,
  isEnabled: (module: string) => boolean,
): boolean {
  return (
    (!entry.module || isEnabled(entry.module)) &&
    (!entry.permission || hasAnyPermission(granted, entry.permission))
  );
}

/** Whether the authenticated shell has a direct child route `path` (e.g. `library`). */
export function hasShellRoute(config: readonly Route[], path: string): boolean {
  return config.some(
    (route) => route.path === '' && !!route.children?.some((child) => child.path === path),
  );
}

/** The Registre groups, with Documents and Reports as a group until `/library` exists. */
export function registerGroups(hasLibrary: boolean): readonly RegisterGroup[] {
  return hasLibrary ? REGISTER_GROUPS : [...REGISTER_GROUPS, LIBRARY_GROUP];
}
