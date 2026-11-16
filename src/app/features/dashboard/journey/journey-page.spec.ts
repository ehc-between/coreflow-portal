import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { HomeApi } from '../data/home-api';
import { JourneyList } from '../data/home.models';
import { makeJourney } from '../data/home.testing';
import { JourneyPage } from './journey-page';

const AVAILABLE: JourneyList['available'] = [
  {
    framework: 'iso27001',
    title: 'Get ready for ISO 27001',
    summary: 'A step-by-step path.',
    steps: 20,
    standard_enabled: false,
  },
];

function setup(
  list: JourneyList | 'disabled',
  permissions = ['standards:read', 'standards:manage', 'tasks:write'],
) {
  const journey = makeJourney();
  const api = {
    journeys: vi.fn(() =>
      list === 'disabled'
        ? throwError(
            () =>
              new HttpErrorResponse({
                status: 404,
                error: { detail: { code: 'module_disabled', module: 'standards' } },
              }),
          )
        : of(list),
    ),
    journey: vi.fn(() => of(journey)),
    start: vi.fn(() => of(journey)),
    setStep: vi.fn(() => of(journey)),
    setStatus: vi.fn(() => of({ ...journey, status: 'archived' })),
    stepTask: vi.fn(() => of({ id: 't-9', title: 'Assess risks' })),
  };
  const notifications = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [JourneyPage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: HomeApi, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: new BehaviorSubject(convertToParamMap({ framework: 'iso27001' })) },
      },
      {
        provide: AuthService,
        useValue: { user: () => ({ id: 'u-1' }), isAuthenticated: () => true },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions }),
        },
      },
      { provide: NotificationService, useValue: notifications },
    ],
  });
  const fixture = TestBed.createComponent(JourneyPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, api, notifications };
}

describe('JourneyPage', () => {
  it('offers to start a journey that does not exist yet', () => {
    const { el, fixture, api } = setup({ items: [], available: AVAILABLE });
    expect(el.querySelector('[data-testid="journey-start"]')?.textContent).toContain(
      'home.journey.start.enables',
    );
    el.querySelector<HTMLElement>('[data-testid="journey-start-button"] button')!.click();
    fixture.detectChanges();
    expect(api.start).toHaveBeenCalledWith('org-1', 'iso27001', 'en');
    expect(el.querySelector('[data-testid="journey-phases"]')).toBeTruthy();
  });

  it('shows phases, opens the phase of the next step and highlights it', () => {
    const summary = { ...makeJourney(), phases: undefined };
    const { el, api } = setup({ items: [summary], available: [] });
    expect(api.journey).toHaveBeenCalledWith('org-1', 'j-1', 'en');
    expect(el.querySelector('[data-testid="journey-progress"]')?.textContent).toContain('33 %');
    // The first phase is complete and closed; the risk phase holds the next step.
    expect(el.querySelector('[data-testid="journey-step-define-scope"]')).toBeNull();
    const next = el.querySelector('[data-testid="journey-step-assess-risks"]')!;
    expect(next.getAttribute('data-state')).toBe('needs_link');
    expect(next.textContent).toContain('home.journey.step.next');
    expect(next.textContent).toContain('home.journey.step.actions.link');
  });

  it('marks a step as done and makes a step a task', () => {
    const summary = { ...makeJourney(), phases: undefined };
    const { el, fixture, api, notifications } = setup({ items: [summary], available: [] });
    const step = el.querySelector('[data-testid="journey-step-treat-risks"]')!;
    const buttons = Array.from(step.querySelectorAll('button'));
    buttons.find((b) => b.textContent?.includes('home.journey.step.actions.makeTask'))!.click();
    fixture.detectChanges();
    expect(api.stepTask).toHaveBeenCalledWith('org-1', 'j-1', 'treat-risks', 'en');
    expect(notifications.success).toHaveBeenCalledWith('home.journey.taskCreated', {
      title: 'Assess risks',
    });

    const markDone = Array.from(
      el.querySelectorAll('[data-testid="journey-step-treat-risks"] [role="menuitem"]'),
    )[0] as HTMLElement;
    markDone.click();
    fixture.detectChanges();
    expect(api.setStep).toHaveBeenCalledWith('org-1', 'j-1', 'treat-risks', 'done', 'en');
  });

  it('hides changes without standards:manage', () => {
    const summary = { ...makeJourney(), phases: undefined };
    const { el } = setup({ items: [summary], available: [] }, ['standards:read']);
    const step = el.querySelector('[data-testid="journey-step-treat-risks"]')!;
    expect(step.textContent).not.toContain('home.journey.step.actions.makeTask');
    expect(step.querySelector('[role="menu"]')).toBeNull();
  });

  it('explains when the standards module is off', () => {
    const { el } = setup('disabled');
    expect(el.textContent).toContain('home.journey.off.title');
  });
});
