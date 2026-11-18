import { Route } from '@angular/router';

/**
 * U10: module configuration (types, templates, matrices, questionnaires, intake
 * channel, module settings) lives under `/settings/modules/<slug>/…`, never on a
 * daily module page. Module pages keep only the gear in their page header, which
 * points here. The old module-local URLs redirect (see {@link moduleConfigRedirect}).
 */
export const MODULE_CONFIG_BASE = '/settings/modules';

/** One configuration page of a module (`path` is relative to the module's area). */
export interface ModuleConfigPage {
  /** '' for a module whose configuration is one page. */
  readonly path: string;
  /** Root i18n key (`settings.hub.moduleLinks.*`). */
  readonly labelKey: string;
}

/** A module's configuration area under `/settings/modules/<slug>`. */
export interface ModuleConfigArea {
  /** Backend module key (`modules.names.<module>`, `<module>:read`). */
  readonly module: string;
  /** URL segment, the same as the module's own route. */
  readonly slug: string;
  readonly icon: string;
  readonly pages: readonly ModuleConfigPage[];
}

/** Every module that has configuration, in settings-hub order. */
export const MODULE_CONFIG_AREAS: readonly ModuleConfigArea[] = [
  {
    module: 'documents',
    slug: 'documents',
    icon: 'documents',
    pages: [
      { path: 'types', labelKey: 'settings.hub.moduleLinks.types' },
      { path: 'templates', labelKey: 'settings.hub.moduleLinks.templates' },
      { path: 'retention', labelKey: 'settings.hub.moduleLinks.retention' },
    ],
  },
  {
    module: 'deviations',
    slug: 'deviations',
    icon: 'alert',
    pages: [
      { path: 'types', labelKey: 'settings.hub.moduleLinks.types' },
      { path: 'templates', labelKey: 'settings.hub.moduleLinks.templates' },
      { path: 'intake', labelKey: 'settings.hub.moduleLinks.intake' },
    ],
  },
  {
    module: 'inspections',
    slug: 'inspections',
    icon: 'checkcircle',
    pages: [{ path: 'templates', labelKey: 'settings.hub.moduleLinks.checklists' }],
  },
  {
    module: 'risk',
    slug: 'risk',
    icon: 'risk',
    pages: [
      { path: 'matrices', labelKey: 'settings.hub.moduleLinks.matrices' },
      { path: 'registers', labelKey: 'settings.hub.moduleLinks.riskRegisters' },
    ],
  },
  {
    module: 'management_review',
    slug: 'management-review',
    icon: 'calendar',
    pages: [{ path: '', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
  {
    module: 'contracts',
    slug: 'contracts',
    icon: 'contract',
    pages: [{ path: '', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
  {
    module: 'environment',
    slug: 'environment',
    icon: 'leaf',
    pages: [{ path: '', labelKey: 'settings.hub.moduleLinks.significanceMethod' }],
  },
  {
    module: 'suppliers',
    slug: 'suppliers',
    icon: 'link',
    pages: [{ path: 'questionnaires', labelKey: 'settings.hub.moduleLinks.questionnaires' }],
  },
  {
    module: 'people',
    slug: 'people',
    icon: 'people',
    pages: [{ path: '', labelKey: 'settings.hub.moduleLinks.peopleChecklists' }],
  },
  {
    module: 'recruitment',
    slug: 'recruitment',
    icon: 'userplus',
    pages: [{ path: '', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
  {
    module: 'feedback',
    slug: 'feedback',
    icon: 'smile',
    pages: [{ path: '', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
  {
    module: 'ai_governance',
    slug: 'ai-governance',
    icon: 'spark',
    pages: [{ path: '', labelKey: 'settings.hub.moduleLinks.settings' }],
  },
  {
    module: 'privacy',
    slug: 'privacy',
    icon: 'shield',
    pages: [{ path: '', labelKey: 'settings.hub.moduleLinks.privacyContacts' }],
  },
];

/** The configuration area of a backend module key, if it has one. */
export function moduleConfigArea(module: string): ModuleConfigArea | undefined {
  return MODULE_CONFIG_AREAS.find((area) => area.module === module);
}

/**
 * The URL of a module's configuration: `moduleConfigLink('risk')` is the area (its
 * first page), `moduleConfigLink('risk', 'matrices', id)` a page or record in it.
 */
export function moduleConfigLink(slug: string, ...rest: readonly (string | number)[]): string {
  const tail = rest.filter((part) => part !== '').map(String);
  return [MODULE_CONFIG_BASE, slug, ...tail].join('/');
}

/**
 * The first breadcrumbs of a module configuration page: Settings › Module. The
 * module crumb has no link (its area has no page of its own); the page adds itself.
 */
export function moduleConfigCrumbs(
  module: string,
): readonly [{ labelKey: string; link: string }, { labelKey: string }] {
  return [{ labelKey: 'nav.settings', link: '/settings' }, { labelKey: `modules.names.${module}` }];
}

/**
 * A redirect from an old module-local configuration URL to its new home, for the
 * module's own routes file: `moduleConfigRedirect('matrices/:id', 'risk', 'matrices/:id')`.
 * Route params are carried over by name; query params and the fragment are kept.
 */
export function moduleConfigRedirect(path: string, slug: string, target = path): Route {
  return { path, pathMatch: 'full', redirectTo: moduleConfigLink(slug, target) };
}
