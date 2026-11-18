import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import nb from '../../../assets/i18n/nb.json';
import { formatDueDay } from '../locale/locale-pipes';
import { DateInput, formatTypedDate, parseTypedDate } from './date-input/date-input';
import { EmptyState, EmptyStateKind } from './empty-state/empty-state';
import { StatusBadge } from './status-badge/status-badge';
import { plainStatus } from './tones';

// U41 copy rules: dates follow the app language, deadlines are dates, empty
// states say which empty they are, and registers use four plain status words.

function configure(imports: unknown[], lang = 'en') {
  TestBed.configureTestingModule({
    imports: [
      ...(imports as never[]),
      TranslocoTestingModule.forRoot({
        langs: { en, nb },
        translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: lang },
        preloadLangs: true,
      }),
    ],
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  });
  TestBed.inject(TranslocoService).setActiveLang(lang);
}

describe('typed dates', () => {
  it('parses day-first in nb and month-first in en, plus ISO always', () => {
    expect(parseTypedDate('3.12.2026', 'nb')).toBe('2026-12-03');
    expect(parseTypedDate('03.12.26', 'nb')).toBe('2026-12-03');
    expect(parseTypedDate('12/3/2026', 'en')).toBe('2026-12-03');
    expect(parseTypedDate('2026-12-03', 'nb')).toBe('2026-12-03');
    expect(parseTypedDate('', 'nb')).toBe('');
    expect(parseTypedDate('31.02.2026', 'nb')).toBeNull();
    expect(parseTypedDate('soon', 'en')).toBeNull();
  });

  it('formats a day in the language order', () => {
    expect(formatTypedDate('2026-12-03', 'nb')).toBe('03.12.2026');
    expect(formatTypedDate('2026-12-03T00:00:00Z', 'en')).toBe('12/03/2026');
    expect(formatTypedDate(null, 'en')).toBe('');
  });
});

describe('formatDueDay', () => {
  const today = new Date(2026, 10, 19);

  it('drops the year in the current year', () => {
    expect(formatDueDay('2026-12-03', 'nb', today)).toBe('3. des.');
    expect(formatDueDay('2026-12-03', 'en', today)).toBe('Dec 3');
  });

  it('keeps the year otherwise, and is empty for no date', () => {
    expect(formatDueDay('2027-01-05', 'nb', today)).toBe('5. jan. 2027');
    expect(formatDueDay(null, 'nb', today)).toBe('');
  });
});

describe('plainStatus', () => {
  it('maps workflow states onto four plain words', () => {
    expect(plainStatus('draft')).toBe('open');
    expect(plainStatus('submitted')).toBe('open');
    expect(plainStatus('under_review')).toBe('inProgress');
    expect(plainStatus('on_hold')).toBe('inProgress');
    expect(plainStatus('overdue')).toBe('overdue');
    expect(plainStatus('resolved')).toBe('closed');
    expect(plainStatus('cancelled')).toBe('closed');
    expect(plainStatus('something_else')).toBeNull();
  });
});

@Component({
  imports: [DateInput],
  template: `<app-date-input inputId="d" [(value)]="value" />`,
})
class DateHost {
  readonly value = signal<string | null>('2026-12-03');
}

describe('DateInput', () => {
  async function setup(lang: string) {
    configure([DateHost], lang);
    const fixture = TestBed.createComponent(DateHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = el.querySelector<HTMLInputElement>('[data-testid="date-input-text"]')!;
    return { fixture, el, text };
  }

  it('shows the day in the app language, not the browser locale', async () => {
    const { text } = await setup('nb');
    expect(text.value).toBe('03.12.2026');
    expect(text.placeholder).toBe('dd.mm.åååå');
  });

  it('accepts a typed date and a picked date', async () => {
    const { fixture, el, text } = await setup('nb');
    text.value = '24.12.2026';
    text.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.value()).toBe('2026-12-24');

    text.value = '1.1.27';
    text.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.value()).toBe('2026-12-24');
    text.dispatchEvent(new Event('blur'));
    expect(fixture.componentInstance.value()).toBe('2027-01-01');

    const native = el.querySelector<HTMLInputElement>('input[type="date"]')!;
    native.value = '2027-02-14';
    native.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.value()).toBe('2027-02-14');
  });

  it('flags text that is not a date and keeps the value', async () => {
    const { fixture, text } = await setup('en');
    expect(text.value).toBe('12/03/2026');
    text.value = '31/31/2026';
    text.dispatchEvent(new Event('input'));
    text.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(text.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.componentInstance.value()).toBe('2026-12-03');
  });
});

@Component({
  imports: [EmptyState, StatusBadge],
  template: `
    <app-empty-state [kind]="kind()" templateLink="/templates" />
    <app-status-badge [value]="status()" [plain]="true" />
  `,
})
class CopyHost {
  readonly kind = signal<EmptyStateKind>('first');
  readonly status = signal('under_review');
}

describe('copy-rule components', () => {
  it('distinguishes first-use from cleared empties and offers a template', async () => {
    configure([CopyHost], 'nb');
    const fixture = TestBed.createComponent(CopyHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-kind="first"]')?.textContent).toContain(
      'Ingenting er registrert her ennå.',
    );
    expect(el.querySelector('[data-testid="empty-state-template"]')?.textContent).toContain(
      'Fyll ut fra mal',
    );

    fixture.componentInstance.kind.set('cleared');
    fixture.detectChanges();
    expect(el.querySelector('[data-kind="cleared"]')?.textContent).toContain('Du er à jour');
  });

  it('shows the plain status word with the real state as tooltip', async () => {
    configure([CopyHost], 'nb');
    const fixture = TestBed.createComponent(CopyHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const badge = (fixture.nativeElement as HTMLElement).querySelector('app-badge')!;
    expect(badge.textContent?.trim()).toBe('Pågår');
    expect(badge.getAttribute('title')).toBe('Til gjennomgang');
  });
});
