import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ModuleService } from '../../core/modules/module.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Dashboard } from './dashboard';
import { HomeApi } from './data/home-api';
import { HomeResponse } from './data/home.models';
import { makeHome } from './data/home.testing';

function setup(
  home: HomeResponse | 'error' = makeHome(),
  permissions = ['dashboard:view', 'standards:read', 'standards:manage'],
) {
  const api = {
    home: vi.fn(() => (home === 'error' ? throwError(() => new Error('down')) : of(home))),
    dismiss: vi.fn(() => of(undefined)),
  };
  const notifications = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [Dashboard, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: HomeApi, useValue: api },
      {
        provide: AuthService,
        useValue: {
          user: () => ({ id: 'u-1', full_name: 'Kari Nordmann' }),
          isAuthenticated: () => true,
        },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions }),
        },
      },
      {
        provide: ModuleService,
        useValue: { isEnabled: () => true, loaded: () => true, ensureLoaded: () => of(true) },
      },
      { provide: NotificationService, useValue: notifications },
    ],
  });
  const fixture = TestBed.createComponent(Dashboard);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, api, notifications };
}

describe('Dashboard (home)', () => {
  it('loads the home summary in the UI language and greets the user', () => {
    const { el, api } = setup();
    expect(api.home).toHaveBeenCalledWith('org-1', 'en', null);
    expect(el.querySelector('[data-testid="home-greeting"]')?.textContent).toContain(
      'home.greeting.line',
    );
  });

  it('lists the next actions with one button each', () => {
    const { el } = setup();
    const rows = el.querySelectorAll('[data-testid="next-action"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('home.next.review.titleOne');
    expect(rows[0].querySelector('[data-testid="next-action-cta"]')?.getAttribute('href')).toBe(
      '/documents/d-1',
    );
    expect(rows[1].textContent).toContain('home.next.gap.title');
  });

  it('shows one card per target standard: one number, what remains, steps not %', () => {
    const { el } = setup();
    const cards = el.querySelectorAll('[data-testid="standard-status"]');
    expect(cards).toHaveLength(1);
    const card = cards[0];
    // One readiness number, and it is a link (as is every number on Home).
    expect(card.textContent?.match(/\d+ %/g)).toEqual(['42 %']);
    expect(card.querySelector('[data-testid="standard-percent"]')?.getAttribute('href')).toBe(
      '/standards/iso27001-2022/clauses',
    );
    expect(card.querySelector('[data-testid="standard-remaining"]')?.getAttribute('href')).toBe(
      '/standards/gaps/iso27001-2022',
    );
    expect(card.querySelector('[data-testid="standard-target"]')).toBeTruthy();
    expect(card.textContent).toContain('home.status.continueSteps');
    // No clause numbers on the card.
    expect(card.textContent).not.toContain('6.2');
  });

  it('folds standards that are not targets under "Vis alle"', () => {
    const base = makeHome().frameworks[0];
    const other = { ...base, framework: 'gdpr', standard_key: 'gdpr-2016', is_target: false };
    const { el, fixture } = setup(makeHome({ frameworks: [base, other] }));
    expect(el.querySelectorAll('[data-testid="standard-status"]')).toHaveLength(1);
    (el.querySelector('[data-testid="home-standards-toggle"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="standard-status"]')).toHaveLength(2);
  });

  it('shows the "Hva vil du gjøre?" row from the template', () => {
    const { el } = setup();
    const quick = el.querySelector('[data-testid="home-quick"]')!;
    expect(Array.from(quick.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      '/deviations/new',
      '/documents',
    ]);
  });

  it('gives an employee three buttons and three linked counters, and "Vis alt"', () => {
    const employee = makeHome({
      workspace: { key: 'employee', source: 'role', roles: ['member'] },
      quick_actions: [
        { key: 'report_issue', url: '/deviations/new', module: 'deviations' },
        {
          key: 'suggest_improvement',
          url: '/deviations/new?type=improvement_suggestion',
          module: 'deviations',
        },
        { key: 'find_document', url: '/documents', module: 'documents' },
      ],
      frameworks: [],
      next_actions: [],
      journeys: [],
    });
    const { el, fixture, api } = setup(employee, ['dashboard:view']);
    const root = el.querySelector('[data-testid="home-employee"]')!;
    expect(root.querySelectorAll('[data-testid="home-quick"] a')).toHaveLength(3);
    expect(
      Array.from(root.querySelectorAll('[data-testid="home-counters"] a')).map((a) =>
        a.getAttribute('href'),
      ),
    ).toEqual(['/my-work', '/my-work?source=document_ack', '/my-work?source=training_due']);
    expect(root.querySelector('[data-testid="home-counter-acknowledge"]')?.textContent).toContain(
      '2',
    );
    expect(el.querySelector('[data-testid="standard-status"]')).toBeNull();
    expect(el.querySelector('[data-testid="next-action"]')).toBeNull();
    expect(el.querySelector('[data-testid="home-up-to-date"]')).toBeNull();
    (el.querySelector('[data-testid="home-show-all"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(api.home).toHaveBeenLastCalledWith('org-1', 'en', 'quality_lead');
  });

  it('tells an employee with nothing to do that they are up to date', () => {
    const employee = makeHome({
      workspace: { key: 'employee', source: 'role', roles: ['member'] },
      my_work: {
        overdue: 0,
        due_this_week: 0,
        later: 0,
        awaiting_review: 0,
        total: 0,
        acknowledge: 0,
        training: 0,
        tasks: 0,
      },
    });
    const { el } = setup(employee, ['dashboard:view']);
    expect(el.querySelector('[data-testid="home-up-to-date"]')).toBeTruthy();
  });

  it('summarises My Work per tab and shows the active journey', () => {
    const { el } = setup();
    const work = el.querySelector('[data-testid="home-my-work"]')!;
    const links = Array.from(work.querySelectorAll('li a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      '/my-work?tab=overdue',
      '/my-work?tab=this_week',
      '/my-work?tab=review',
      '/my-work?tab=later',
    ]);
    const journey = el.querySelector('[data-testid="home-journey"]')!;
    expect(journey.getAttribute('href')).toBe('/standards/journey/iso27001');
    expect(journey.textContent).toContain('home.journeys.steps');
    expect(journey.textContent).not.toContain('%');
  });

  it('hides a dismissed action at once and stores the dismissal', () => {
    const { el, fixture, api, notifications } = setup();
    const menu = el.querySelector('[data-testid="next-action"] [role="menu"]')!;
    (menu.querySelectorAll('[role="menuitem"]')[0] as HTMLElement).click();
    fixture.detectChanges();
    expect(api.dismiss).toHaveBeenCalledWith('org-1', 'work.review', 7);
    expect(el.querySelectorAll('[data-testid="next-action"]')).toHaveLength(1);
    expect(notifications.info).toHaveBeenCalledWith('home.next.snoozed', { days: 7 });
  });

  it('says when there is nothing to do and invites to choose standards', () => {
    const { el } = setup(makeHome({ next_actions: [], frameworks: [], journeys: [] }));
    expect(el.textContent).toContain('home.next.emptyTitle');
    expect(el.textContent).toContain('home.status.emptyTitle');
  });

  it('only links missing setup the user can act on', () => {
    const missing = makeHome({ setup: { complete: false, missing: ['standards', 'members'] } });
    const links = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('[data-testid="home-setup-missing"] a')).map((a) =>
        a.getAttribute('href'),
      );
    expect(
      links(setup(missing, ['standards:read', 'standards:manage', 'users:invite']).el),
    ).toEqual(['/standards', '/settings']);
    TestBed.resetTestingModule();
    expect(
      setup(missing, ['standards:read']).el.querySelector('[data-testid="home-setup-missing"]'),
    ).toBeNull();
  });

  it('shows an error state with retry', () => {
    const { el, api } = setup('error');
    const retry = el.querySelector<HTMLButtonElement>(
      '[data-testid="error-retry"] button, [data-testid="error-retry"]',
    )!;
    expect(retry).toBeTruthy();
    expect(api.home).toHaveBeenCalledTimes(1);
  });
});
