import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import { NotificationService } from '../notifications/notification.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { ShellPreferencesDto } from './shell-preferences.models';
import { NAV_V2_CACHE_PREFIX, ShellPreferencesService } from './shell-preferences.service';

const BASE = 'http://test/api';
const url = (org: string) => `${BASE}/v1/me/orgs/${org}/preferences`;

const PREFS: ShellPreferencesDto = {
  nav_v2: true,
  org_nav_v2: true,
  user_nav_v2: null,
  pins: null,
};

function setup(orgId = 'org-1') {
  const org: WritableSignal<string | null> = signal(orgId);
  const toasts = { error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: AuthService, useValue: { isAuthenticated: signal(true).asReadonly() } },
      { provide: NotificationService, useValue: toasts },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: org.asReadonly(),
          currentOrg: computed(() => ({ id: org(), roles: [], permissions: [] })),
        },
      },
    ],
  });
  const service = TestBed.inject(ShellPreferencesService);
  TestBed.tick();
  return { service, http: TestBed.inject(HttpTestingController), org, toasts };
}

describe('ShellPreferencesService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
  });

  it('shows the old menu until the server says otherwise, then caches the answer per org', () => {
    const { service, http } = setup();
    expect(service.navV2()).toBe(false);
    expect(service.loaded()).toBe(false);
    http.expectOne(url('org-1')).flush(PREFS);
    expect(service.navV2()).toBe(true);
    expect(service.orgNavV2()).toBe(true);
    expect(service.canSwitch()).toBe(true);
    expect(localStorage.getItem(`${NAV_V2_CACHE_PREFIX}org-1`)).toBe('1');
  });

  it('uses the cached choice while loading and keeps it when the call fails', () => {
    localStorage.setItem(`${NAV_V2_CACHE_PREFIX}org-1`, '1');
    const { service, http } = setup();
    expect(service.navV2()).toBe(true);
    http.expectOne(url('org-1')).flush('down', { status: 503, statusText: 'Down' });
    expect(service.navV2()).toBe(true);
    expect(service.canSwitch()).toBe(false);
  });

  it('switches back optimistically and reverts with a message on failure', () => {
    const { service, http, toasts } = setup();
    http.expectOne(url('org-1')).flush(PREFS);

    service.setNavV2(false);
    expect(service.navV2()).toBe(false);
    const put = http.expectOne((r) => r.method === 'PUT' && r.url === url('org-1'));
    expect(put.request.body).toEqual({ nav_v2: false });
    put.flush('nope', { status: 500, statusText: 'Error' });
    expect(service.navV2()).toBe(true);
    expect(toasts.error).toHaveBeenCalledWith('shell.prefs.saveFailed');

    service.setNavV2(null);
    const follow = http.expectOne((r) => r.method === 'PUT');
    expect(follow.request.body).toEqual({ nav_v2: null });
    follow.flush(PREFS);
    expect(service.userNavV2()).toBeNull();
  });

  it('saves at most five distinct pins and can restore the role defaults', () => {
    const { service, http } = setup();
    http.expectOne(url('org-1')).flush(PREFS);
    service.setPins(['risk', 'risk', 'audits', 'hse', 'people', 'privacy', 'assets']);
    const put = http.expectOne((r) => r.method === 'PUT');
    expect(put.request.body).toEqual({ pins: ['risk', 'audits', 'hse', 'people', 'privacy'] });
    expect(service.pins()).toEqual(['risk', 'audits', 'hse', 'people', 'privacy']);
    put.flush({ ...PREFS, pins: ['risk', 'audits', 'hse', 'people', 'privacy'] });

    service.setPins(null);
    const reset = http.expectOne((r) => r.method === 'PUT');
    expect(reset.request.body).toEqual({ pins: null });
    reset.flush(PREFS);
    expect(service.pins()).toBeNull();
  });

  it('does not save before the preferences have loaded', () => {
    const { service, http } = setup();
    service.setNavV2(false);
    http.expectOne(url('org-1')).flush(PREFS);
    http.expectNone((r) => r.method === 'PUT');
  });

  it('reloads on org switch and keeps "Vis alt" per org', () => {
    const { service, http, org } = setup();
    http.expectOne(url('org-1')).flush(PREFS);
    service.setShowAll(true);
    expect(service.showAll()).toBe(true);
    expect(localStorage.getItem('coreflow.nav.showAll.org-1')).toBe('1');

    org.set('org-2');
    TestBed.tick();
    expect(service.navV2()).toBe(false);
    expect(service.showAll()).toBe(false);
    http
      .expectOne(url('org-2'))
      .flush({ nav_v2: false, org_nav_v2: false, user_nav_v2: null, pins: [] });
    expect(service.canSwitch()).toBe(false);
    expect(service.pins()).toEqual([]);
  });
});
