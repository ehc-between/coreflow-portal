import { Component, inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.models';
import { orgDeepLinkGuard } from './org-deep-link.guard';
import { SelectedOrgService } from './selected-org.service';

@Component({ template: 'record' })
class RecordPage {
  /** The org that was selected when the page (and its guards) ran. */
  readonly orgAtOpen = inject(SelectedOrgService).currentOrgId();
}

@Component({ template: 'no access' })
class NoAccessPage {}

const ORG_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const ORG_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const FOREIGN = 'ffffffff-0000-0000-0000-00000000000f';

function user(): AuthUser {
  const membership = (name: string) => ({ name, roles: ['member'], permissions: [] });
  return {
    id: 'u-1',
    email: 'u@example.com',
    is_superuser: false,
    orgs: { [ORG_A]: membership('Alpha'), [ORG_B]: membership('Beta') },
  } as unknown as AuthUser;
}

describe('orgDeepLinkGuard', () => {
  afterEach(() => {
    globalThis.localStorage?.clear();
    TestBed.resetTestingModule();
  });

  async function setup(opts: { authenticated?: boolean } = {}) {
    const token = signal(opts.authenticated ?? true);
    const currentUser = signal<AuthUser | null>(token() ? user() : null);
    const restoreSession = vi.fn((): Observable<boolean> => {
      // A hard reload: the silent refresh restores the session.
      token.set(true);
      currentUser.set(user());
      return of(true);
    });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: token.asReadonly(),
            user: currentUser.asReadonly(),
            restoreSession,
          },
        },
        provideRouter([
          {
            path: '',
            canActivate: [orgDeepLinkGuard],
            runGuardsAndResolvers: 'paramsOrQueryParamsChange',
            children: [
              { path: 'no-access', component: NoAccessPage },
              { path: 'records/:id', component: RecordPage },
            ],
          },
        ]),
      ],
    });
    const selectedOrg = TestBed.inject(SelectedOrgService);
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    return { harness, router, selectedOrg, restoreSession };
  }

  it('lets a link without an org through untouched', async () => {
    const { harness, router, selectedOrg } = await setup();
    await harness.navigateByUrl('/records/r-1?tab=x');
    expect(router.url).toBe('/records/r-1?tab=x');
    expect(selectedOrg.currentOrgId()).toBe(ORG_A);
  });

  it('switches to a member org, opens the record and drops the parameter', async () => {
    const { harness, router, selectedOrg } = await setup();
    expect(selectedOrg.currentOrgId()).toBe(ORG_A);

    const page = await harness.navigateByUrl(`/records/r-1?action=a-1&org=${ORG_B}`, RecordPage);

    expect(selectedOrg.currentOrgId()).toBe(ORG_B);
    expect(page.orgAtOpen).toBe(ORG_B);
    expect(router.url).toBe('/records/r-1?action=a-1');
  });

  it('switches again for an in-app link to the page already open', async () => {
    const { harness, router, selectedOrg } = await setup();
    await harness.navigateByUrl('/records/r-1');
    await harness.navigateByUrl(`/records/r-1?org=${ORG_B}`);
    expect(selectedOrg.currentOrgId()).toBe(ORG_B);
    expect(router.url).toBe('/records/r-1');
  });

  it('sends a non-member to the no-access page and keeps the selected org', async () => {
    const { harness, router, selectedOrg } = await setup();
    await harness.navigateByUrl(`/records/r-1?org=${FOREIGN}`);
    expect(router.url).toBe('/no-access');
    expect(harness.routeNativeElement?.textContent).toContain('no access');
    expect(selectedOrg.currentOrgId()).toBe(ORG_A);
  });

  it('treats an empty or malformed org as no access', async () => {
    const { harness, router, selectedOrg } = await setup();
    await harness.navigateByUrl('/records/r-1?org=');
    expect(router.url).toBe('/no-access');
    await harness.navigateByUrl('/records/r-1?org=%2F%2Fevil.example');
    expect(router.url).toBe('/no-access');
    expect(selectedOrg.currentOrgId()).toBe(ORG_A);
  });

  it('waits for the silent session restore on a hard reload', async () => {
    const { harness, router, selectedOrg, restoreSession } = await setup({
      authenticated: false,
    });
    await harness.navigateByUrl(`/records/r-1?org=${ORG_B}`);
    expect(restoreSession).toHaveBeenCalled();
    expect(selectedOrg.currentOrgId()).toBe(ORG_B);
    expect(router.url).toBe('/records/r-1');
  });
});
