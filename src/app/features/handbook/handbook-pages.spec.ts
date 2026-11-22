import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';
import { TasksApi } from '../../core/tasks/tasks-api';
import { AskPanelService } from '../ask/ask-panel.service';
import { HandbookApi } from './data/handbook-api';
import { HandbookBox, HandbookMap, HandbookPage as PageDto } from './data/handbook.models';
import { HandbookPage } from './handbook-page';
import { HandbookProcessPage } from './process-page';

const box = (id: string, extra: Partial<HandbookBox> = {}): HandbookBox => ({
  id,
  code: id,
  title: `Prosess ${id}`,
  category: 'core',
  chain_order: null,
  status: 'active',
  owner: { user_id: 'u', name: 'Erik Larsen' },
  procedure_count: 2,
  procedure_ids: ['d1'],
  dot: 'ok',
  dot_reason: null,
  open_cases: 0,
  ...extra,
});

const MAP: HandbookMap = {
  management: [box('m1', { category: 'management' })],
  core: [box('c1'), box('c2', { dot: 'bad', open_cases: 1 })],
  support: [box('s1', { category: 'support' }), box('s2', { category: 'support' })],
};

const PAGE: PageDto = {
  process: box('c1'),
  kind: 'core',
  purpose: null,
  owner_name: 'Erik Larsen',
  prev: null,
  next: { id: 'c2', title: 'Prosess c2' },
  is_first_core: true,
  is_last_core: false,
  steps: [
    {
      n: 1,
      node_id: 'a',
      type: 'task',
      label: 'Motta forespørsel',
      role: 'Selger',
      document: {
        id: 'd1',
        title: 'Rutine for forespørsler',
        code: 'PRO-001',
        type: 'procedure',
        status: 'approved',
        version: 'B',
        approved_at: '2026-03-02T10:00:00',
        read_pct: 92,
        review_overdue: false,
        review_soon: false,
        url: '/documents/d1',
      },
    },
    { n: 2, node_id: 'b', type: 'task', label: 'Lag tilbud', role: null, document: null },
  ],
  procedures: [],
  roles: [{ label: 'Motta forespørsel', role: 'Selger' }],
  risks: [{ id: null, title: 'Kravene blir misforstått', code: null, level: 'medium', url: null }],
  performance: { kpis: [], cases_12m: { open: 1, closed: 4 } },
  can_edit: true,
  can_manage: false,
};

function providers(api: Partial<HandbookApi>, permissions: string[] = []) {
  return [
    provideZonelessChangeDetection(),
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: {
        snapshot: { queryParamMap: convertToParamMap({}) },
        queryParamMap: of(convertToParamMap({})),
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
      provide: LanguageService,
      useValue: {
        active: signal('nb'),
        translate: (key: string, params?: Record<string, unknown>) =>
          params ? `${key}:${JSON.stringify(params)}` : key,
      },
    },
    { provide: RequirementsVisibilityService, useValue: { show: signal(false) } },
    { provide: HandbookApi, useValue: api },
    { provide: TasksApi, useValue: { myWork: vi.fn(() => of({ items: [] })) } },
    { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
    { provide: AskPanelService, useValue: { askAbout: vi.fn() } },
  ];
}

describe('HandbookPage', () => {
  it('draws the three bands and the value chain between the customer ends', async () => {
    const api = {
      map: vi.fn(() => of(MAP)),
      procedures: vi.fn(() => of([])),
      setOrder: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [HandbookPage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: providers(api, ['processes:write', 'documents:draft']),
    });
    const fixture = TestBed.createComponent(HandbookPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(api.map).toHaveBeenCalledWith('org-1');
    const chain = el.querySelector('[data-testid="handbook-chain"]')!;
    expect(chain.textContent).toContain('handbook.map.customerNeed');
    expect(chain.textContent).toContain('handbook.map.satisfied');
    expect(chain.querySelectorAll('app-handbook-process-box')).toHaveLength(2);
    expect(el.querySelectorAll('[data-testid="handbook-band-support"] a')).toHaveLength(2);
    expect(el.querySelector('[data-testid="handbook-box-c1"]')?.getAttribute('href')).toBe(
      '/handbook/c1',
    );
    expect(el.querySelector('[data-testid="handbook-new-procedure"]')).not.toBeNull();
    // Ordering needs processes:manage.
    expect(el.querySelector('[data-testid="handbook-order"]')).toBeNull();
  });
});

describe('HandbookProcessPage', () => {
  it('shows the steps with roles and procedures between the chain ends, and the cards', async () => {
    const api = { page: vi.fn(() => of(PAGE)) };
    TestBed.configureTestingModule({
      imports: [HandbookProcessPage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: providers(api),
    });
    const fixture = TestBed.createComponent(HandbookProcessPage);
    fixture.componentRef.setInput('id', 'c1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(api.page).toHaveBeenCalledWith('org-1', 'c1');
    const flow = el.querySelector('[data-testid="handbook-flow"]')!;
    expect(flow.textContent).toContain('handbook.process.fromCustomer');
    expect(el.querySelector('[data-testid="handbook-next"]')?.getAttribute('href')).toBe(
      '/handbook/c2',
    );
    const steps = el.querySelectorAll('[data-testid="handbook-step"]');
    expect(steps).toHaveLength(2);
    expect(steps[0].textContent).toContain('Selger');
    expect(steps[0].querySelector('a')?.getAttribute('href')).toBe('/documents/d1');
    expect(el.querySelector('[data-testid="handbook-card-risks"]')?.textContent).toContain(
      'Kravene blir misforstått',
    );
    expect(el.querySelector('[data-testid="handbook-cases"]')).not.toBeNull();
    // No documents:draft: no "+ Ny prosedyre".
    expect(el.querySelector('[data-testid="handbook-new-procedure"]')).toBeNull();
  });
});
