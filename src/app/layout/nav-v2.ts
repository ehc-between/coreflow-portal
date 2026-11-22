import { hasAnyPermission } from '../core/auth/permission';
import { RegisterEntry } from '../core/registers/register-catalog.service';
import { MAX_PINS } from '../core/shell/shell-preferences.models';
import { MODULE_NAV_ITEMS, NavItem } from './nav';

/**
 * Register pins (U04), used by the Registre hub (`features/registers`). Shell v2's
 * seven-destination menu that this file once held was retired by IA v2 (decision D7:
 * the top menu in `areas.ts` replaces it); only the pin data the hub still reads stays.
 * Labels live in the `shell` Transloco scope (`shell.pins.*`) and the global
 * `modules.names.*`.
 */

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
