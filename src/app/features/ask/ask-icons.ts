import { MODULE_NAV_ITEMS } from '../../layout/nav';
import { entityTypeIcon } from '../../core/search/entity-label';

const MODULE_ICONS: ReadonlyMap<string, string> = new Map(
  MODULE_NAV_ITEMS.map((item) => [item.module, item.icon]),
);

const MODULE_BY_PATH: ReadonlyMap<string, string> = new Map(
  MODULE_NAV_ITEMS.map((item) => [item.path.split('/')[0], item.module]),
);

/**
 * The module a portal url belongs to, from its first path segment
 * (`/ai-governance/systems/…` → `ai_governance`), or null.
 */
export function moduleFromUrl(url: string | null | undefined): string | null {
  if (!url?.startsWith('/')) {
    return null;
  }
  const segment = url.split(/[?#]/)[0].split('/').filter(Boolean)[0];
  return (segment && MODULE_BY_PATH.get(segment)) || null;
}

/** The nav icon of a module (so a record looks like its module everywhere), or null. */
export function moduleIcon(module: string | null | undefined): string | null {
  return (module && MODULE_ICONS.get(module)) || null;
}

/**
 * The icon of a record: its module's nav icon when the module is known, else the
 * built-in per-type icon (documents, deviations, requirements, …).
 */
export function recordIcon(entityType: string, module?: string | null): string {
  const builtin = entityTypeIcon(entityType);
  if (builtin !== 'link') {
    return builtin;
  }
  return moduleIcon(module) ?? builtin;
}
