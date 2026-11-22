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
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';
import { HomeApi } from '../dashboard/data/home-api';
import { HomeResponse, NextAction } from '../dashboard/data/home.models';
import { makeHome } from '../dashboard/data/home.testing';
import { OversiktApi } from './data/oversikt-api';
import { HomePage } from './home-page';

const PERMS = ['reports:read', 'suppliers:write', 'documents:draft', 'standards:read'];

function setup(
  opts: {
    home?: HomeResponse | 'error';
    actions?: readonly NextAction[] | 'error';
    permissions?: string[];
    showReq?: boolean;
  } = {},
) {
  const home = opts.home ?? makeHome();
  const api = {
    home: vi.fn(() => (home === 'error' ? throwError(() => new Error('down')) : of(home))),
    nextActions: vi.fn(() =>
      opts.actions === 'error'
        ? throwError(() => new Error('down'))
        : of({ items: opts.actions ?? (home === 'error' ? [] : home.next_actions) }),
    ),
    dismiss: vi.fn(() => of(undefined)),
  };
  const oversikt = {
    deadlines: vi.fn(() =>
      of({
        items: [
          {
            entity_id: 'c1',
            title: 'Kontrakt med Fjord Cloud fornyes',
            code: null,
            due_at: '2026-11-27T09:00:00',
            url: '/contracts/c1',
            overdue: false,
            state: 'due_soon',
            label_key: null,
            owner: { name: 'Erik Larsen' },
          },
        ],
      }),
    ),
  };
  const notifications = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
  const show = signal(opts.showReq ?? false);
  TestBed.configureTestingModule({
    imports: [HomePage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: HomeApi, useValue: api },
      { provide: OversiktApi, useValue: oversikt },
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
          currentOrg: signal({
            id: 'org-1',
            name: 'Acme',
            roles: [],
            permissions: opts.permissions ?? PERMS,
          }),
        },
      },
      {
        provide: ModuleService,
        useValue: { isEnabled: () => true, loaded: () => true, ensureLoaded: () => of(true) },
      },
      { provide: NotificationService, useValue: notifications },
      {
        provide: RequirementsVisibilityService,
        useValue: { show, on: show, expert: () => false },
      },
    ],
  });
  const fixture = TestBed.createComponent(HomePage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, api, oversikt, notifications };
}

const q = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);
const qa = (el: HTMLElement, id: string) => el.querySelectorAll(`[data-testid="${id}"]`);

describe('HomePage (Oversikt)', () => {
  it('greets the user and summarises the week', () => {
    const { el, api } = setup();
    expect(api.home).toHaveBeenCalledWith('org-1', 'en');
    expect(api.nextActions).toHaveBeenCalledWith('org-1', 'en', 20);
    expect(q(el, 'home-greeting')?.textContent).toContain('home.oversikt.greeting.');
    // overdue 1 + this week 2 + review 1, and the top action (priority 1) is named.
    expect(q(el, 'home-summary')?.textContent).toContain('home.oversikt.summary.many');
    expect(q(el, 'home-summary')?.textContent).toContain('home.oversikt.summary.top');
  });

  it('shows the four quick actions', () => {
    const { el } = setup();
    expect(Array.from(qa(el, 'home-quick-speakUp'))).toHaveLength(1);
    expect(q(el, 'home-quick-speakUp')?.getAttribute('href')).toBe('/speak-up');
    expect(q(el, 'home-quick-supplier')?.getAttribute('href')).toBe('/suppliers/new');
    expect(q(el, 'home-quick-policy')?.getAttribute('href')).toBe('/documents/new?type=policy');
    expect(q(el, 'home-quick-report')?.getAttribute('href')).toBe('/reports');
  });

  it('lists the to-dos with one button each and the counter', () => {
    const { el } = setup();
    const rows = qa(el, 'home-todo-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('home.next.review.titleOne');
    expect(rows[0].querySelector('[data-testid="home-todo-cta"]')?.getAttribute('href')).toBe(
      '/documents/d-1',
    );
    expect(rows[0].querySelectorAll('[data-testid="home-todo-cta"]')).toHaveLength(1);
    expect(q(el, 'home-todo-count')?.textContent).toContain('home.oversikt.todo.count');
  });

  it('caps the to-do list at five rows', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...makeHome().next_actions[0],
      key: `k${i}`,
    }));
    const { el } = setup({ actions: many });
    expect(qa(el, 'home-todo-row')).toHaveLength(5);
  });

  it('falls back to the home payload when the full list fails', () => {
    const { el } = setup({ actions: 'error' });
    expect(qa(el, 'home-todo-row')).toHaveLength(2);
  });

  it('hides requirement chips until "Vis krav" is on', () => {
    expect(qa(setup().el, 'req-pills')).toHaveLength(0);
    TestBed.resetTestingModule();
    const { el } = setup({ showReq: true });
    // Only the gap row carries a clause.
    expect(qa(el, 'req-pills')).toHaveLength(1);
  });

  it('dismisses a to-do at once and stores it', () => {
    const { fixture, el, api, notifications } = setup();
    const component = fixture.componentInstance as unknown as {
      dismiss(key: string, days?: number): void;
    };
    component.dismiss('work.review', 7);
    fixture.detectChanges();
    expect(api.dismiss).toHaveBeenCalledWith('org-1', 'work.review', 7);
    expect(qa(el, 'home-todo-row')).toHaveLength(1);
    expect(notifications.info).toHaveBeenCalled();
  });

  it('shows the upcoming deadlines with the person responsible', () => {
    const { el, oversikt } = setup();
    expect(oversikt.deadlines).toHaveBeenCalled();
    const rows = qa(el, 'home-deadline');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Kontrakt med Fjord Cloud fornyes');
    expect(rows[0].textContent).toContain('home.oversikt.deadlines.owner');
  });

  it('hides "Snart frist" without reports:read', () => {
    const { el, oversikt } = setup({ permissions: ['standards:read'] });
    expect(q(el, 'home-deadlines')).toBeNull();
    expect(oversikt.deadlines).not.toHaveBeenCalled();
  });

  it('shows one line per standard linking to its journey', () => {
    const { el } = setup();
    const rows = qa(el, 'home-standard');
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('href')).toBe('/standards/journey/iso27001');
    expect(rows[0].textContent).toContain('home.standards.iso27001.name');
  });

  it('leaves the standards card out of the employee home', () => {
    const { el } = setup({
      home: makeHome({ workspace: { key: 'employee', source: 'role', roles: ['member'] } }),
    });
    expect(q(el, 'home-standards')).toBeNull();
  });

  it('says all is well when there is nothing to do', () => {
    const { el } = setup({
      home: makeHome({
        next_actions: [],
        my_work: { ...makeHome().my_work, overdue: 0, due_this_week: 0, awaiting_review: 0 },
      }),
      actions: [],
    });
    expect(q(el, 'home-todo-empty')).not.toBeNull();
    expect(q(el, 'home-summary')?.textContent).toContain('home.oversikt.summary.none');
  });

  it('shows an error with retry when the home summary fails', () => {
    const { el } = setup({ home: 'error' });
    expect(el.querySelector('app-error-state')).not.toBeNull();
  });
});
