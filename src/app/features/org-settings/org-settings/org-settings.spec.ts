import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { orgManageGuard, settingsGuard } from '../../../core/auth/org-manage.guard';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { OrgSettings } from './org-settings';

const BASE = 'http://test/api';
const ORG = 'org-1';

function configure(permissions: string[]): void {
  TestBed.configureTestingModule({
    imports: [OrgSettings, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: signal(true).asReadonly(),
          user: signal({ id: 'me' }).asReadonly(),
        },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions }).asReadonly(),
        },
      },
    ],
  });
}

function runGuard(guard: CanActivateFn): unknown {
  return TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
}

describe('Settings access for a users:invite-only user', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('passes the settings guard but not the org:manage guard', () => {
    configure(['users:invite']);
    expect(runGuard(settingsGuard)).toBe(true);
    expect(runGuard(orgManageGuard)).toBeInstanceOf(UrlTree);
  });

  it('redirects a user with neither permission away from settings', () => {
    configure(['dashboard:view']);
    expect(runGuard(settingsGuard)).toBeInstanceOf(UrlTree);
  });

  it('shows Invitations only and never requests departments or members', async () => {
    configure(['users:invite']);
    const fixture = TestBed.createComponent(OrgSettings);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);

    http.expectNone(`${BASE}/v1/orgs/${ORG}/departments`);
    http.expectNone(`${BASE}/v1/orgs/${ORG}/members`);
    http.expectNone(`${BASE}/v1/orgs/${ORG}/settings`);
    http.expectOne(`${BASE}/v1/orgs/${ORG}/roles`).flush([]);
    http.expectOne(`${BASE}/v1/orgs/${ORG}/invitations`).flush([]);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-org-invitations')).not.toBeNull();
    expect(root.querySelector('app-org-members')).toBeNull();
    expect(root.querySelector('[data-testid="settings-departments"]')).toBeNull();
  });

  it('shows Departments and Members (not Invitations) for an org:manage-only user', async () => {
    configure(['org:manage']);
    const fixture = TestBed.createComponent(OrgSettings);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);

    http.expectOne(`${BASE}/v1/orgs/${ORG}/departments`).flush([]);
    http.expectOne(`${BASE}/v1/orgs/${ORG}/roles`).flush([]);
    http.expectOne(`${BASE}/v1/orgs/${ORG}/members`).flush([]);
    http
      .expectOne(`${BASE}/v1/orgs/${ORG}/settings`)
      .flush({ require_document_segregation: false });
    http.expectNone(`${BASE}/v1/orgs/${ORG}/invitations`);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="settings-departments"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="settings-documents"]')).not.toBeNull();
    expect(root.querySelector('app-org-members')).not.toBeNull();
    expect(root.querySelector('app-org-invitations')).toBeNull();
  });
});
