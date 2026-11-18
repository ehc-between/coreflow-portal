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
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { ModuleService } from '../../../core/modules/module.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { OrgSettings } from './org-settings';

const BASE = 'http://test/api';
const ORG = 'org-1';

function configure(permissions: string[]): void {
  TestBed.configureTestingModule({
    imports: [OrgSettings, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      ...provideFakeGuidance().providers,
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
      // The settings hub lists module cards for enabled modules.
      { provide: ModuleService, useValue: { isEnabled: () => true } },
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

  it('lets auditors reach settings for the audit log', () => {
    configure(['audit:read']);
    expect(runGuard(settingsGuard)).toBe(true);
  });

  it('redirects a user with neither permission away from settings', () => {
    configure(['dashboard:view']);
    expect(runGuard(settingsGuard)).toBeInstanceOf(UrlTree);
  });

  it('shows the invitation and role cards only, and never requests departments', async () => {
    configure(['users:invite']);
    const fixture = TestBed.createComponent(OrgSettings);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    http.expectNone(`${BASE}/v1/orgs/${ORG}/departments`);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(
      root.querySelector('[data-testid="settings-card-settings.hub.cards.invitations"]'),
    ).not.toBeNull();
    expect(
      root.querySelector('[data-testid="settings-card-settings.hub.cards.roles"]'),
    ).not.toBeNull();
    expect(
      root.querySelector('[data-testid="settings-card-settings.hub.cards.members"]'),
    ).toBeNull();
  });
});

describe('Settings hub for an org:manage user', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('groups the cards and flags departments without a lead', async () => {
    configure(['org:manage', 'audit:read']);
    const fixture = TestBed.createComponent(OrgSettings);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${BASE}/v1/orgs/${ORG}/departments`).flush([
      { id: 'd1', name: 'IT', member_count: 2, lead_user_id: 'u1', lead_name: 'Ada' },
      { id: 'd2', name: 'Salg', member_count: 0, lead_user_id: null, lead_name: null },
    ]);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    for (const group of ['organisation', 'people', 'work', 'learning', 'trace']) {
      expect(root.querySelector(`[data-testid="settings-section-${group}"]`)).not.toBeNull();
    }
    expect(
      root.querySelector('[data-testid="settings-card-settings.hub.cards.auditLog"]'),
    ).not.toBeNull();
    const attention = root.querySelector('[data-testid="settings-attention-leads"]');
    expect(attention?.textContent).toContain('settings.departments.noLeadWarningOne');
  });
});
