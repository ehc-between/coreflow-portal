import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { LocalizedTitleResolver } from './localized-title';

describe('LocalizedTitleResolver', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: {
            en: {},
            nb: {},
            'privacy/en': { tasks: { breachAssess: 'Assess breach {{ code }}' } },
            'privacy/nb': { tasks: { breachAssess: 'Vurder bruddet {{ code }}' } },
          },
          translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'en' },
          preloadLangs: false,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: APP_CONFIG, useValue: { i18n: { availableLanguages: ['en', 'nb'] } } },
      ],
    });
  });

  const generated = {
    title: 'Assess the risk of breach BR-0001 and decide on notifying the authority',
    title_key: 'privacy:tasks.breachAssess',
    title_params: { code: 'BR-0001' },
  };

  it('loads the scope of the key on demand and renders the translation', async () => {
    const transloco = TestBed.inject(TranslocoService);
    await firstValueFrom(transloco.load('en'));
    const resolver = TestBed.inject(LocalizedTitleResolver);
    const loadSpy = vi.spyOn(transloco, 'load');

    resolver.resolve(generated);
    expect(loadSpy).toHaveBeenCalledWith('privacy/en');
    await firstValueFrom(transloco.load('privacy/en'));
    expect(resolver.resolve(generated)).toBe('Assess breach BR-0001');
    // Requested once per scope and language.
    resolver.resolve(generated);
    expect(loadSpy.mock.calls.filter(([path]) => path === 'privacy/en').length).toBe(2);
  });

  it('renders Norwegian for nb users', async () => {
    const transloco = TestBed.inject(TranslocoService);
    transloco.setActiveLang('nb');
    await firstValueFrom(transloco.load('nb'));
    await firstValueFrom(transloco.load('privacy/nb'));
    const resolver = TestBed.inject(LocalizedTitleResolver);
    expect(resolver.resolve(generated)).toBe('Vurder bruddet BR-0001');
  });

  it('keeps a hand-written title and falls back for an unknown key', async () => {
    const transloco = TestBed.inject(TranslocoService);
    await firstValueFrom(transloco.load('en'));
    await firstValueFrom(transloco.load('privacy/en'));
    const resolver = TestBed.inject(LocalizedTitleResolver);
    expect(resolver.resolve({ title: 'Call the insurer', title_key: null })).toBe(
      'Call the insurer',
    );
    expect(resolver.resolve({ title: 'Call the insurer' })).toBe('Call the insurer');
    expect(resolver.resolve({ title: 'Newer task', title_key: 'privacy:tasks.somethingNew' })).toBe(
      'Newer task',
    );
    expect(resolver.resolve(null)).toBe('');
  });
});
