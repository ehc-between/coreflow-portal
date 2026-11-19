import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { LanguageService } from '../../../core/i18n/language.service';
import { OrgModule, emptyProfile } from '../../../core/modules/module.models';
import { ModuleService } from '../../../core/modules/module.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { SetupWizard } from './setup-wizard';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path: string) => `${BASE}/v1/orgs/${ORG}/${path}`;

const PACKAGES = {
  total: 28,
  enabled: 6,
  items: [
    {
      key: 'quality',
      frameworks: ['iso9001'],
      modules: ['audits', 'documents'],
      module_count: 10,
      missing: ['audits'],
      covered: false,
    },
    { key: 'full', frameworks: [], modules: [], module_count: 28, missing: [], covered: false },
  ],
};

function mod(key: string, enabled: boolean): OrgModule {
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
  };
}

describe('SetupWizard', () => {
  let fixture: ComponentFixture<SetupWizard>;
  let http: HttpTestingController;
  const reload = vi.fn();
  const showWith = vi.fn();

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (key: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes(key)) as
      | HTMLButtonElement
      | undefined;

  async function open(step: string | null, frameworks: string[] = ['iso9001']): Promise<void> {
    fixture = TestBed.createComponent(SetupWizard);
    await settle();
    http.expectOne(url('profile')).flush({ ...emptyProfile(ORG), frameworks });
    http.expectOne(url('setup')).flush({ completed_at: null, step });
    http.expectOne(url('modules')).flush([mod('documents', true), mod('audits', false)]);
    http.expectOne(url('modules/packages')).flush(PACKAGES);
    await settle();
  }

  function flushRecommendations(): void {
    http.expectOne(url('setup/recommendations')).flush({
      modules: [
        {
          key: 'audits',
          recommended: true,
          reason_key: 'modules.reasons.audits',
          frameworks: ['iso9001'],
        },
        {
          key: 'documents',
          recommended: true,
          reason_key: 'modules.reasons.documents',
          frameworks: [],
        },
        { key: 'risk', recommended: false, reason_key: 'modules.reasons.risk', frameworks: [] },
      ],
    });
    http.expectOne(url('modules')).flush([mod('documents', true), mod('audits', false)]);
  }

  beforeEach(() => {
    reload.mockReset();
    showWith.mockReset();
    TestBed.configureTestingModule({
      imports: [SetupWizard, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrgId: signal(ORG),
            currentOrg: signal({
              id: ORG,
              name: 'Acme',
              roles: [],
              permissions: ['standards:manage'],
            }),
          },
        },
        { provide: ModuleService, useValue: { reload } },
        {
          provide: LanguageService,
          useFactory: () => {
            const transloco = inject(TranslocoService);
            return {
              active: signal('en'),
              locale: signal('en'),
              translate: (key: string, params?: Record<string, unknown>) =>
                transloco.translate(key, params),
            };
          },
        },
        { provide: AskPanelService, useValue: { showWith } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The help strip loads its guidance file; the page requests are what is verified here.
    http.match((req) => req.url.startsWith('/assets/guidance/'));
    http.verify();
  });

  it('starts at the profile and saves it before moving on', async () => {
    await open(null);
    expect(el().querySelector('[aria-current="step"]')?.textContent).toContain(
      'modules.setup.steps.profile',
    );
    button('modules.setup.next')!.click();
    const save = http.expectOne(url('profile'));
    expect(save.request.method).toBe('PUT');
    save.flush({ ...emptyProfile(ORG), frameworks: ['iso9001'] });
    const step = http.expectOne(url('setup/step'));
    expect(step.request.body).toEqual({ step: 'frameworks' });
    step.flush({ completed_at: null, step: 'frameworks' });
    await settle();
    expect(el().querySelector('[aria-current="step"]')?.textContent).toContain(
      'modules.setup.steps.frameworks',
    );
  });

  it('resumes at the modules step with recommendations preselected and asks why', async () => {
    await open('modules');
    flushRecommendations();
    await settle();
    const boxes = [...el().querySelectorAll<HTMLInputElement>('li input[type="checkbox"]')];
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false]);
    // Already-on modules can't be unticked (finishing never turns modules off).
    expect(boxes[1].disabled).toBe(true);

    button('modules.setup.modules.askWhy')!.click();
    expect(showWith).toHaveBeenCalledWith(
      expect.stringContaining('modules.setup.modules.askWhyPrompt'),
    );
  });

  it('switches the modules on, adds confirmed starters and ends with a first document (U09)', async () => {
    await open('modules');
    flushRecommendations();
    await settle();

    button('modules.setup.next')!.click();
    const save = http.expectOne(url('setup/complete'));
    expect(save.request.body).toEqual({ modules: ['audits', 'documents'], step: 'policies' });
    save.flush({
      enabled: ['audits', 'context', 'documents'],
      completed_at: '2026-11-19T06:00:00',
    });
    http
      .expectOne((req) => req.url === url('setup/starters'))
      .flush({
        policies: {
          module: 'context',
          module_enabled: true,
          items: [
            {
              key: 'quality',
              title: 'Quality policy',
              summary: 'We deliver.',
              payload: { kind: 'quality', title: 'Quality policy' },
              exists: false,
            },
            {
              key: 'privacy',
              title: 'Privacy policy',
              summary: 'Lawful.',
              payload: { kind: 'privacy', title: 'Privacy policy' },
              exists: true,
            },
          ],
        },
        risks: { module: 'risk', module_enabled: false, items: [] },
        ropa: { module: 'privacy', module_enabled: false, items: [] },
      });
    await settle();
    expect(reload).toHaveBeenCalled();
    expect(el().querySelector('[aria-current="step"]')?.textContent).toContain(
      'modules.setup.steps.policies',
    );
    // Steps whose module is off are not shown.
    expect(el().textContent).not.toContain('modules.setup.steps.risks');
    const boxes = [
      ...el().querySelectorAll<HTMLInputElement>(
        '[data-testid="setup-starters-policies"] input[type="checkbox"]',
      ),
    ];
    expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([
      [true, false],
      [false, true],
    ]);

    button('modules.setup.starters.policies.add')!.click();
    const created = http.expectOne(url('context/policies'));
    expect(created.request.body).toEqual({ kind: 'quality', title: 'Quality policy' });
    created.flush({});
    const step = http.expectOne(url('setup/step'));
    expect(step.request.body).toEqual({ step: 'done' });
    step.flush({ completed_at: '2026-11-19T06:00:00', step: 'done' });
    await settle();

    button('modules.setup.finish')!.click();
    http
      .expectOne(url('setup/complete'))
      .flush({ enabled: ['audits', 'documents'], completed_at: '2026-11-19T06:05:00' });
    await settle();
    expect(el().textContent).toContain('modules.setup.done.finished');
    expect(el().querySelector('[data-testid="setup-created"]')).not.toBeNull();
    const doc = el().querySelector('[data-testid="setup-first-document"] a') as HTMLAnchorElement;
    expect(doc.getAttribute('href')).toBe('/library');
  });

  it('pre-fills the profile from the Brønnøysund register (U09)', async () => {
    await open(null);
    const input = el().querySelector('#setup-orgnr') as HTMLInputElement;
    input.value = '923609016';
    input.dispatchEvent(new Event('input'));
    await settle();
    (el().querySelector('[data-testid="setup-lookup"] button') as HTMLButtonElement).click();
    http.expectOne(url('setup/registry/923609016')).flush({
      orgnr: '923609016',
      name: 'Eksempel AS',
      industry: 'Konsulentvirksomhet',
      employees: 42,
      size_band: '11-50',
      countries: ['NO'],
    });
    await settle();
    expect(el().textContent).toContain('modules.setup.lookup.found');
    expect((el().querySelector('#setup-industry') as HTMLInputElement).value).toBe(
      'Konsulentvirksomhet',
    );
    expect((el().querySelector('#setup-size') as HTMLSelectElement).value).toBe('11-50');
  });

  it('offers the packages and a package sets the standards (U09)', async () => {
    await open('frameworks', []);
    const radios = el().querySelectorAll<HTMLInputElement>(
      '[data-testid="setup-packages"] input[type="radio"]',
    );
    expect(radios.length).toBe(2);
    radios[0].click();
    await settle();
    const box = (name: string) =>
      [...el().querySelectorAll('label')]
        .find((l) => l.textContent?.includes(name))
        ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(box('modules.frameworks.iso9001.name')?.checked).toBe(true);
    expect(box('modules.frameworks.gdpr.name')?.checked).toBe(false);
    expect(el().textContent).toContain('modules.packages.items.quality.name');
  });
});
