import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { LanguageService } from '../../../core/i18n/language.service';
import { OrgModule } from '../../../core/modules/module.models';
import { ModuleService } from '../../../core/modules/module.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { ModulesSettings } from './modules-settings';

const BASE = 'http://test/api';
const ORG = 'org-1';

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

describe('ModulesSettings', () => {
  let fixture: ComponentFixture<ModulesSettings>;
  let http: HttpTestingController;
  const reload = vi.fn();
  const showWith = vi.fn();

  beforeEach(async () => {
    reload.mockReset();
    showWith.mockReset();
    TestBed.configureTestingModule({
      imports: [ModulesSettings, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
        { provide: SelectedOrgService, useValue: { currentOrgId: signal(ORG) } },
        { provide: ModuleService, useValue: { reload } },
        {
          provide: LanguageService,
          useFactory: () => {
            const transloco = inject(TranslocoService);
            return {
              active: signal('en'),
              translate: (key: string, params?: Record<string, unknown>) =>
                transloco.translate(key, params),
            };
          },
        },
        { provide: AskPanelService, useValue: { showWith } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ModulesSettings);
    fixture.detectChanges();
    await fixture.whenStable();
    http
      .expectOne(`${BASE}/v1/orgs/${ORG}/modules`)
      .flush([
        mod('documents', true, { required_by: ['audits'] }),
        mod('audits', false, { depends_on: ['documents'] }),
        mod('tasks', true, { always_on: true }),
      ]);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  const el = () => fixture.nativeElement as HTMLElement;
  const card = (key: string) => el().querySelector(`[data-module="${key}"]`) as HTMLElement;
  const toggle = (key: string) => card(key).querySelector('[role="switch"]') as HTMLButtonElement;

  it('renders a card per module, always-on without a switch', () => {
    expect(el().querySelectorAll('[data-module]').length).toBe(3);
    expect(toggle('tasks')).toBeNull();
    expect(toggle('audits').getAttribute('aria-checked')).toBe('false');
  });

  it('turns a module on directly and reloads the nav', async () => {
    toggle('audits').click();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/modules/audits`);
    expect(req.request.body).toEqual({ enabled: true });
    req.flush(mod('audits', true));
    http.expectOne(`${BASE}/v1/orgs/${ORG}/modules`).flush([]);
    expect(reload).toHaveBeenCalled();
  });

  it('asks before turning a module off and explains a 409', async () => {
    toggle('documents').click();
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectNone(`${BASE}/v1/orgs/${ORG}/modules/documents`);
    const dialog = el().querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();

    const confirm = [...dialog.querySelectorAll('button')].at(-1) as HTMLButtonElement;
    confirm.click();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/modules/documents`);
    expect(req.request.body).toEqual({ enabled: false });
    req.flush(
      { detail: { code: 'module_required_by', module: 'documents', modules: ['audits'] } },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'modules.settings.errors.requiredBy',
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it('filters by status', async () => {
    const select = el().querySelectorAll('select')[0] as HTMLSelectElement;
    select.value = 'disabled';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      [...el().querySelectorAll('[data-module]')].map((n) => n.getAttribute('data-module')),
    ).toEqual(['audits']);
  });

  it('opens the assistant with the enabled modules', () => {
    const button = [...el().querySelectorAll('button')].find((b) =>
      b.textContent?.includes('modules.settings.askFit'),
    ) as HTMLButtonElement;
    button.click();
    expect(showWith).toHaveBeenCalledWith(expect.stringContaining('modules.settings.askFitPrompt'));
  });
});
