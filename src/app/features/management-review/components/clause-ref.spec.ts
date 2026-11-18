import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { TutorService } from '../../../core/guidance/tutor.service';
import { ClauseRef } from './clause-ref';

describe('ClauseRef', () => {
  it('loads the standards scope itself, so the label resolves on pages without a requirements panel', async () => {
    TestBed.configureTestingModule({
      imports: [
        ClauseRef,
        TranslocoTestingModule.forRoot({
          langs: { en: {}, 'standards/en': { reqs: { short: { hs: 'Shared ISO requirement' } } } },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: TutorService, useValue: { explainClause: vi.fn() } },
      ],
    });
    const load = vi.spyOn(TestBed.inject(TranslocoService), 'load');
    const fixture = TestBed.createComponent(ClauseRef);
    fixture.componentRef.setInput('ref', 'hs:9.3.2');
    fixture.componentRef.setInput('item', 'a');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledWith('standards/en');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('standards.reqs.short.hs');
  });
});
