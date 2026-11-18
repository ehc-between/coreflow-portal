import { ModuleNavItem } from '../../shared/ui/module-nav/module-nav';

/** The module's sub-pages (under the page header, `app-module-nav`). */
export const FEEDBACK_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'feedback.tabs.register', link: '/feedback', exact: true, testId: 'nav-register' },
  { labelKey: 'feedback.tabs.surveys', link: '/feedback/surveys', testId: 'nav-surveys' },
  { labelKey: 'feedback.tabs.insights', link: '/feedback/insights', testId: 'nav-insights' },
];

/** The gear in the page header: the module settings (response times, privacy notice). */
export const FEEDBACK_SETTINGS_LINK = '/feedback/settings';
