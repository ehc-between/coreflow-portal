import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../assets/i18n/en.json';
import nb from '../../../../assets/i18n/nb.json';
import { DateTimeInput, parseTypedTime, splitLocalDateTime } from './datetime-input';

@Component({
  imports: [DateTimeInput, ReactiveFormsModule],
  template: `
    <app-datetime-input inputId="at" [(value)]="value" />
    <app-datetime-input inputId="ctl" [formControl]="control" />
  `,
})
class Host {
  readonly value = signal<string | null>('2026-12-03T14:05');
  readonly control = new FormControl<string>('2026-01-02T08:30:00');
}

async function setup(lang = 'nb') {
  TestBed.configureTestingModule({
    imports: [
      Host,
      TranslocoTestingModule.forRoot({
        langs: { en, nb },
        translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: lang },
        preloadLangs: true,
      }),
    ],
    providers: [provideZonelessChangeDetection()],
  });
  TestBed.inject(TranslocoService).setActiveLang(lang);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const [first, second] = Array.from(el.querySelectorAll('app-datetime-input'));
  const parts = (root: Element) => ({
    day: root.querySelector<HTMLInputElement>('[data-testid="date-input-text"]')!,
    time: root.querySelector<HTMLInputElement>('[data-testid="datetime-input-time"]')!,
  });
  return { fixture, el, a: parts(first), b: parts(second) };
}

describe('parseTypedTime / splitLocalDateTime', () => {
  it('parses 24 h times with or without a separator', () => {
    expect(parseTypedTime('9')).toBe('09:00');
    expect(parseTypedTime('930')).toBe('09:30');
    expect(parseTypedTime('0930')).toBe('09:30');
    expect(parseTypedTime('9:30')).toBe('09:30');
    expect(parseTypedTime('21.45')).toBe('21:45');
    expect(parseTypedTime('')).toBe('');
    expect(parseTypedTime('24:00')).toBeNull();
    expect(parseTypedTime('9:75')).toBeNull();
    expect(parseTypedTime('soon')).toBeNull();
  });

  it('splits an ISO local date-time', () => {
    expect(splitLocalDateTime('2026-12-03T14:05')).toEqual({ day: '2026-12-03', time: '14:05' });
    expect(splitLocalDateTime('2026-12-03T14:05:59')).toEqual({
      day: '2026-12-03',
      time: '14:05',
    });
    expect(splitLocalDateTime('2026-12-03')).toEqual({ day: '2026-12-03', time: '' });
    expect(splitLocalDateTime(null)).toEqual({ day: '', time: '' });
  });
});

describe('DateTimeInput', () => {
  it('shows the day first in nb and the time in 24 h, both labelled', async () => {
    const { a } = await setup('nb');
    expect(a.day.value).toBe('03.12.2026');
    expect(a.day.id).toBe('at');
    expect(a.time.value).toBe('14:05');
    expect(a.time.id).toBe('at-time');
    expect(a.time.getAttribute('aria-label')).toBe('Klokkeslett');
    expect(a.day.className).toContain('h-10');
    expect(a.time.className).toContain('h-10');
  });

  it('writes a datetime-local compatible value when the day or time changes', async () => {
    const { fixture, a } = await setup('nb');
    a.day.value = '24.12.2026';
    a.day.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.value()).toBe('2026-12-24T14:05');

    a.time.value = '0815';
    a.time.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.value()).toBe('2026-12-24T08:15');

    a.time.value = '7';
    a.time.dispatchEvent(new Event('input'));
    a.time.dispatchEvent(new Event('blur'));
    expect(fixture.componentInstance.value()).toBe('2026-12-24T07:00');
  });

  it('flags a time that is not valid and keeps the value', async () => {
    const { fixture, a } = await setup('en');
    a.time.value = '25:99';
    a.time.dispatchEvent(new Event('input'));
    a.time.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(a.time.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.componentInstance.value()).toBe('2026-12-03T14:05');
  });

  it('is a form control (seconds dropped, clearing the day clears the value)', async () => {
    const { fixture, b } = await setup('nb');
    expect(b.day.value).toBe('02.01.2026');
    expect(b.time.value).toBe('08:30');
    b.day.value = '';
    b.day.dispatchEvent(new Event('input'));
    b.day.dispatchEvent(new Event('blur'));
    expect(fixture.componentInstance.control.value).toBe('');
  });
});
