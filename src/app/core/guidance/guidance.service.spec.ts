import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notifications/notification.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { GuidanceApi } from './guidance-api';
import { PreferencesDto } from './guidance.models';
import { GuidanceService } from './guidance.service';

function setup(
  initial: PreferencesDto = {
    guidance_level: null,
    org_default: 'beginner',
    effective: 'beginner',
  },
) {
  const signedIn = signal(true);
  const orgId = signal<string | null>('org-1');
  const update$ = new Subject<PreferencesDto>();
  const api = {
    getPreferences: vi.fn(() => of(initial)),
    updatePreferences: vi.fn(() => update$),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: GuidanceApi, useValue: api },
      { provide: AuthService, useValue: { isAuthenticated: signedIn } },
      { provide: SelectedOrgService, useValue: { currentOrgId: orgId } },
      { provide: NotificationService, useValue: toasts },
    ],
  });
  const service = TestBed.inject(GuidanceService);
  TestBed.tick();
  return { service, api, toasts, update$, signedIn, orgId };
}

describe('GuidanceService', () => {
  it('loads the preferences for the selected org and resolves the effective level', () => {
    const { service, api } = setup();
    expect(api.getPreferences).toHaveBeenCalledWith('org-1');
    expect(service.personalLevel()).toBeNull();
    expect(service.orgDefault()).toBe('beginner');
    expect(service.level()).toBe('beginner');
    expect(service.isBeginner()).toBe(true);
    expect(service.loaded()).toBe(true);
  });

  it('reloads on org change and resets on sign-out', () => {
    const { service, api, orgId, signedIn } = setup();
    orgId.set('org-2');
    TestBed.tick();
    expect(api.getPreferences).toHaveBeenLastCalledWith('org-2');
    signedIn.set(false);
    TestBed.tick();
    expect(service.level()).toBe('standard');
    expect(service.loaded()).toBe(false);
  });

  it('saves a personal level optimistically', () => {
    const { service, api, update$, toasts } = setup();
    service.setLevel('expert');
    expect(service.level()).toBe('expert');
    expect(service.saving()).toBe(true);
    expect(api.updatePreferences).toHaveBeenCalledWith('expert', 'org-1');
    update$.next({ guidance_level: 'expert', org_default: 'beginner', effective: 'expert' });
    expect(service.saving()).toBe(false);
    expect(service.isExpert()).toBe(true);
    expect(toasts.success).toHaveBeenCalledWith('guidance.level.saved');
  });

  it('reverts a failed save', () => {
    const { service, update$, toasts } = setup();
    service.setLevel('expert');
    update$.error(new Error('boom'));
    expect(service.personalLevel()).toBeNull();
    expect(service.level()).toBe('beginner');
    expect(toasts.error).toHaveBeenCalledWith('guidance.level.saveFailed');
  });

  it('keeps the defaults when the preferences cannot be loaded', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: GuidanceApi,
          useValue: { getPreferences: () => throwError(() => new Error('down')) },
        },
        { provide: AuthService, useValue: { isAuthenticated: signal(true) } },
        { provide: SelectedOrgService, useValue: { currentOrgId: signal(null) } },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
    const service = TestBed.inject(GuidanceService);
    TestBed.tick();
    expect(service.level()).toBe('standard');
    expect(service.loaded()).toBe(true);
  });
});
