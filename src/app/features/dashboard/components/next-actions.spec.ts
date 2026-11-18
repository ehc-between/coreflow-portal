import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NextAction } from '../data/home.models';
import { NextActions } from './next-actions';

const action: NextAction = {
  key: 'process.first_review:p-1',
  kind: 'review',
  title_key: 'processes:nextActions.firstReview',
  why_key: 'processes:nextActions.firstReviewWhy',
  params: { code: 'PR-001', title: 'Innkjøp' },
  url: '/processes/p-1?review=1',
  priority: 2,
  module: 'processes',
} as NextAction;

describe('NextActions', () => {
  it('loads the scope of a module-owned action key and shows the translated text', async () => {
    TestBed.configureTestingModule({
      imports: [
        NextActions,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {},
            'processes/en': {
              nextActions: {
                firstReview: 'First review of {{ code }}',
                firstReviewWhy: 'Never reviewed',
              },
            },
          },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(NextActions);
    fixture.componentRef.setInput('actions', [action]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('First review of PR-001');
    expect(text).toContain('Never reviewed');
    expect(text).not.toContain('processes.nextActions');
  });
});
