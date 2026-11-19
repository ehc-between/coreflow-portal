import { Component, input, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import riskRoutes from '../risk/risk.routes';
import routes from './standards.routes';

/** Stands in for the lazy pages so the real routing config can be exercised. */
@Component({ template: '' })
class PageStub {
  readonly key = input<string>();
  readonly number = input<string>();
  readonly req = input<string>();
  readonly control = input<string>();
}

function stub(list: readonly Route[]): Route[] {
  return list.map((route) => ({
    ...route,
    ...(route.loadComponent ? { loadComponent: () => PageStub } : {}),
    // Module / permission guards need the app's services; the routing is under test.
    ...(route.canActivate ? { canActivate: [] } : {}),
    ...(route.children ? { children: stub(route.children) } : {}),
  }));
}

const testRoutes: Route[] = stub(routes);

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter(
        [
          { path: 'standards', children: testRoutes },
          { path: 'risk', children: stub(riskRoutes) },
        ],
        withComponentInputBinding(),
      ),
    ],
  });
  const harness = await RouterTestingHarness.create();
  const router = TestBed.inject(Router);
  return { harness, router };
}

describe('standards routes', () => {
  it('redirects the old clause page into the workspace, keeping ?req=', async () => {
    const { harness, router } = await setup();
    const page = await harness.navigateByUrl(
      '/standards/iso27001-2022/clauses/A.5.1?req=r1',
      PageStub,
    );
    expect(router.url).toBe('/standards/iso27001-2022/A.5.1?req=r1');
    expect(page.key()).toBe('iso27001-2022');
    expect(page.number()).toBe('A.5.1');
    expect(page.req()).toBe('r1');
  });

  it('redirects the old clause list without a number to the top of the workspace', async () => {
    const { harness, router } = await setup();
    const page = await harness.navigateByUrl('/standards/iso9001/clauses', PageStub);
    expect(router.url).toBe('/standards/iso9001');
    expect(page.key()).toBe('iso9001');
    expect(page.number()).toBeUndefined();
  });

  it('opens the readiness page instead of a workspace for a standard named "readiness"', async () => {
    const { harness, router } = await setup();
    const page = await harness.navigateByUrl('/standards/readiness', PageStub);
    expect(router.url).toBe('/standards/readiness');
    expect(page.key()).toBeUndefined();
  });

  it('opens the workspace at the top or at a section with one route', async () => {
    const { harness, router } = await setup();
    const top = await harness.navigateByUrl('/standards/iso9001', PageStub);
    expect(top.key()).toBe('iso9001');
    expect(top.number()).toBeUndefined();

    const section = await harness.navigateByUrl('/standards/iso9001/7.5', PageStub);
    expect(router.url).toBe('/standards/iso9001/7.5');
    expect(section.number()).toBe('7.5');
    // Same route config: moving between sections reuses the component.
    expect(section).toBe(top);
  });

  it('opens the SoA on the standard page and redirects the old risk URLs (U17)', async () => {
    const { harness, router } = await setup();
    const page = await harness.navigateByUrl('/risk/soa/iso27001-2022?control=A.5.15', PageStub);
    expect(router.url).toBe('/standards/iso27001-2022/soa?control=A.5.15');
    expect(page.key()).toBe('iso27001-2022');
    expect(page.number()).toBeUndefined();
    expect(page.control()).toBe('A.5.15');
    await harness.navigateByUrl('/risk/soa');
    expect(router.url).toBe('/standards/soa');
  });
});
