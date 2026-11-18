import { ModuleNavItem } from '../../shared/ui/module-nav/module-nav';

/** The module's sub-pages, shown as `app-module-nav` under every page header. */
export const CONTEXT_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'context.nav.overview', link: '/context', exact: true },
  { labelKey: 'context.nav.analyses', link: '/context/analyses' },
  { labelKey: 'context.nav.parties', link: '/context/interested-parties' },
  { labelKey: 'context.nav.scopes', link: '/context/scopes' },
  { labelKey: 'context.nav.policies', link: '/context/policies' },
  { labelKey: 'context.nav.responsibilities', link: '/context/responsibilities' },
];

/** The module root as the first breadcrumb (= nav label = module h1). */
export const CONTEXT_ROOT_CRUMB = { labelKey: 'modules.names.context', link: '/context' } as const;
