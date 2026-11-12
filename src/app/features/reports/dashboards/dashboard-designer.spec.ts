import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { GuidanceContentService } from '../../../core/guidance/guidance-content.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { DashboardConfig, WidgetCatalogItem } from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { DashboardDesigner } from './dashboard-designer';

function widget(key: string, isDefault: boolean): WidgetCatalogItem {
  return {
    key,
    module: key.split('.')[0],
    kind: 'number',
    permission: 'x:read',
    title_key: `reports:widgets.${key}.title`,
    description_key: null,
    frameworks: [],
    default: isDefault,
    available: true,
  };
}

const CONFIG: DashboardConfig = {
  scope: 'auditor',
  role_key: 'auditor',
  widgets: [{ key: 'reports.upcoming', framework: null, size: 'lg' }],
  updated_at: '2026-11-10T10:00:00',
  updated_by: { id: 'u-1', name: 'Ada' },
};

function setup() {
  const api = {
    widgets: vi.fn(() =>
      of({ items: [widget('tasks.overdue', true), widget('reports.upcoming', false)] }),
    ),
    dashboards: vi.fn(() => of({ items: [CONFIG] })),
    saveDashboard: vi.fn((_org: string, scope: string, widgets: unknown) =>
      of({ ...CONFIG, scope, role_key: scope === 'default' ? null : scope, widgets }),
    ),
    resetDashboard: vi.fn(() => of(undefined)),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [DashboardDesigner, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ReportsApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
      {
        provide: GuidanceContentService,
        useValue: {
          readPage: () => null,
          readFile: () => null,
          readLoaded: () => true,
          readTour: () => [],
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
            permissions: ['reports:manage'],
          }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DashboardDesigner);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const rows = () => el.querySelectorAll('[data-testid="designer-widgets"] > li');
  const button = (text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  return { fixture, api, toasts, el, rows, button };
}

describe('DashboardDesigner', () => {
  it('starts from the built-in layout for the organisation default and saves it', async () => {
    const { fixture, api, toasts, rows, button } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rows().length).toBe(1);

    const add = fixture.nativeElement.querySelector('#dash-add') as HTMLSelectElement;
    add.value = 'reports.upcoming';
    add.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(rows().length).toBe(2);

    button('reports.designer.save').click();
    expect(api.saveDashboard).toHaveBeenCalledWith('org-1', 'default', [
      { key: 'tasks.overdue', framework: null, size: 'md' },
      { key: 'reports.upcoming', framework: null, size: 'md' },
    ]);
    expect(toasts.success).toHaveBeenCalledWith('reports.designer.saved');
  });

  it('loads a role layout and resets it', async () => {
    const { fixture, api, rows, button, el } = setup();
    await fixture.whenStable();
    const scope = el.querySelector('#dash-scope') as HTMLSelectElement;
    scope.value = 'auditor';
    scope.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(rows().length).toBe(1);
    expect(rows()[0].querySelector('select')!.value).toBe('lg');

    button('reports.designer.reset').click();
    fixture.detectChanges();
    // Confirm in the dialog.
    const confirm = Array.from(el.querySelectorAll('app-confirm-dialog button')).find((b) =>
      b.textContent?.includes('reports.designer.reset'),
    ) as HTMLButtonElement;
    confirm.click();
    expect(api.resetDashboard).toHaveBeenCalledWith('org-1', 'auditor');
  });
});
