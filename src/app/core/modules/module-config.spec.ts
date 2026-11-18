import { Route, Routes } from '@angular/router';
import aiGovernanceRoutes from '../../features/ai-governance/ai-governance.routes';
import { AI_GOV_NAV_ITEMS } from '../../features/ai-governance/ui/ai-nav';
import contractsRoutes from '../../features/contracts/contracts.routes';
import { CONTRACTS_NAV } from '../../features/contracts/contracts-nav';
import deviationsRoutes from '../../features/deviations/deviations.routes';
import { deviationsNav } from '../../features/deviations/deviation-display';
import documentsRoutes from '../../features/documents/documents.routes';
import { DOCUMENTS_NAV } from '../../features/documents/shared/documents-nav';
import environmentRoutes from '../../features/environment/environment.routes';
import { envNav } from '../../features/environment/environment-shared';
import feedbackRoutes from '../../features/feedback/feedback.routes';
import { FEEDBACK_NAV } from '../../features/feedback/feedback-nav';
import { INSPECTIONS_NAV } from '../../features/inspections/data/inspection-display';
import inspectionsRoutes from '../../features/inspections/inspections.routes';
import { MR_NAV } from '../../features/management-review/management-review-display';
import managementReviewRoutes from '../../features/management-review/management-review.routes';
import moduleConfigRoutes from '../../features/org-settings/module-config.routes';
import { MODULE_SETTINGS_CARDS } from '../../features/org-settings/settings-links/settings-links';
import { PEOPLE_NAV } from '../../features/people/ui/people-nav';
import peopleRoutes from '../../features/people/people.routes';
import privacyRoutes from '../../features/privacy/privacy.routes';
import recruitmentRoutes from '../../features/recruitment/recruitment.routes';
import { recruitmentNavItems } from '../../features/recruitment/shared/recruitment-nav';
import riskRoutes from '../../features/risk/risk.routes';
import { RISK_NAV_ITEMS } from '../../features/risk/shared/risk-nav';
import { suppliersNav } from '../../features/suppliers/shared/suppliers-nav';
import suppliersRoutes from '../../features/suppliers/suppliers.routes';
import {
  MODULE_CONFIG_AREAS,
  MODULE_CONFIG_BASE,
  moduleConfigArea,
  moduleConfigCrumbs,
  moduleConfigLink,
  moduleConfigRedirect,
} from './module-config';

/** Every route of a routes file, flattened (children included). */
function flatten(routes: readonly Route[]): Route[] {
  return routes.flatMap((r) => [r, ...flatten(r.children ?? [])]);
}

/** The module's configuration routes, loaded through `/settings/modules/<slug>`. */
async function configRoutes(slug: string): Promise<Routes> {
  const area = (moduleConfigRoutes as Routes).find((r) => r.path === slug);
  if (!area?.loadChildren) throw new Error(`no configuration area for ${slug}`);
  const loaded = (await area.loadChildren()) as { default: Routes };
  return loaded.default;
}

/** The old module-local URL (`/risk/matrices/:id`) and where it must now land. */
const OLD_URLS: readonly [Routes, string, string, string][] = [
  [riskRoutes, 'risk', 'matrices', 'matrices'],
  [riskRoutes, 'risk', 'matrices/new', 'matrices/new'],
  [riskRoutes, 'risk', 'matrices/:id', 'matrices/:id'],
  [riskRoutes, 'risk', 'registers', 'registers'],
  [riskRoutes, 'risk', 'registers/:id', 'registers/:id'],
  [deviationsRoutes, 'deviations', 'types', 'types'],
  [deviationsRoutes, 'deviations', 'types/new', 'types/new'],
  [deviationsRoutes, 'deviations', 'types/:id', 'types/:id'],
  [deviationsRoutes, 'deviations', 'templates', 'templates'],
  [deviationsRoutes, 'deviations', 'intake/settings', 'intake'],
  [documentsRoutes, 'documents', 'types', 'types'],
  [documentsRoutes, 'documents', 'types/new', 'types/new'],
  [documentsRoutes, 'documents', 'types/:id', 'types/:id'],
  [documentsRoutes, 'documents', 'templates', 'templates'],
  [documentsRoutes, 'documents', 'templates/new', 'templates/new'],
  [documentsRoutes, 'documents', 'templates/:id', 'templates/:id'],
  [documentsRoutes, 'documents', 'retention', 'retention'],
  [documentsRoutes, 'documents', 'retention/new', 'retention/new'],
  [documentsRoutes, 'documents', 'retention/:id', 'retention/:id'],
  [inspectionsRoutes, 'inspections', 'templates', 'templates'],
  [inspectionsRoutes, 'inspections', 'templates/library', 'templates/library'],
  [inspectionsRoutes, 'inspections', 'templates/new', 'templates/new'],
  [inspectionsRoutes, 'inspections', 'templates/:id', 'templates/:id'],
  [inspectionsRoutes, 'inspections', 'templates/:id/edit', 'templates/:id/edit'],
  [suppliersRoutes, 'suppliers', 'questionnaires', 'questionnaires'],
  [suppliersRoutes, 'suppliers', 'questionnaires/new', 'questionnaires/new'],
  [suppliersRoutes, 'suppliers', 'questionnaires/:qid/edit', 'questionnaires/:qid/edit'],
  [peopleRoutes, 'people', 'settings', ''],
  [recruitmentRoutes, 'recruitment', 'settings', ''],
  [aiGovernanceRoutes, 'ai-governance', 'settings', ''],
  [contractsRoutes, 'contracts', 'settings', ''],
  [feedbackRoutes, 'feedback', 'settings', ''],
  [managementReviewRoutes, 'management-review', 'settings', ''],
  [privacyRoutes, 'privacy', 'settings', ''],
  [environmentRoutes, 'environment', 'scoring', ''],
];

describe('module configuration (U10)', () => {
  it('builds links and redirects under /settings/modules', () => {
    expect(moduleConfigLink('risk')).toBe('/settings/modules/risk');
    expect(moduleConfigLink('risk', '')).toBe('/settings/modules/risk');
    expect(moduleConfigLink('risk', 'matrices', 7)).toBe('/settings/modules/risk/matrices/7');
    expect(moduleConfigRedirect('matrices/:id', 'risk')).toEqual({
      path: 'matrices/:id',
      pathMatch: 'full',
      redirectTo: '/settings/modules/risk/matrices/:id',
    });
    expect(moduleConfigCrumbs('risk')).toEqual([
      { labelKey: 'nav.settings', link: '/settings' },
      { labelKey: 'modules.names.risk' },
    ]);
    expect(moduleConfigArea('management_review')?.slug).toBe('management-review');
    expect(moduleConfigArea('tasks')).toBeUndefined();
  });

  it('mounts one guarded area per module, and every page of it exists', async () => {
    const mounted = (moduleConfigRoutes as Routes).map((r) => r.path);
    for (const area of MODULE_CONFIG_AREAS) {
      expect(mounted).toContain(area.slug);
      const route = (moduleConfigRoutes as Routes).find((r) => r.path === area.slug)!;
      expect(route.canActivate?.length).toBe(2);
      const paths = flatten(await configRoutes(area.slug)).map((r) => r.path);
      for (const page of area.pages) {
        expect(paths).toContain(page.path);
      }
    }
  });

  it('redirects every old configuration URL to a page that exists', async () => {
    for (const [routes, slug, oldPath, target] of OLD_URLS) {
      const redirect = flatten(routes).find((r) => r.path === oldPath);
      expect(redirect?.redirectTo, `/${slug}/${oldPath}`).toBe(moduleConfigLink(slug, target));
      expect(redirect?.loadComponent).toBeUndefined();
      const paths = flatten(await configRoutes(slug)).map((r) => r.path);
      expect(paths, `${slug}/${target}`).toContain(target);
    }
  });

  it('keeps configuration out of the module tabs', () => {
    const navs = [
      RISK_NAV_ITEMS,
      DOCUMENTS_NAV,
      INSPECTIONS_NAV,
      suppliersNav(3),
      AI_GOV_NAV_ITEMS,
      recruitmentNavItems(),
      envNav(),
      PEOPLE_NAV,
      FEEDBACK_NAV,
      CONTRACTS_NAV,
      MR_NAV,
      deviationsNav({ intake: true, newReports: 2 }),
    ];
    const configSegment =
      /\/(settings|types|templates|retention|matrices|registers|questionnaires|scoring)(\/|$)/;
    for (const nav of navs) {
      for (const item of nav) {
        const link = Array.isArray(item.link) ? item.link.join('/') : String(item.link);
        expect(link, link).not.toMatch(configSegment);
      }
    }
  });

  it('links every hub module card to its configuration area', () => {
    for (const card of MODULE_SETTINGS_CARDS) {
      if (card.module === 'reports') continue;
      for (const link of card.links) {
        expect(link.path.startsWith(`${MODULE_CONFIG_BASE}/`)).toBe(true);
      }
    }
    expect(MODULE_SETTINGS_CARDS.find((c) => c.module === 'risk')?.links[0].path).toBe(
      '/settings/modules/risk/matrices',
    );
  });
});
