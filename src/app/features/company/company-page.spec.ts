import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { LocationsApi } from '../../core/locations/locations-api';
import { ModuleService } from '../../core/modules/module.service';
import { ModulesApi } from '../../core/modules/modules-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AuditsApi } from '../audits/data/audits-api';
import { HomeApi } from '../dashboard/data/home-api';
import { DocumentControlApi } from '../documents/data/document-control-api';
import { PeopleApi } from '../people/data/people-api';
import { CompanyPage } from './company-page';
import { CompanyTopicsPage } from './company-topics-page';
import { action, loc } from './hub-kit/hub.testing';

const COUNTS = [
  loc('context.interested_parties', 7),
  loc('context.policies', 2),
  loc('context.scopes', 2),
  loc('processes.register', 4),
  loc('privacy.ropa', 4),
  loc('assets.register', 9),
];

function setup(
  opts: { permissions?: string[]; counts?: ReturnType<typeof loc>[]; disabled?: string[] } = {},
) {
  const permissions = opts.permissions ?? [
    'org:manage',
    'context:write',
    'audits:read',
    'people:read',
    'documents:read',
  ];
  const listEmployees = vi.fn(() => of({ items: [{ full_name: 'Anne Berg' }], total: 1 }));
  TestBed.configureTestingModule({
    imports: [TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: LocationsApi,
        useValue: { counts: vi.fn(() => of({ items: opts.counts ?? COUNTS, generated_at: '' })) },
      },
      {
        provide: HomeApi,
        useValue: {
          nextActions: vi.fn(() =>
            of({ items: [action('privacy'), action('risk', 'overdue', 'r'), action('people')] }),
          ),
        },
      },
      {
        provide: ModulesApi,
        useValue: {
          getProfile: vi.fn(() =>
            of({
              org_number: '912 345 678',
              industry: 'Stål',
              size_band: '11-50',
              sites: [{ name: 'HQ', country: 'NO', city: 'Oslo' }],
              frameworks: ['iso9001', 'gdpr'],
            }),
          ),
        },
      },
      {
        provide: AuditsApi,
        useValue: {
          listCertifications: vi.fn(() =>
            of({
              items: [
                {
                  framework: 'iso9001',
                  status: 'certified',
                  next_surveillance_at: '2099-03-01T09:00:00',
                },
              ],
            }),
          ),
        },
      },
      {
        provide: PeopleApi,
        useValue: {
          listPositions: vi.fn(() =>
            of({
              items: [
                { id: 'p1', title: 'Kvalitetsleder' },
                { id: 'p2', title: 'Daglig leder' },
              ],
            }),
          ),
          listEmployees,
        },
      },
      {
        provide: DocumentControlApi,
        useValue: { listTypes: vi.fn(() => of([{ key: 'policy', document_count: 5 }])) },
      },
      {
        provide: ModuleService,
        useValue: { isEnabled: (m: string) => !(opts.disabled ?? []).includes(m) },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({ id: 'org-1', name: 'Acme AS', roles: [], permissions }),
        },
      },
      {
        provide: LanguageService,
        useValue: {
          active: signal('nb'),
          translate: (k: string, p?: Record<string, unknown>) =>
            p ? `${k}:${JSON.stringify(p)}` : k,
        },
      },
    ],
  });
  return { listEmployees };
}

describe('CompanyPage', () => {
  it('shows the company on one page: facts, key facts, cards and topics', async () => {
    const { listEmployees } = setup();
    const fixture = TestBed.createComponent(CompanyPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const text = (id: string) => el.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();

    expect(text('page-title')).toBe('Acme AS');
    expect(text('company-facts')).toContain('Stål');
    expect(text('company-facts')).toContain('Oslo');
    expect(text('company-standards')).toContain('home.standards.iso9001.short');
    expect(text('company-ceo')).toBe('Anne Berg');
    expect(listEmployees).toHaveBeenCalledWith('org-1', { position_id: 'p2', limit: 5 });
    expect(text('company-next-audit')).toContain('2099');
    // privacy + risk belong to Bedriften, people does not.
    expect((fixture.componentInstance as unknown as { attention: () => number }).attention()).toBe(
      2,
    );
    expect(el.querySelector('[data-testid="company-edit"]')).not.toBeNull();

    const hub = el.querySelector('[data-testid="company-hub"]')!;
    const keys = [...hub.querySelectorAll('[data-testid="hub-tile"]')].map((a) =>
      a.getAttribute('data-key'),
    );
    expect(keys).toEqual(['interestedParties', 'policies', 'processes', 'scope']);
    const policies = hub.querySelector('[data-key="policies"] [data-testid="hub-tile-count"]');
    expect(policies?.textContent?.trim()).toBe('5');
    expect(hub.querySelector('[data-key="processes"]')?.getAttribute('href')).toBe('/handbook');

    const topics = el.querySelector('[data-testid="company-topics"]')!;
    expect(
      [...topics.querySelectorAll('[data-testid="hub-tile"]')].map((a) =>
        a.getAttribute('data-key'),
      ),
    ).toEqual(['privacy', 'assets']);
    expect(el.querySelector('[data-testid="company-starter"]')).toBeNull();
  });

  it('offers the interview when the company has no context yet, and hides what is off', async () => {
    setup({
      permissions: ['context:write'],
      counts: [loc('context.interested_parties', 0), loc('context.scopes', 0)],
      disabled: ['audits', 'people'],
    });
    const fixture = TestBed.createComponent(CompanyPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="company-starter"] a')?.getAttribute('href')).toBe(
      '/context/interview',
    );
    expect(el.querySelector('[data-testid="company-ceo"]')).toBeNull();
    expect(el.querySelector('[data-testid="company-next-audit"]')).toBeNull();
    expect(el.querySelector('[data-testid="company-edit"]')).toBeNull();
    expect(el.querySelector('[data-testid="company-topics"]')).toBeNull();
  });
});

describe('CompanyTopicsPage', () => {
  it('lists the topic areas with their status', async () => {
    setup();
    const fixture = TestBed.createComponent(CompanyTopicsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const tiles = [...el.querySelectorAll('[data-testid="hub-tile"]')];
    expect(tiles.map((a) => a.getAttribute('href'))).toEqual(['/privacy', '/assets']);
    expect(tiles[0].textContent).toContain('hubs.topics.status.attention');
    expect(tiles[1].textContent).toContain('hubs.topics.status.ok');
  });
});
