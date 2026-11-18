import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ModuleConfigNav, moduleConfigNavItems } from './module-config-nav';

async function render(module: string): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [
      ModuleConfigNav,
      TranslocoTestingModule.forRoot({
        langs: {
          en: {
            settings: { moduleConfig: { note: 'Set up', openModule: 'Go to {{ module }}' } },
            modules: { names: { risk: 'Risk', feedback: 'Feedback' } },
          },
        },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(ModuleConfigNav);
  fixture.componentRef.setInput('module', module);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ModuleConfigNav (U10)', () => {
  it('lists the configuration pages of a module with more than one', () => {
    expect(moduleConfigNavItems('risk').map((i) => i.link)).toEqual([
      '/settings/modules/risk/matrices',
      '/settings/modules/risk/registers',
    ]);
    expect(moduleConfigNavItems('feedback')).toEqual([]);
    expect(moduleConfigNavItems('unknown')).toEqual([]);
  });

  it('shows tabs and the way back to the module', async () => {
    const root = await render('risk');
    expect(root.querySelectorAll('[data-testid^="module-config-nav-"]').length).toBe(2);
    const back = root.querySelector<HTMLAnchorElement>('[data-testid="module-config-open-module"]');
    expect(back?.getAttribute('href')).toBe('/risk');
    expect(back?.textContent).toContain('Go to Risk');
  });

  it('has no tabs for a one-page configuration, and links to the module by its URL', async () => {
    const root = await render('feedback');
    expect(root.querySelector('app-module-nav')).toBeNull();
    expect(
      root.querySelector('[data-testid="module-config-open-module"]')?.getAttribute('href'),
    ).toBe('/feedback');
  });
});
