import { Component, input, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import routes from './standards.routes';

/** Stands in for the lazy pages so the real routing config can be exercised. */
@Component({ template: '' })
class PageStub {
  readonly key = input<string>();
  readonly number = input<string>();
  readonly req = input<string>();
}

const testRoutes: Route[] = routes.map((route) =>
  route.loadComponent ? { ...route, loadComponent: () => PageStub } : route,
);

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: 'standards', children: testRoutes }], withComponentInputBinding()),
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
});
