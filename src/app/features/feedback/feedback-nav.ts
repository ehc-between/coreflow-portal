import { ModuleNavItem } from '../../shared/ui/module-nav/module-nav';

/**
 * The module's sub-pages (under the page header, `app-module-nav`): the register
 * (feedback and survey answers, with its statistics as a band) and the surveys.
 */
export const FEEDBACK_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'feedback.tabs.register', link: '/feedback', exact: true, testId: 'nav-register' },
  { labelKey: 'feedback.tabs.surveys', link: '/feedback/surveys', testId: 'nav-surveys' },
];

/** The gear in the page header: the module settings (response times, privacy notice). */
export const FEEDBACK_SETTINGS_LINK = '/settings/modules/feedback';
