import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';
import { ReportsApi } from '../reports/data/reports-api';
import { AnnualCyclePage } from './annual-cycle-page';
import { AnnualCycleApi } from './data/annual-cycle-api';
import { YearItem, YearResponse } from './data/annual-cycle.models';

const NOW = new Date();
const THIS_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;

function item(overrides: Partial<YearItem>): YearItem {
  return {
    id: 'due:supplier:1',
    source: 'due',
    entity_type: 'supplier',
    entity_id: '1',
    title: 'Fjord Cloud Hosting AS',
    code: null,
    area: 'contacts',
    module: 'suppliers',
    kind: 'due',
    month: THIS_MONTH,
    due_at: '2026-11-27T00:00:00',
    days: 5,
    recurrence: null,
    owner_name: null,
    status: 'soon',
    detail: null,
    action: { kind: 'open', label_key: 'annual.actions.openSupplier', url: '/suppliers/1' },
    requirement_refs: ['ISO 27001 A.5.20'],
    ...overrides,
  };
}

const RESPONSE: YearResponse = {
  from_month: THIS_MONTH,
  months: [
    {
      month: THIS_MONTH,
      counts: { overdue: 1, soon: 1, planned: 0, not_planned: 1, recurring: 0 },
    },
  ],
  items: [
    item({
      id: 'due:training_record:2',
      title: 'Brannvernopplæring',
      status: 'overdue',
      area: 'people',
      module: 'training',
      owner_name: 'Erik Larsen',
      action: { kind: 'remind', label_key: 'annual.actions.remind', url: null },
    }),
    item({}),
    item({
      id: 'gap:internal_audit',
      source: 'gap',
      title: 'Internrevisjon',
      status: 'not_planned',
      recurrence: 'yearly',
      detail: 'Gå gjennom prosessene',
      action: { kind: 'plan', label_key: 'annual.actions.plan', url: '/audits' },
    }),
  ],
  truncated: false,
  areas: ['speakUp', 'annual', 'company', 'people', 'contacts', 'handbook', 'documents'],
  can_propose: true,
};

function setup(showReq = false) {
  const api = {
    year: vi.fn(() => of(RESPONSE)),
    remind: vi.fn(() => of({ sent: true, already: false, recipient_name: 'Erik Larsen' })),
    propose: vi.fn(() => of({ year: 2027, items: [] })),
    accept: vi.fn(),
  };
  const notifications = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.configureTestingModule({
    imports: [AnnualCyclePage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions: [] }),
        },
      },
      {
        provide: LanguageService,
        useValue: {
          active: signal('nb'),
          translate: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}:${JSON.stringify(params)}` : key,
        },
      },
      { provide: RequirementsVisibilityService, useValue: { show: signal(showReq) } },
      { provide: AnnualCycleApi, useValue: api },
      { provide: ReportsApi, useValue: { calendarIcs: vi.fn() } },
      { provide: NotificationService, useValue: notifications },
    ],
  });
  const fixture = TestBed.createComponent(AnnualCyclePage);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, api, notifications };
}

describe('AnnualCyclePage', () => {
  it('renders the month strip and one row per item with one action each', async () => {
    const { fixture, el, api } = setup();
    await fixture.whenStable();
    expect(api.year).toHaveBeenCalledWith('org-1', { area: null, mine: false });
    expect(el.querySelectorAll('[data-testid="annual-strip"] button')).toHaveLength(1);
    expect(el.querySelectorAll('[data-testid="annual-strip"] i')).toHaveLength(3);
    const rows = Array.from(el.querySelectorAll('[data-testid="annual-row"]'));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.querySelectorAll('a, button')).toHaveLength(1);
    }
    expect(rows[1].querySelector('a')?.getAttribute('href')).toBe('/suppliers/1');
    expect(rows[0].textContent).toContain('annual.owner');
    // Vis krav off: no requirement chips.
    expect(el.querySelector('[data-testid="req-pills"]')).toBeNull();
    // The subscribe button needs reports:read.
    expect(el.querySelector('[data-testid="annual-subscribe"]')).toBeNull();
    expect(el.querySelector('[data-testid="annual-propose"]')).not.toBeNull();
  });

  it('shows requirement chips when Vis krav is on', async () => {
    const { fixture, el } = setup(true);
    await fixture.whenStable();
    expect(el.querySelectorAll('[data-testid="req-pills"]').length).toBeGreaterThan(0);
  });

  it('reminds the owner and marks the row', async () => {
    const { fixture, el, api, notifications } = setup();
    await fixture.whenStable();
    const button = el.querySelector<HTMLButtonElement>('[data-testid="annual-row"] button')!;
    button.click();
    await fixture.whenStable();
    expect(api.remind).toHaveBeenCalledWith('org-1', 'due:training_record:2');
    expect(notifications.success).toHaveBeenCalledWith('annual.remind.sent', {
      name: 'Erik Larsen',
    });
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('annual.actions.reminded');
  });

  it('filters by area and reloads', async () => {
    const { fixture, el, api } = setup();
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('[data-testid="annual-area-people"]')!.click();
    await fixture.whenStable();
    expect(api.year).toHaveBeenLastCalledWith('org-1', { area: 'people', mine: false });
    el.querySelector<HTMLButtonElement>('[data-testid="annual-mine"]')!.click();
    await fixture.whenStable();
    expect(api.year).toHaveBeenLastCalledWith('org-1', { area: 'people', mine: true });
  });

  it('opens the proposal pre-ticked for a not-planned duty', async () => {
    const { fixture, el, api } = setup();
    await fixture.whenStable();
    const rows = el.querySelectorAll('[data-testid="annual-row"]');
    rows[2].querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    // Plans the gap's own year, not next year's wheel.
    expect(api.propose).toHaveBeenCalledWith('org-1', Number(THIS_MONTH.slice(0, 4)));
  });

  it('links to the module instead of planning when the user cannot propose', async () => {
    const { fixture, el, api } = setup();
    api.year.mockReturnValue(of({ ...RESPONSE, can_propose: false }));
    (fixture.componentInstance as unknown as { load(): void }).load();
    await fixture.whenStable();
    fixture.detectChanges();
    const gapRow = el.querySelectorAll('[data-testid="annual-row"]')[2];
    expect(gapRow.querySelector('button')).toBeNull();
    expect(gapRow.querySelector('a')?.getAttribute('href')).toBe('/audits');
  });
});
