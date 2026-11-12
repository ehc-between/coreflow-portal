import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import continuityEn from '../../../assets/i18n/continuity/en.json';
import { PageContextService } from '../../core/ai/page-context';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { BiaList } from './bias/bia-list';
import { ContinuityOverview } from './continuity-overview';
import { BiaListItem, Overview } from './data/continuity.models';

const BASE = 'http://test/api';
const ORG = 'org-1';
const api = (path: string) => `${BASE}/v1/orgs/${ORG}/continuity${path}`;

const bia = (over: Partial<BiaListItem> = {}): BiaListItem => ({
  id: 'b-1',
  code: 'BIA-0001',
  title: 'Payroll',
  status: 'approved',
  criticality: 'critical',
  max_impact: 4,
  mtpd_minutes: 4320,
  rto_minutes: 1440,
  rpo_minutes: 240,
  owner: { id: 'u-1', name: 'Kari' },
  department_id: null,
  version: 2,
  next_review_on: '2026-01-01',
  review_state: 'overdue',
  plan_count: 0,
  updated_at: '2026-01-01T00:00:00',
  url: '/continuity/bias/b-1',
  ...over,
});

const overview: Overview = {
  bia: { total: 3, approved: 2, uncovered: 1, review_overdue: 0, critical: 1 },
  plans: { total: 1, approved: 1, in_review: 0, review_overdue: 1, not_exercised: 1 },
  exercises: {
    planned: 2,
    overdue: 1,
    next: { code: 'EX-0002', title: 'Tabletop', url: '/continuity/exercises/e-2' },
  },
  ict: { total: 2, ready: 1, attention: 0, gap: 1 },
  contacts: { total: 4, org_wide: 3, needs_verification: 1 },
  attention: {
    uncovered_bias: [{ code: 'BIA-0003', title: 'Support', url: '/continuity/bias/b-3' }],
    plans_review_overdue: [],
    plans_not_exercised: [],
    exercises_overdue: [],
    ict_gaps: [{ code: 'ICT-0001', title: 'ERP', url: '/continuity/ict-systems/i-1' }],
  },
};

function setup<T>(component: Type<T>, permissions: readonly string[]) {
  const prompts: string[] = [];
  TestBed.configureTestingModule({
    imports: [
      component,
      TranslocoTestingModule.forRoot({
        langs: { en: { ...en, continuity: continuityEn }, 'kit/en': kitEn },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions }).asReadonly(),
        },
      },
      { provide: AskPanelService, useValue: { showWith: (p: string) => prompts.push(p) } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(component);
  document.body.appendChild(fixture.nativeElement);
  return { fixture, http, prompts, root: fixture.nativeElement as HTMLElement };
}

describe('BiaList', () => {
  afterEach(() => document.body.replaceChildren());

  async function flush(
    s: ReturnType<typeof setup<BiaList>>,
    items: readonly BiaListItem[],
  ): Promise<void> {
    await s.fixture.whenStable();
    for (const req of s.http.match((r) => r.url === api('/bias'))) {
      req.flush({ items, total: items.length });
    }
    await s.fixture.whenStable();
  }

  it('lists BIAs with targets, status, a missing plan and an overdue review', async () => {
    const s = setup(BiaList, ['continuity:read', 'continuity:write']);
    await flush(s, [bia()]);
    const rows = s.root.querySelectorAll('[data-testid="bia-rows"] li');
    expect(rows.length).toBe(1);
    const text = rows[0].textContent ?? '';
    expect(text).toContain('BIA-0001');
    expect(text).toContain('Payroll');
    expect(text).toContain('1 d');
    expect(text).toContain('4 h');
    expect(text).toContain('Approved');
    expect(text).toContain('No plan');
    expect(text).toContain('Review overdue');
    expect(s.root.textContent).toContain('New impact analysis');
  });

  it('hides "new" without write access', async () => {
    const s = setup(BiaList, ['continuity:read']);
    await flush(s, [bia({ plan_count: 2 })]);
    expect(s.root.textContent).not.toContain('New impact analysis');
    expect(s.root.textContent).toContain('2 plan(s)');
  });

  it('re-queries with the chosen filter', async () => {
    const s = setup(BiaList, ['continuity:read']);
    await flush(s, [bia()]);
    const flag = s.root.querySelector<HTMLSelectElement>('#bia-f-flag')!;
    flag.value = 'uncovered';
    flag.dispatchEvent(new Event('change'));
    await s.fixture.whenStable();
    const req = s.http.expectOne((r) => r.url === api('/bias'));
    expect(req.request.params.get('uncovered')).toBe('true');
    req.flush({ items: [], total: 0 });
  });

  it('registers page context for the assistant', async () => {
    const s = setup(BiaList, ['continuity:read']);
    await flush(s, []);
    expect(TestBed.inject(PageContextService).current()).toMatchObject({
      module: 'continuity',
      entityType: 'bia',
      view: 'list',
    });
  });
});

describe('ContinuityOverview', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows the figures and the attention lists', async () => {
    const s = setup(ContinuityOverview, ['continuity:read']);
    await s.fixture.whenStable();
    s.http.expectOne(api('/overview')).flush(overview);
    await s.fixture.whenStable();
    const tiles = s.root.querySelector('[data-testid="overview-tiles"]')?.textContent ?? '';
    expect(tiles).toContain('Impact analyses');
    expect(tiles).toContain('2 approved · 1 without a plan');
    expect(tiles).toContain('1 ready · 1 with a gap');
    expect(s.root.textContent).toContain('Impact analyses without a plan');
    expect(s.root.textContent).toContain('BIA-0003');
    expect(s.root.textContent).toContain('ICT services with a readiness gap');
    expect(s.root.textContent).not.toContain('Plans overdue for review');
    expect(s.root.textContent).toContain('EX-0002');
  });

  it('asks the assistant to assess readiness', async () => {
    const s = setup(ContinuityOverview, ['continuity:read']);
    await s.fixture.whenStable();
    s.http.expectOne(api('/overview')).flush(overview);
    await s.fixture.whenStable();
    const button = [...s.root.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Assess readiness'),
    )!;
    button.click();
    expect(s.prompts.length).toBe(1);
    expect(s.prompts[0]).toContain('How ready are we');
  });
});
