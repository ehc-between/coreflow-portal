import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../assets/i18n/en.json';
import nb from '../../../../assets/i18n/nb.json';
import { GuidanceService } from '../../../core/guidance/guidance.service';
import { ModuleNav, ModuleNavItem } from './module-nav';

@Component({ template: '' })
class Blank {}

@Component({
  imports: [ModuleNav],
  template: `<app-module-nav labelKey="modules.names.risk" [items]="items()" />`,
})
class Host {
  readonly items = signal<readonly ModuleNavItem[]>([]);
}

const six: readonly ModuleNavItem[] = [
  { labelKey: 'ui.recordRow.title', link: '/m', exact: true, testId: 't1' },
  { labelKey: 'ui.recordRow.owner', link: '/m/b', testId: 't2' },
  { labelKey: 'ui.recordRow.status', link: '/m/c', testId: 't3' },
  { labelKey: 'ui.recordRow.code', link: '/m/d', testId: 't4' },
  { labelKey: 'ui.recordRow.coverage', link: '/m/e', testId: 't5', count: 2 },
  { labelKey: 'ui.recordRow.date.due', link: '/m/f', testId: 't6' },
];

async function setup(items: readonly ModuleNavItem[], url = '/m', beginner = false) {
  TestBed.configureTestingModule({
    imports: [
      Host,
      TranslocoTestingModule.forRoot({
        langs: { en, nb },
        translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', component: Blank }]),
      { provide: GuidanceService, useValue: { isBeginner: () => beginner } },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.items.set(items);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const tabs = () =>
    Array.from(el.querySelectorAll('nav ul a')).map((a) => a.getAttribute('data-testid'));
  const more = () => el.querySelector<HTMLButtonElement>('[data-testid="module-nav-more"]');
  return { fixture, el, tabs, more };
}

describe('ModuleNav (U30)', () => {
  it('shows every page as a tab and never renders a "More" menu', async () => {
    const { tabs, more, el } = await setup(six);
    expect(tabs()).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);
    expect(more()).toBeNull();
    expect(el.querySelector('[data-testid="module-nav-more-menu"]')).toBeNull();
  });

  it('marks a late tab as the current page', async () => {
    const { el } = await setup(six, '/m/e');
    expect(el.querySelector('[data-testid="t5"]')!.getAttribute('aria-current')).toBe('page');
    expect(el.querySelector('[data-testid="t1"]')!.getAttribute('aria-current')).toBeNull();
  });

  it('marks the module root active only on an exact match', async () => {
    const { el } = await setup(six, '/m');
    expect(el.querySelector('[data-testid="t1"]')!.getAttribute('aria-current')).toBe('page');
    expect(el.querySelector('[data-testid="t2"]')!.getAttribute('aria-current')).toBeNull();
  });

  it('never hides empty tabs, not even for beginners', async () => {
    const items: ModuleNavItem[] = [six[0], { ...six[1], empty: true }, { ...six[2], empty: true }];
    const beginner = await setup(items, '/m/c', true);
    expect(beginner.tabs()).toEqual(['t1', 't2', 't3']);
  });

  it('shows empty tabs to everyone else', async () => {
    const items: ModuleNavItem[] = [six[0], { ...six[1], empty: true }];
    const standard = await setup(items, '/m', false);
    expect(standard.tabs()).toEqual(['t1', 't2']);
  });
});
