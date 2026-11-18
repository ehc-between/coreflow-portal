import { ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';

/** The sub-areas of People, shown as `app-module-nav` under every page header. */
export const PEOPLE_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'people.sections.employees', link: '/people/employees', testId: 'section-employees' },
  { labelKey: 'people.sections.positions', link: '/people/positions', testId: 'section-positions' },
  {
    labelKey: 'people.sections.competences',
    link: '/people/competences',
    testId: 'section-competences',
  },
  { labelKey: 'people.sections.matrix', link: '/people/matrix', testId: 'section-matrix' },
  {
    labelKey: 'people.sections.checklists',
    link: '/people/checklists',
    testId: 'section-checklists',
  },
];

/** The module root breadcrumb (= nav label = h1 of the register). */
export const PEOPLE_ROOT = { labelKey: 'modules.names.people', link: '/people' } as const;

/** Gear link of every People page: the organisation's checklist templates. */
export const PEOPLE_SETTINGS_LINK = '/people/settings';
