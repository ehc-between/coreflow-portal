import { ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';

/**
 * The suppliers module's sub-pages for `app-module-nav` (register, evaluations,
 * questionnaires). `openEvaluations` adds the count of open evaluations to that tab.
 */
export function suppliersNav(openEvaluations?: number | null): readonly ModuleNavItem[] {
  return [
    { labelKey: 'suppliers.nav.register', link: '/suppliers', exact: true },
    {
      labelKey: 'suppliers.nav.evaluations',
      link: '/suppliers/evaluations',
      ...(openEvaluations ? { count: openEvaluations } : {}),
    },
    { labelKey: 'suppliers.nav.questionnaires', link: '/suppliers/questionnaires' },
  ];
}
