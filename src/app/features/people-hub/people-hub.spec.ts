import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { LocationsApi } from '../../core/locations/locations-api';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { action, loc } from '../company/hub-kit/hub.testing';
import { HomeApi } from '../dashboard/data/home-api';
import peopleHubRoutes from './people-hub.routes';
import { PeopleHub } from './people-hub';

function setup(permissions: string[]) {
  TestBed.configureTestingModule({
    imports: [TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: LocationsApi,
        useValue: {
          counts: vi.fn(() =>
            of({
              items: [
                loc('people.employees', 10),
                loc('training.courses', 5),
                loc('people.competences', 8),
                loc('assets.access_reviews', 2),
              ],
              generated_at: '',
            }),
          ),
        },
      },
      {
        provide: HomeApi,
        useValue: {
          nextActions: vi.fn(() =>
            of({
              items: [
                action('training', 'overdue', 't1'),
                action('risk', 'gap', 'r1'),
                action('recruitment', 'review', 'rc'),
                action('people', 'gap', 'p1'),
              ],
            }),
          ),
        },
      },
      { provide: ModuleService, useValue: { isEnabled: () => true } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions }),
        },
      },
      {
        provide: LanguageService,
        useValue: { active: signal('nb'), translate: (k: string) => k },
      },
    ],
  });
  const fixture = TestBed.createComponent(PeopleHub);
  fixture.detectChanges();
  return fixture;
}

describe('PeopleHub', () => {
  it('mounts at the area root', () => {
    expect(peopleHubRoutes.map((r) => r.path)).toEqual(['']);
  });

  it('shows the people cards, what needs attention and the primary action', async () => {
    const fixture = setup(['people:read', 'people:write', 'org:manage']);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const tiles = [...el.querySelectorAll('[data-testid="hub-tile"]')];
    expect(tiles.map((a) => a.getAttribute('href'))).toEqual([
      '/people/employees',
      '/training',
      '/people/competences',
      '/assets/access-reviews',
    ]);
    expect(tiles[0].querySelector('[data-testid="hub-tile-count"]')?.textContent?.trim()).toBe(
      '10',
    );

    const rows = [...el.querySelectorAll('[data-testid="attention-row"]')];
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector('[data-testid="attention-cta"]')?.getAttribute('href')).toBe(
      '/training?a=1',
    );
    expect(rows[0].querySelector('span')?.className).toContain('bg-fail');
    expect(el.querySelector('[data-testid="people-new"]')?.getAttribute('href')).toBe(
      '/people/employees/new',
    );
    expect(
      el.querySelector('[data-testid="people-links"] a[href="/settings/members"]'),
    ).not.toBeNull();
  });

  it('hides writer and admin actions without the permissions', async () => {
    const fixture = setup(['people:read']);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="people-new"]')).toBeNull();
    expect(el.querySelector('[data-testid="people-links"] a[href="/settings/members"]')).toBeNull();
  });
});
