import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
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
        { provide: SelectedOrgService, useValue: { currentOrgId: signal(ORG) } },
        { provide: ModuleService, useValue: { reload } },
        { provide: LanguageService, useValue: { active: signal('en'), locale: signal('en') } },
        { provide: AskPanelService, useValue: { showWith } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

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

  it('skips first tasks gracefully on 404 and finishes the setup', async () => {
    await open('tasks');
    flushRecommendations();
    await settle();

    button('modules.setup.tasks.create')!.click();
    for (const req of http.match(url('tasks'))) {
      req.flush({}, { status: 404, statusText: 'Not Found' });
    }
    // Tasks are created one at a time; flush any that follow.
    let more = http.match(url('tasks'));
    while (more.length) {
      more.forEach((req) => req.flush({}, { status: 404, statusText: 'Not Found' }));
      more = http.match(url('tasks'));
    }
    await settle();
    expect(el().textContent).toContain('modules.setup.tasks.unavailable');

    button('modules.setup.next')!.click();
    http.expectOne(url('setup/step')).flush({ completed_at: null, step: 'done' });
    await settle();

    button('modules.setup.finish')!.click();
    const complete = http.expectOne(url('setup/complete'));
    expect(complete.request.body).toEqual({ modules: ['audits', 'documents'], step: 'done' });
    complete.flush({ enabled: ['audits', 'documents'], completed_at: '2026-11-12T10:00:00' });
    await settle();
    expect(reload).toHaveBeenCalled();
    expect(el().textContent).toContain('modules.setup.done.finished');
  });
});
