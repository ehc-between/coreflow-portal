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
    expect(api.home).toHaveBeenCalledWith('org-1', 'en');
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

  it('shows a card per standard with coverage, gaps and the journey link', () => {
    const { el } = setup();
    const cards = el.querySelectorAll('[data-testid="standard-status"]');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('42 %');
    expect(cards[0].querySelectorAll('[data-testid="standard-gaps"] li')).toHaveLength(1);
    expect(cards[0].textContent).toContain('home.status.continueJourney');
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
    expect(journey.textContent).toContain('45 %');
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

  it('shows an error state with retry', () => {
    const { el, api } = setup('error');
    const retry = el.querySelector<HTMLButtonElement>(
      '[data-testid="error-retry"] button, [data-testid="error-retry"]',
    )!;
    expect(retry).toBeTruthy();
    expect(api.home).toHaveBeenCalledTimes(1);
  });
});
