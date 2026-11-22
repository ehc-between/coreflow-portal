import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { SpeakUpApi } from '../speak-up/data/speak-up.api';
import { CaseList } from '../speak-up/data/speak-up.models';
import { CasesPage, parseTab, parseType } from './cases-page';
import { deviationsLanding } from '../deviations/deviations.routes';

const LIST: CaseList = {
  items: [
    {
      entity_type: 'data_breach',
      id: 'b1',
      code: 'BR-0007',
      title: 'Tapt PC på toget',
      type: 'data_breach',
      type_label: 'Brudd på personopplysninger',
      reporter_name: 'Kari',
      owner_name: 'Sofie',
      where: { kind: 'process', label: 'IT og informasjonssikkerhet', url: '/handbook/p1' },
      status: 'open',
      status_label: 'Vurderes',
      tone: 'bad',
      due_at: null,
      created_at: '2026-11-21T14:10:00',
      url: '/privacy/breaches/b1',
      module: 'privacy',
    },
  ],
  counts: { open: 5, mine: 2, closed: 31 },
  total: 1,
  intake_open: 2,
};

async function setup(permissions: string[] = ['deviations:read', 'deviations:intake']) {
  const api = { cases: vi.fn(() => of(LIST)) };
  TestBed.configureTestingModule({
    imports: [CasesPage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([
        { path: 'cases', component: CasesPage },
        {
          path: 'deviations',
          children: [
            { path: '', pathMatch: 'full', redirectTo: deviationsLanding },
            { path: 'all', children: [] },
          ],
        },
      ]),
      { provide: SpeakUpApi, useValue: api },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal('org1'), currentOrg: signal({ permissions }) },
      },
      { provide: ModuleService, useValue: { isEnabled: () => true } },
      { provide: LanguageService, useValue: { active: signal('nb'), locale: signal('nb') } },
    ],
  });
  const fixture = TestBed.createComponent(CasesPage);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement, api };
}

describe('CasesPage', () => {
  it('parses the query defensively', () => {
    expect(parseTab('mine')).toBe('mine');
    expect(parseTab('nope')).toBe('open');
    expect(parseType('data_breach')).toBe('data_breach');
    expect(parseType('risk')).toBeNull();
  });

  it('lists the cases with where, status and the deviation links', async () => {
    const { root, api } = await setup();
    expect(api.cases).toHaveBeenCalledWith('org1', {
      tab: 'open',
      type: null,
      q: null,
      limit: 50,
      offset: 0,
      lang: 'nb',
    });
    const row = root.querySelector('[data-testid="case-row"]')!;
    expect(row.textContent).toContain('Tapt PC på toget');
    expect(row.textContent).toContain('BR-0007 · Brudd på personopplysninger · Kari');
    expect(row.textContent).toContain('IT og informasjonssikkerhet');
    expect(row.textContent).toContain('Vurderes');
    expect(root.querySelector('[data-testid="type-intake"]')).toBeTruthy();
    const links = [...root.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      '/deviations/actions',
      '/deviations/stats',
      '/deviations/intake',
      '/deviations/all',
    ]);
  });

  it('appends the next page by offset (the API caps the page size)', async () => {
    const { root, fixture, api } = await setup();
    const page = (id: string) => ({ ...LIST.items[0], id, url: '/privacy/breaches/' + id });
    const first: CaseList = { ...LIST, items: [page('a')], total: 3 };
    api.cases.mockReturnValue(of(first));
    fixture.componentInstance['reload']();
    await fixture.whenStable();
    api.cases.mockReturnValue(of({ ...LIST, items: [page('b'), page('c')], total: 3 }));
    (
      root.querySelector('[data-testid="more"] button, [data-testid="more"]') as HTMLElement
    ).click();
    await fixture.whenStable();
    expect(api.cases).toHaveBeenLastCalledWith(
      'org1',
      expect.objectContaining({ limit: 50, offset: 1 }),
    );
    expect(root.querySelectorAll('[data-testid="case-row"]').length).toBe(3);
    expect(root.querySelector('[data-testid="more"]')).toBeNull();
  });

  it('hides intake for callers without the permission', async () => {
    const { root } = await setup(['deviations:read']);
    expect(root.querySelector('[data-testid="type-intake"]')).toBeNull();
    const links = [...root.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
    expect(links).not.toContain('/deviations/intake');
  });

  it('switches tab through the query string', async () => {
    const { root, fixture } = await setup();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    (root.querySelector('[data-testid="tab-closed"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { tab: 'closed' }, queryParamsHandling: 'merge' }),
    );
  });

  it('sends /deviations to Saker, and filtered links to the full list', async () => {
    await setup();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/deviations?tab=mine');
    expect(router.url).toBe('/cases?tab=mine&type=deviation');
    await router.navigateByUrl('/deviations?status=open&kpi=1');
    expect(router.url).toBe('/deviations/all?status=open&kpi=1');
  });
});
