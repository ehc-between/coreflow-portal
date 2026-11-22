import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

describe('library.routes redirects', () => {
  function setup(): Router {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'library', loadChildren: () => import('./library.routes') },
          { path: 'reports/custom', children: [] },
          { path: 'reports/custom/new', children: [] },
          { path: 'reports/custom/:id', children: [] },
          { path: 'reports/custom/:id/edit', children: [] },
          { path: 'reports/exports', children: [] },
          { path: 'reports/audit-packs', children: [] },
          { path: 'reports/audit-packs/:id', children: [] },
        ]),
      ],
    });
    return TestBed.inject(Router);
  }

  it('sends old saved-report URLs to Egne rapporter, keeping /edit and the query', async () => {
    const router = setup();
    await router.navigateByUrl('/library/reports');
    expect(router.url).toBe('/reports/custom');
    await router.navigateByUrl('/library/reports/new?register=x');
    expect(router.url).toBe('/reports/custom/new?register=x');
    await router.navigateByUrl('/library/reports/d1');
    expect(router.url).toBe('/reports/custom/d1');
    await router.navigateByUrl('/library/reports/d1/edit');
    expect(router.url).toBe('/reports/custom/d1/edit');
  });

  it('sends register export and audit packs under /reports', async () => {
    const router = setup();
    await router.navigateByUrl('/library/registers?register=deviations');
    expect(router.url).toBe('/reports/exports?register=deviations');
    await router.navigateByUrl('/library/audit-packs?flow=t');
    expect(router.url).toBe('/reports/audit-packs?flow=t');
    await router.navigateByUrl('/library/audit-packs/p1');
    expect(router.url).toBe('/reports/audit-packs/p1');
  });
});
