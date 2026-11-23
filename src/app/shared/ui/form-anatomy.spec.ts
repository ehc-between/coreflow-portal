import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import nb from '../../../assets/i18n/nb.json';
import { FormActions } from './form-actions/form-actions';
import { FormField } from './form-field/form-field';
import { FormSection } from './form-section/form-section';
import { PresetOption, PresetPicker } from './preset-picker/preset-picker';

function configure(imports: unknown[]) {
  TestBed.configureTestingModule({
    imports: [
      ...(imports as never[]),
      TranslocoTestingModule.forRoot({
        langs: { en, nb },
        translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [provideZonelessChangeDetection()],
  });
}

@Component({
  imports: [FormSection, FormField, FormActions],
  template: `
    <app-form-section title="Basics" description="What it is">
      <app-form-field label="Title" inputId="t" [required]="true" span="full" [error]="error()">
        <input id="t" />
      </app-form-field>
      <app-form-field label="Owner" inputId="o" hint="Who follows it up">
        <select id="o"></select>
      </app-form-field>
    </app-form-section>
    <app-form-actions [message]="error() ? 'Fix it' : ''"><button>Save</button></app-form-actions>
  `,
})
class FormHost {
  readonly error = signal('');
}

describe('form anatomy', () => {
  it('renders the section header, spans, hint and error with aria wiring', async () => {
    configure([FormHost]);
    const fixture = TestBed.createComponent(FormHost);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const section = el.querySelector('[data-testid="form-section"]')!;
    expect(section.querySelector('h2')?.textContent).toContain('Basics');
    expect(section.getAttribute('aria-labelledby')).toBe(section.querySelector('h2')?.id);

    const fields = el.querySelectorAll('app-form-field');
    expect(fields[0].classList).toContain('sm:col-span-2');
    expect(fields[1].classList).not.toContain('sm:col-span-2');
    expect(fields[0].textContent).toContain('*');

    expect(el.querySelector('#o-hint')?.textContent).toContain('Who follows it up');
    expect(el.querySelector('#o')?.getAttribute('aria-describedby')).toBe('o-hint');
    expect(el.querySelector('#t')?.hasAttribute('aria-invalid')).toBe(false);

    fixture.componentInstance.error.set('Fill in a title');
    await fixture.whenStable();
    expect(el.querySelector('#t-error')?.textContent).toContain('Fill in a title');
    expect(el.querySelector('#t')?.getAttribute('aria-describedby')).toBe('t-error');
    expect(el.querySelector('#t')?.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('[data-testid="form-actions-message"]')?.textContent).toContain(
      'Fix it',
    );

    fixture.componentInstance.error.set('');
    await fixture.whenStable();
    expect(el.querySelector('#t')?.hasAttribute('aria-invalid')).toBe(false);
    expect(el.querySelector('#t')?.hasAttribute('aria-describedby')).toBe(false);
  });
});

@Component({
  imports: [PresetPicker],
  template: `
    <app-preset-picker
      title="Start from"
      [options]="options"
      [selected]="selected()"
      [visible]="3"
      (picked)="selected.set($event)"
    />
  `,
})
class PresetHost {
  readonly options: PresetOption[] = ['a', 'b', 'c', 'd', 'e'].map((key) => ({
    key,
    label: key.toUpperCase(),
  }));
  readonly selected = signal<string | null>(null);
}

describe('PresetPicker', () => {
  it('shows the first tiles, keeps the picked one visible and expands on demand', async () => {
    configure([PresetHost]);
    const fixture = TestBed.createComponent(PresetHost);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const tiles = () => [...el.querySelectorAll('[data-testid^="preset-"][aria-pressed]')];

    expect(tiles().map((t) => t.textContent?.trim())).toEqual(['A', 'B', 'C']);
    const toggle = el.querySelector<HTMLButtonElement>('[data-testid="preset-toggle"]')!;
    expect(toggle.textContent).toContain('Show all (5)');

    fixture.componentInstance.selected.set('e');
    await fixture.whenStable();
    expect(tiles().map((t) => t.textContent?.trim())).toEqual(['A', 'B', 'E']);

    toggle.click();
    await fixture.whenStable();
    expect(tiles()).toHaveLength(5);
    el.querySelector<HTMLButtonElement>('[data-testid="preset-b"]')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('b');
    expect(el.querySelector('[data-testid="preset-b"]')?.getAttribute('aria-pressed')).toBe('true');
  });
});
