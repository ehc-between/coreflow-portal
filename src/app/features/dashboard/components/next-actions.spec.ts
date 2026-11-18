import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../../core/config/app-config';
import { NextAction } from '../data/home.models';
import { NextActions } from './next-actions';

describe('NextActions', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        NextActions,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {},
            nb: {},
            'hse/en': {
              next: {
                ppeOverdue: {
                  title: '{{ count }} PPE items overdue for inspection',
                  why: 'Inspect them before use.',
                },
              },
            },
          },
          translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'en' },
          preloadLangs: false,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { i18n: { availableLanguages: ['en', 'nb'] } } },
      ],
    });
  });

  const action: NextAction = {
    key: 'hse.ppe_overdue',
    kind: 'overdue',
    title_key: 'hse:next.ppeOverdue.title',
    why_key: 'hse:next.ppeOverdue.why',
    params: { count: 2 },
    url: '/hse/ppe?overdue=true',
    priority: 0,
    module: 'hse',
  };

  it("loads a module action's scope on demand, so Home never shows the raw key", async () => {
    const transloco = TestBed.inject(TranslocoService);
    await firstValueFrom(transloco.load('en'));
    const loadSpy = vi.spyOn(transloco, 'load');

    const fixture = TestBed.createComponent(NextActions);
    fixture.componentRef.setInput('actions', [action]);
    await fixture.whenStable();
    expect(loadSpy).toHaveBeenCalledWith('hse/en');

    await firstValueFrom(transloco.load('hse/en'));
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('2 PPE items overdue for inspection');
    expect(text).toContain('Inspect them before use.');
    expect(text).not.toContain('hse.next.ppeOverdue');
  });
});
