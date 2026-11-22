/**
 * The information architecture (IA v2, docs/ia-v2.md §2 and §4.2): nine areas in the
 * top menu, each with a dropdown of sub-areas. This file is the single source of the
 * IA: the top menu, active-area highlighting and the area smoke test all read it.
 *
 * Clicking an area's label opens its overview page (`path`); the dropdown items go
 * straight to sub-areas. Module and permission keys mirror the guards of the target
 * route, so an item is never shown that would bounce the user.
 */

export type AreaKey =
  | 'home'
  | 'speakUp'
  | 'annual'
  | 'company'
  | 'people'
  | 'contacts'
  | 'handbook'
  | 'documents'
  | 'reports';

export interface AreaLink {
  /** Stable id, e.g. 'cases'. */
  readonly key: string;
  /** Router path, may include `?query` (parsed with `Router.parseUrl`). */
  readonly path: string;
  /** Global i18n: `nav.areas.<area>.items.<key>.label`. */
  readonly labelKey: string;
  /** The grey line under the label in the dropdown: `… .hint`. */
  readonly hintKey: string;
  /** Hidden unless the module (any of them, for a list) is enabled. */
  readonly module?: string | readonly string[];
  /** Hidden unless the user holds ANY of these permissions. */
  readonly permission?: string | readonly string[];
  /** Only for superusers. */
  readonly superuser?: boolean;
}

export interface AreaDef {
  readonly key: AreaKey;
  /** The overview route. */
  readonly path: string;
  /** `nav.areas.<key>.label`. */
  readonly labelKey: string;
  /** URL prefixes that belong to the area (§2.1); the longest match wins. */
  readonly prefixes: readonly string[];
  /** The dropdown (empty for Oversikt). */
  readonly items: readonly AreaLink[];
  /** Dynamic items appended after the static ones (Håndbok: one per process). */
  readonly dynamicItems?: 'processes';
  /**
   * The overview route's own gate. Only Håndbok has one (it is entirely the processes
   * module, D15); every other overview is open to all members.
   */
  readonly overview?: { readonly module: string; readonly permission: string };
}

function item(
  area: AreaKey,
  key: string,
  path: string,
  gate: Pick<AreaLink, 'module' | 'permission' | 'superuser'> = {},
): AreaLink {
  return {
    key,
    path,
    labelKey: `nav.areas.${area}.items.${key}.label`,
    hintKey: `nav.areas.${area}.items.${key}.hint`,
    ...gate,
  };
}

/** A module page gated like `moduleRoute()` in app.routes: module on + `<module>:read`. */
function mod(module: string): Pick<AreaLink, 'module' | 'permission'> {
  return { module, permission: `${module}:read` };
}

const TOPIC_MODULES = ['privacy', 'assets', 'ai_governance', 'environment', 'continuity'];

export const AREAS: readonly AreaDef[] = [
  {
    key: 'home',
    path: '/home',
    labelKey: 'nav.areas.home.label',
    prefixes: ['/home', '/dashboard', '/my-work', '/tasks', '/review', '/chat', '/setup'],
    items: [],
  },
  {
    key: 'speakUp',
    path: '/speak-up',
    labelKey: 'nav.areas.speakUp.label',
    prefixes: ['/speak-up', '/cases', '/deviations', '/privacy/breaches', '/feedback/items'],
    items: [
      item('speakUp', 'report', '/speak-up'),
      item('speakUp', 'cases', '/cases'),
      item('speakUp', 'myCases', '/cases?tab=mine'),
      item('speakUp', 'actions', '/deviations/actions', mod('deviations')),
      item('speakUp', 'intake', '/deviations/intake', {
        module: 'deviations',
        permission: 'deviations:intake',
      }),
    ],
  },
  {
    key: 'annual',
    path: '/annual-cycle',
    labelKey: 'nav.areas.annual.label',
    prefixes: [
      '/annual-cycle',
      '/audits',
      '/inspections',
      '/management-review',
      '/tasks/recurring',
    ],
    items: [
      item('annual', 'cycle', '/annual-cycle'),
      item('annual', 'audits', '/audits', mod('audits')),
      item('annual', 'inspections', '/inspections', mod('inspections')),
      item('annual', 'managementReview', '/management-review', mod('management_review')),
      item('annual', 'recurring', '/tasks/recurring', { permission: 'tasks:read' }),
    ],
  },
  {
    key: 'company',
    path: '/company',
    labelKey: 'nav.areas.company.label',
    prefixes: [
      '/company',
      '/context',
      '/objectives',
      '/risk',
      '/obligations',
      '/projects',
      '/privacy',
      '/ai-governance',
      '/environment',
      '/continuity',
      '/assets',
    ],
    items: [
      item('company', 'interestedParties', '/context/interested-parties', mod('context')),
      item('company', 'policies', '/context/policies', mod('context')),
      item('company', 'responsibilities', '/context/responsibilities', mod('context')),
      item('company', 'objectives', '/objectives', mod('objectives')),
      item('company', 'risk', '/risk', mod('risk')),
      item('company', 'obligations', '/obligations', mod('obligations')),
      item('company', 'scope', '/context/scopes', mod('context')),
      item('company', 'projects', '/projects', mod('projects')),
      item('company', 'topics', '/company/topics', {
        module: TOPIC_MODULES,
        permission: TOPIC_MODULES.map((m) => `${m}:read`),
      }),
    ],
  },
  {
    key: 'people',
    path: '/people',
    labelKey: 'nav.areas.people.label',
    prefixes: ['/people', '/training', '/recruitment', '/hse', '/assets/access-reviews'],
    items: [
      item('people', 'employees', '/people/employees', mod('people')),
      item('people', 'training', '/training', mod('training')),
      item('people', 'competences', '/people/competences', mod('people')),
      item('people', 'recruitment', '/recruitment', mod('recruitment')),
      item('people', 'hse', '/hse', mod('hse')),
      item('people', 'access', '/assets/access-reviews', mod('assets')),
    ],
  },
  {
    key: 'contacts',
    path: '/contacts',
    labelKey: 'nav.areas.contacts.label',
    prefixes: [
      '/contacts',
      '/customers',
      '/suppliers',
      '/contracts',
      '/privacy/processors',
      '/feedback',
    ],
    items: [
      item('contacts', 'customers', '/contacts?tab=customers', mod('customers')),
      item('contacts', 'suppliers', '/contacts?tab=suppliers', mod('suppliers')),
      item('contacts', 'processors', '/contacts?tab=processors', mod('privacy')),
      item('contacts', 'agreements', '/contacts?tab=agreements', mod('contracts')),
      item('contacts', 'surveys', '/feedback', mod('feedback')),
    ],
  },
  {
    key: 'handbook',
    path: '/handbook',
    labelKey: 'nav.areas.handbook.label',
    prefixes: ['/handbook', '/processes'],
    overview: { module: 'processes', permission: 'processes:read' },
    items: [
      item('handbook', 'map', '/handbook', mod('processes')),
      item('handbook', 'procedures', '/handbook?tab=procedures', mod('processes')),
    ],
    dynamicItems: 'processes',
  },
  {
    key: 'documents',
    path: '/documents',
    labelKey: 'nav.areas.documents.label',
    prefixes: ['/documents'],
    items: [
      item('documents', 'policies', '/documents/all?kind=policy', mod('documents')),
      item('documents', 'plans', '/documents/all?kind=plan', mod('documents')),
      item('documents', 'templates', '/documents/templates', mod('documents')),
      item('documents', 'external', '/documents/external', mod('documents')),
      item('documents', 'archive', '/documents/archive', mod('documents')),
      item('documents', 'waiting', '/documents/read-confirm', mod('documents')),
    ],
  },
  {
    key: 'reports',
    path: '/reports',
    labelKey: 'nav.areas.reports.label',
    prefixes: ['/reports', '/library', '/registers', '/standards'],
    items: [
      item('reports', 'auditor', '/reports?to=auditor'),
      item('reports', 'authority', '/reports?to=authority'),
      item('reports', 'board', '/reports?to=board'),
      item('reports', 'people', '/reports?to=people'),
      item('reports', 'standards', '/standards', mod('standards')),
    ],
  },
];

/** What decides visibility: enabled modules, granted permissions, superuser. */
export interface AreaContext {
  readonly isEnabled: (module: string) => boolean;
  readonly permissions: readonly string[];
  readonly superuser: boolean;
}

function anyOf<T>(value: T | readonly T[], test: (v: T) => boolean): boolean {
  return (Array.isArray(value) ? (value as readonly T[]) : [value as T]).some(test);
}

/** Whether one dropdown item is available to the user (module on, permission held). */
export function itemVisible(link: AreaLink, ctx: AreaContext): boolean {
  if (link.superuser && !ctx.superuser) {
    return false;
  }
  if (link.module && !anyOf(link.module, ctx.isEnabled)) {
    return false;
  }
  if (link.permission && !anyOf(link.permission, (p) => ctx.permissions.includes(p))) {
    return false;
  }
  return true;
}

/**
 * The areas and items the user can see (§4.2). Items need their module(s) enabled and
 * one of their permissions. An area stays visible while its overview route is open to
 * the user (all but Håndbok, whose overview is the processes module) or while any of
 * its items is visible, so an enabled area never vanishes.
 */
export function visibleAreas(areas: readonly AreaDef[], ctx: AreaContext): AreaDef[] {
  const out: AreaDef[] = [];
  for (const area of areas) {
    const items = area.items.filter((i) => itemVisible(i, ctx));
    const overviewOpen =
      !area.overview ||
      (ctx.isEnabled(area.overview.module) && ctx.permissions.includes(area.overview.permission));
    if (overviewOpen || items.length > 0) {
      out.push({ ...area, items });
    }
  }
  return out;
}

/** The URL's path without query or fragment, with a leading slash. */
export function cleanPath(url: string): string {
  const path = url.split(/[?#]/)[0];
  return path.startsWith('/') ? path : `/${path}`;
}

/** Whether `path` is `prefix` or below it (segment-wise: `/people` ≠ `/peoplex`). */
function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The area a URL belongs to (§2.1): the one with the longest matching prefix, or null
 * for pages outside the areas (settings, account, admin, no-access).
 */
export function activeAreaKey(url: string, areas: readonly AreaDef[] = AREAS): AreaKey | null {
  const path = cleanPath(url);
  let best: AreaKey | null = null;
  let bestLength = -1;
  for (const area of areas) {
    for (const prefix of area.prefixes) {
      if (under(path, prefix) && prefix.length > bestLength) {
        best = area.key;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}
