import { Routes } from '@angular/router';
import { NAV_ITEMS } from '../../layout/nav';

/**
 * Routes for a module whose feature isn't built yet: the shared placeholder,
 * titled `titleKey` (its nav label) and carrying the nav item's agent context.
 * Each module path has a stub `<path>.routes.ts` exporting this; the module's
 * own branch later replaces only that stub's content.
 */
export function modulePlaceholderRoutes(titleKey: string): Routes {
  const item = NAV_ITEMS.find((nav) => nav.labelKey === titleKey);
  return [
    {
      path: '',
      loadComponent: () => import('./module-placeholder').then((m) => m.ModulePlaceholder),
      data: {
        titleKey,
        ...(item?.agentName ? { agentName: item.agentName } : {}),
        ...(item?.agentRole ? { agentRole: item.agentRole } : {}),
      },
    },
  ];
}
