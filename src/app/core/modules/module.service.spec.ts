import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, Subject, firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { NotificationService } from '../notifications/notification.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { OrgModule } from './module.models';
import { MODULE_DISABLED_MESSAGE_KEY, ModuleService, moduleGuard } from './module.service';
import { ModulesApi } from './modules-api';

function mod(key: string, enabled: boolean, extra: Partial<OrgModule> = {}): OrgModule {
  return {
    key,
    name_key: `modules.names.${key}`,
    description_key: `modules.descriptions.${key}`,
    portal_path: key,
    enabled,
    always_on: false,
    depends_on: [],
    frameworks: [],
    required_by: [],
    ...extra,
  };
}

describe('ModuleService', () => {
  const orgId = signal<string | null>('org-a');
  let responses: Record<string, Subject<OrgModule[]>>;
  let list: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    orgId.set('org-a');
    responses = {};
    list = vi.fn((id: string) => {
      responses[id] = new Subject<OrgModule[]>();
      return responses[id].asObservable();
    });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: SelectedOrgService, useValue: { currentOrgId: orgId } },
        { provide: ModulesApi, useValue: { list } },
      ],
    });
  });

  function setup(): ModuleService {
    const service = TestBed.inject(ModuleService);
    TestBed.tick();
    return service;
  }

  it('loads the selected org once and answers isEnabled from the list', () => {
    const service = setup();
    expect(list).toHaveBeenCalledTimes(1);
    expect(service.loaded()).toBe(false);
    expect(service.isEnabled('risk')).toBe(false);

    responses['org-a'].next([mod('risk', false), mod('documents', true)]);
    responses['org-a'].complete();

    expect(service.loaded()).toBe(true);
    expect(service.isEnabled('documents')).toBe(true);
    expect(service.isEnabled('risk')).toBe(false);
    // Keys the registry doesn't list (modules not built yet) count as enabled.
    expect(service.isEnabled('context')).toBe(true);
    expect([...service.enabledKeys()]).toEqual(['documents']);
  });

  it('reloads on org change and ignores a stale response', () => {
    const service = setup();
    orgId.set('org-b');
    TestBed.tick();
    expect(list).toHaveBeenCalledTimes(2);

    responses['org-a'].next([mod('risk', true)]);
    expect(service.loaded()).toBe(false);

    responses['org-b'].next([mod('risk', false)]);
    expect(service.loaded()).toBe(true);
    expect(service.isEnabled('risk')).toBe(false);
  });

  it('treats a failed load as everything enabled', () => {
    list.mockReturnValueOnce(throwError(() => new Error('404')));
    const service = setup();
    expect(service.loaded()).toBe(true);
    expect(service.isEnabled('risk')).toBe(true);
  });

  it('patches one module in place', () => {
    const service = setup();
    responses['org-a'].next([mod('risk', false)]);
    service.patch(mod('risk', true));
    expect(service.isEnabled('risk')).toBe(true);
  });

  describe('moduleGuard', () => {
    function run(guard: CanActivateFn): boolean | UrlTree | Observable<boolean | UrlTree> {
      return TestBed.runInInjectionContext(
        () =>
          guard({} as ActivatedRouteSnapshot, { url: '/x' } as RouterStateSnapshot) as
            | boolean
            | UrlTree
            | Observable<boolean | UrlTree>,
      );
    }

    it('waits for the list, then allows an enabled module', async () => {
      setup();
      const result = run(moduleGuard('documents'));
      expect(isObservable(result)).toBe(true);
      const pending = firstValueFrom(result as Observable<boolean | UrlTree>);
      responses['org-a'].next([mod('documents', true)]);
      responses['org-a'].complete();
      expect(await pending).toBe(true);
    });

    it('sends a disabled module to the dashboard with a notice', () => {
      const service = setup();
      responses['org-a'].next([mod('risk', false)]);
      responses['org-a'].complete();
      expect(service.loaded()).toBe(true);

      const result = run(moduleGuard('risk'));
      const router = TestBed.inject(Router);
      expect(result instanceof UrlTree && router.serializeUrl(result)).toBe('/dashboard');
      const notifications = TestBed.inject(NotificationService).notifications();
      expect(notifications.map((n) => n.message)).toEqual([MODULE_DISABLED_MESSAGE_KEY]);

      // A second denial doesn't stack another notice.
      run(moduleGuard('risk'));
      expect(TestBed.inject(NotificationService).notifications().length).toBe(1);
    });

    it('allows everything without an org', () => {
      orgId.set(null);
      list.mockImplementation(() => of([]));
      setup();
      expect(run(moduleGuard('risk'))).toBe(true);
    });
  });
});
