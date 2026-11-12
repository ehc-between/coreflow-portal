import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { DashboardResponse } from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { MetricView } from './metric-view';
import { ReportWidgets } from './report-widgets';

const DASHBOARD: DashboardResponse = {
  source: 'org',
  role_key: null,
  framework: null,
  generated_at: '2026-11-12T08:00:00',
  widgets: [
    {
      key: 'tasks.overdue',
      framework: null,
      size: 'sm',
      module: 'tasks',
      kind: 'number',
      title_key: 'reports:widgets.overdueTasks.title',
      available: true,
      data: { value: 7, due_soon: 2 },
    },
    {
      key: 'standards.readiness',
      framework: 'iso27001',
      size: 'lg',
      module: 'standards',
      kind: 'readiness',
      title_key: 'reports:widgets.readiness.title',
      available: false,
      data: null,
    },
  ],
};

function setup(response = of(DASHBOARD)) {
  const api = { dashboard: vi.fn(() => response) };
  TestBed.configureTestingModule({
    imports: [ReportWidgets, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ReportsApi, useValue: api },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal('org-1'), currentOrg: signal(null) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ReportWidgets);
  fixture.detectChanges();
  return { fixture, api, el: fixture.nativeElement as HTMLElement };
}

describe('ReportWidgets', () => {
  it('loads the caller dashboard and renders each widget', async () => {
    const { fixture, api, el } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.dashboard).toHaveBeenCalledWith('org-1', null);
    const widgets = el.querySelectorAll('[data-testid="report-widget"]');
    expect(widgets.length).toBe(2);
    expect(widgets[0].textContent).toContain('7');
    // A widget the caller cannot see says so instead of showing data.
    expect(widgets[1].textContent).toContain('reports.widgets.unavailable');
    expect(el.textContent).toContain('reports.widgets.sourceOrg');
  });

  it('shows a neutral message when the dashboard fails to load', async () => {
    const { fixture, el } = setup(throwError(() => new Error('down')));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('reports.widgets.loadFailed');
  });
});

describe('MetricView', () => {
  function render(kind: string, data: Record<string, unknown>) {
    TestBed.configureTestingModule({
      imports: [MetricView, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(MetricView);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders findings with a severity breakdown', () => {
    const el = render('findings', {
      open: 5,
      overdue: 1,
      open_actions: 3,
      overdue_actions: 0,
      by_severity: { low: 1, critical: 4 },
      by_standard: { iso9001: 5 },
    });
    expect(el.textContent).toContain('5');
    expect(el.textContent).toContain('reports.fields.by_severity');
    // Critical is listed before low, and the by-standard map is not shown.
    const labels = Array.from(el.querySelectorAll('li span:first-child')).map((s) =>
      s.textContent?.trim(),
    );
    const critical = labels.findIndex((l) => l?.endsWith('severity.critical'));
    const low = labels.findIndex((l) => l?.endsWith('severity.low'));
    expect(critical).toBeGreaterThanOrEqual(0);
    expect(critical).toBeLessThan(low);
    expect(el.textContent).not.toContain('by_standard');
  });

  it('renders a heat map grid when the data has cells', () => {
    const el = render('heatmap', {
      rows: 3,
      cols: 3,
      cells: [{ likelihood: 3, consequence: 3, count: 2 }],
    });
    const grid = el.querySelector('[role="img"]')!;
    expect(grid.children.length).toBe(9);
    // Highest likelihood row first: the top-right cell carries the count.
    expect(grid.children[2].textContent?.trim()).toBe('2');
  });

  it('renders list items with links', () => {
    const el = render('list', {
      total: 1,
      items: [
        {
          entity_id: 'x',
          title: 'Fire drill',
          code: 'T-1',
          due_at: '2026-11-20T00:00:00',
          url: '/tasks/x',
        },
      ],
    });
    const link = el.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/tasks/x');
    expect(link.textContent).toContain('Fire drill');
  });
});
