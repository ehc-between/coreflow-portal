import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  EnvironmentProviders,
  Provider,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { APP_CONFIG } from '../../core/config/app-config';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { KpiChart } from './components/kpi-chart';
import { ObjectivesApi } from './data/objectives-api';
import {
  KpiDetail,
  KpiSeries,
  Objective,
  ObjectiveDetail as ObjectiveDetailDto,
  ObjectivesOverview,
} from './data/objectives.models';
import { KpiEditor } from './kpi-editor';
import { ObjectiveEditor } from './objective-editor';
import { ObjectivesList } from './objectives-list';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeObjective(overrides: Partial<Objective> = {}): Objective {
  return {
    id: 'o-1',
    org_id: 'org-1',
    code: 'OBJ-001',
    title: 'Fewer complaints',
    description: null,
    management_system: 'iso9001',
    status: 'active',
    owner: { id: 'u-1', name: 'Ada' },
    department_id: null,
    target: 'Under 5 per 1000 orders',
    plan: null,
    resources: null,
    evaluation_method: null,
    start_date: '2026-01-01',
    due_date: '2026-12-31',
    overdue: false,
    progress: 40,
    closed_at: null,
    closing_note: null,
    kpis: { total: 1, on_track: 1, at_risk: 0, off_track: 0, no_data: 0 },
    url: '/objectives/o-1',
    created_by: 'u-1',
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-01-01T10:00:00',
    ...overrides,
  };
}

const OVERVIEW: ObjectivesOverview = {
  objectives: {
    total: 1,
    by_status: { draft: 0, active: 1, achieved: 0, not_achieved: 0, cancelled: 0 },
    overdue: 0,
  },
  kpis: { total: 1, on_track: 1, at_risk: 0, off_track: 0, no_data: 0, measurement_overdue: 0 },
};

function commonProviders(
  api: Partial<ObjectivesApi>,
  permissions: string[],
): (Provider | EnvironmentProviders)[] {
  const prompts: string[] = [];
  return [
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([{ path: '**', children: [] }]),
    { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
    ...provideFakeGuidance().providers,
    { provide: ObjectivesApi, useValue: api },
    { provide: AskPanelService, useValue: { prompts, showWith: (p: string) => prompts.push(p) } },
    { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
    {
      provide: SelectedOrgService,
      useValue: {
        currentOrgId: signal('org-1'),
        currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions }),
      },
    },
    {
      provide: AssigneeOptionsService,
      useValue: {
        options: signal({
          users: [{ value: 'user:u-1', label: 'Ada', labelIsKey: false }],
          roles: [],
          departments: [{ value: 'department:d-1', label: 'Support', labelIsKey: false }],
        }),
        ensureLoaded: () => undefined,
      },
    },
  ];
}

describe('ObjectivesList', () => {
  function setup(items: Objective[], permissions = ['objectives:read', 'objectives:write']) {
    const api = {
      list: vi.fn(() => of({ items, total: items.length })),
      overview: vi.fn(() => of(OVERVIEW)),
    };
    TestBed.configureTestingModule({
      imports: [ObjectivesList, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: commonProviders(api as unknown as Partial<ObjectivesApi>, permissions),
    });
    const fixture = TestBed.createComponent(ObjectivesList);
    fixture.detectChanges();
    return { fixture, api, el: fixture.nativeElement as HTMLElement };
  }

  it('loads open objectives and the overview for the current org', async () => {
    const { fixture, api, el } = setup([makeObjective()]);
    await flush();
    fixture.detectChanges();
    expect(api.list).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ status: ['draft', 'active'], sort: 'due_date', offset: 0 }),
    );
    expect(api.overview).toHaveBeenCalledWith('org-1', undefined, undefined);
    expect(el.querySelector('[data-testid="objectives-rows"]')?.textContent).toContain(
      'Fewer complaints',
    );
    expect(el.querySelector('[data-testid="tile-active"]')?.textContent).toContain('1');
  });

  it('filters by management system and status', async () => {
    const { fixture, api, el } = setup([makeObjective()]);
    await flush();
    const system = el.querySelector<HTMLSelectElement>('#obj-ms')!;
    system.value = 'iso27001';
    system.dispatchEvent(new Event('change'));
    const status = el.querySelector<HTMLSelectElement>('#obj-status')!;
    status.value = 'achieved';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await flush();
    expect(api.list).toHaveBeenLastCalledWith(
      'org-1',
      expect.objectContaining({ status: ['achieved'], management_system: 'iso27001' }),
    );
    expect(api.overview).toHaveBeenLastCalledWith('org-1', 'iso27001', undefined);
  });

  it('hides the create action without objectives:write', async () => {
    const { fixture, el } = setup([], ['objectives:read']);
    await flush();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('objectives.list.new');
  });
});

describe('KpiEditor', () => {
  function setup() {
    const created = { id: 'k-9' } as KpiDetail;
    const api = {
      list: vi.fn(() => of({ items: [makeObjective()], total: 1 })),
      get: vi.fn(() => of({ ...makeObjective(), kpi_items: [], can_edit: true, can_delete: true })),
      createKpi: vi.fn(() => of(created)),
    };
    TestBed.configureTestingModule({
      imports: [KpiEditor, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: commonProviders(api as unknown as Partial<ObjectivesApi>, ['objectives:write']),
    });
    const fixture = TestBed.createComponent(KpiEditor);
    fixture.componentRef.setInput('objective', 'o-1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = () => {
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
    };
    return { fixture, api, el, type, submit };
  }

  it('blocks a warning threshold on the wrong side of the target', async () => {
    const { fixture, api, el, type, submit } = setup();
    await flush();
    fixture.detectChanges();
    type('input[id$="-name"]', 'On-time delivery');
    type('input[id$="-target_value"]', '95');
    type('input[id$="-warning_value"]', '97');
    fixture.detectChanges();
    expect(el.textContent).toContain('objectives.errors.invalid_thresholds');
    submit();
    expect(api.createKpi).not.toHaveBeenCalled();
  });

  it('creates a KPI linked to the preselected objective', async () => {
    const { fixture, api, type, submit } = setup();
    await flush();
    fixture.detectChanges();
    type('input[id$="-name"]', 'On-time delivery');
    type('input[id$="-unit"]', '%');
    type('input[id$="-target_value"]', '95');
    type('input[id$="-warning_value"]', '90,5');
    submit();
    expect(api.createKpi).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        name: 'On-time delivery',
        objective_id: 'o-1',
        unit: '%',
        target_value: 95,
        warning_value: 90.5,
        direction: 'higher',
        frequency: 'monthly',
        measurement_reminders: true,
      }),
    );
  });

  it('shows the coded server error', async () => {
    const { api, el, type, submit } = setup();
    api.createKpi.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 422, error: { detail: { code: 'invalid_owner' } } }),
      ),
    );
    await flush();
    type('input[id$="-name"]', 'X');
    submit();
    expect(el.textContent).toContain('objectives.errors.invalid_owner');
  });
});

describe('KpiChart', () => {
  const series: KpiSeries = {
    kpi_id: 'k-1',
    unit: '%',
    direction: 'higher',
    target_value: 95,
    warning_value: 90,
    baseline_value: 80,
    points: [
      {
        period_end: '2026-08-31',
        value: 88,
        status: 'off_track',
        target_value: 95,
        warning_value: 90,
      },
      {
        period_end: '2026-09-30',
        value: 92,
        status: 'at_risk',
        target_value: 95,
        warning_value: 90,
      },
      {
        period_end: '2026-10-31',
        value: 96,
        status: 'on_track',
        target_value: 95,
        warning_value: 90,
      },
    ],
    stats: {
      count: 3,
      latest: 96,
      previous: 92,
      change: 4,
      change_pct: 4.35,
      min: 88,
      max: 96,
      average: 92,
      trend: 'improving',
      on_track_share: 0.33,
    },
  };

  function setup(value: KpiSeries | null) {
    TestBed.configureTestingModule({
      imports: [KpiChart, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(KpiChart);
    fixture.componentRef.setInput('series', value);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('draws a focusable marker per point with target and warning lines', () => {
    const { el, fixture } = setup(series);
    const markers = el.querySelectorAll('g[tabindex="0"]');
    expect(markers.length).toBe(3);
    expect(el.querySelector('polyline')).toBeTruthy();
    expect(el.textContent).toContain('objectives.chart.target');
    expect(el.textContent).toContain('objectives.chart.warning');
    markers[1].dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="kpi-chart-tooltip"]')).toBeTruthy();
  });

  it('shows an empty state without points', () => {
    const { el } = setup(null);
    expect(el.querySelector('[data-testid="kpi-chart-empty"]')).toBeTruthy();
  });
});

describe('ObjectivesList tiles and paging', () => {
  it('filters the list from a tile and hides the pager when everything fits', async () => {
    const api = {
      list: vi.fn(() => of({ items: [makeObjective()], total: 1 })),
      overview: vi.fn(() =>
        of({
          ...OVERVIEW,
          objectives: {
            ...OVERVIEW.objectives,
            by_status: { ...OVERVIEW.objectives.by_status, draft: 2 },
          },
        }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [ObjectivesList, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: commonProviders(api as unknown as Partial<ObjectivesApi>, ['objectives:read']),
    });
    const fixture = TestBed.createComponent(ObjectivesList);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-pager')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid="tile-draft"]')!.click();
    fixture.detectChanges();
    await flush();
    expect(api.list).toHaveBeenLastCalledWith(
      'org-1',
      expect.objectContaining({ status: ['draft'] }),
    );
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="tile-draft"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});

describe('KpiEditor defaults from the objective', () => {
  it('takes the objective system, owner and department for a new KPI', async () => {
    const api = {
      list: vi.fn(() => of({ items: [makeObjective()], total: 1 })),
      get: vi.fn(() =>
        of({
          ...makeObjective({ department_id: 'd-1' }),
          kpi_items: [],
          can_edit: true,
          can_delete: true,
        }),
      ),
      createKpi: vi.fn(() => of({ id: 'k-9' } as KpiDetail)),
    };
    TestBed.configureTestingModule({
      imports: [KpiEditor, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: commonProviders(api as unknown as Partial<ObjectivesApi>, ['objectives:write']),
    });
    const fixture = TestBed.createComponent(KpiEditor);
    fixture.componentRef.setInput('objective', 'o-1');
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const name = el.querySelector<HTMLInputElement>('input[id$="-name"]')!;
    name.value = 'Complaint rate';
    name.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(api.get).toHaveBeenCalledWith('org-1', 'o-1');
    expect(api.createKpi).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        objective_id: 'o-1',
        management_system: 'iso9001',
        owner_user_id: 'u-1',
        department_id: 'd-1',
      }),
    );
  });

  it('reads the thresholds back in plain words', async () => {
    const api = {
      list: vi.fn(() => of({ items: [], total: 0 })),
      get: vi.fn(),
      createKpi: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [KpiEditor, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: commonProviders(api as unknown as Partial<ObjectivesApi>, ['objectives:write']),
    });
    const fixture = TestBed.createComponent(KpiEditor);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type('input[id$="-target_value"]', '95');
    type('input[id$="-warning_value"]', '90');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="threshold-reading"]')?.textContent).toContain(
      'objectives.kpiForm.reading.higher',
    );
  });
});

describe('ObjectiveEditor', () => {
  function setup() {
    const api = {
      create: vi.fn(() => of({ id: 'o-9' } as ObjectiveDetailDto)),
      createKpi: vi.fn(() => of({ id: 'k-1' } as KpiDetail)),
    };
    TestBed.configureTestingModule({
      imports: [ObjectiveEditor, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: commonProviders(api as unknown as Partial<ObjectivesApi>, ['objectives:write']),
    });
    const fixture = TestBed.createComponent(ObjectiveEditor);
    fixture.detectChanges();
    return { fixture, api, el: fixture.nativeElement as HTMLElement };
  }

  it('creates a draft with every picked system and no status or progress fields', async () => {
    const { fixture, api, el } = setup();
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[id$="-status"]')).toBeNull();
    expect(el.querySelector('[id$="-progress"]')).toBeNull();
    const title = el.querySelector<HTMLInputElement>('input[id$="-title"]')!;
    title.value = 'Fewer injuries';
    title.dispatchEvent(new Event('input'));
    for (const system of ['iso45001', 'iso9001']) {
      const box = el.querySelector<HTMLInputElement>(`[data-testid="system-${system}"]`)!;
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(api.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        title: 'Fewer injuries',
        status: 'draft',
        management_system: 'iso45001',
        management_systems: ['iso45001', 'iso9001'],
        origins: [],
      }),
    );
    const body = (api.create.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect('progress' in body).toBe(false);
  });

  it('marks the title as required and blocks saving without it', async () => {
    const { fixture, api, el } = setup();
    await flush();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.create).not.toHaveBeenCalled();
    expect(el.textContent).toContain('objectives.errors.title_required');
    const titleLabel = [...el.querySelectorAll('[data-testid="form-field-label"]')].find((l) =>
      l.textContent?.includes('objectives.fields.title'),
    );
    expect(titleLabel?.textContent).toContain('*');
  });
});
