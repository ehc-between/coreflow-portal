import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../core/config/app-config';
import { DeviationClassificationFields } from './classification-fields';

function setup(typical: string[] = []) {
  TestBed.configureTestingModule({
    imports: [DeviationClassificationFields, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: APP_CONFIG,
        useValue: {
          apiBaseUrl: 'http://api.test',
          i18n: { defaultLanguage: 'en', availableLanguages: ['en', 'nb'] },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeviationClassificationFields);
  fixture.componentRef.setInput('idPrefix', 't');
  fixture.componentRef.setInput('refs', ['iso9001:8.7']);
  fixture.componentRef.setInput('tags', ['a']);
  fixture.componentRef.setInput('typical', typical);
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('DeviationClassificationFields', () => {
  it('offers the typical clauses that are not cited yet, and adds one on click', async () => {
    const { fixture, root } = setup(['iso9001:8.7', 'hs:10.2']);
    await fixture.whenStable();
    const chips = root.querySelectorAll<HTMLButtonElement>(
      '[data-testid="typical-clauses"] button',
    );
    expect(chips.length).toBe(1);
    chips[0].click();
    expect(fixture.componentInstance.refs()).toEqual(['iso9001:8.7', 'hs:10.2']);
  });

  it('adds trimmed, de-duplicated tags on Enter and on blur', async () => {
    const { fixture, root } = setup();
    await fixture.whenStable();
    const input = root.querySelector<HTMLInputElement>('#t-tag')!;
    input.value = ' b ';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    input.value = 'a';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    expect(fixture.componentInstance.tags()).toEqual(['a', 'b']);
  });
});
