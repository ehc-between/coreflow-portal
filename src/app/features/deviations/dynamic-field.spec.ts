import { ComponentRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { FieldDef } from '../../core/deviations/deviation.models';
import { DynamicField } from './dynamic-field';

function setup(field: FieldDef) {
  TestBed.configureTestingModule({
    imports: [DynamicField, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(DynamicField);
  const ref = fixture.componentRef as ComponentRef<DynamicField>;
  ref.setInput('field', field);
  return { fixture, ref };
}

describe('DynamicField', () => {
  it('renders a text input for a text field', () => {
    const { fixture } = setup({ key: 'note', label: 'Note', type: 'text', required: false });
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="text"]');
    expect(input).toBeTruthy();
  });

  it('renders a date input for a date field', () => {
    const { fixture } = setup({ key: 'when', label: 'When', type: 'date', required: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="date"]')).toBeTruthy();
  });

  it('emits the typed value for a text field', () => {
    const { fixture } = setup({ key: 'note', label: 'Note', type: 'text', required: false });
    fixture.detectChanges();
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="text"]');
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));

    expect(emitted).toEqual(['hello']);
  });

  it('toggles a multiselect option in and out of the value array', () => {
    const { ref, fixture } = setup({
      key: 'tags',
      label: 'Tags',
      type: 'multiselect',
      required: false,
      options: ['a', 'b'],
    });
    ref.setInput('value', ['a']);
    fixture.detectChanges();

    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));

    const component = fixture.componentInstance as unknown as {
      toggleOption: (o: string) => void;
    };
    component.toggleOption('b');
    expect(emitted.at(-1)).toEqual(['a', 'b']);

    ref.setInput('value', ['a', 'b']);
    fixture.detectChanges();
    component.toggleOption('a');
    expect(emitted.at(-1)).toEqual(['b']);
  });

  it('renders a select of options for a user field', () => {
    const { ref, fixture } = setup({
      key: 'reviewer',
      label: 'Reviewer',
      type: 'user',
      required: false,
    });
    ref.setInput('options', [{ id: 'u-1', name: 'Ada' }]);
    fixture.detectChanges();
    const options = fixture.nativeElement.querySelectorAll('select option');
    // Placeholder + the one user.
    expect(options.length).toBe(2);
    expect(options[1].textContent).toContain('Ada');
  });

  it('shows the server error message when provided', () => {
    const { ref, fixture } = setup({ key: 'note', label: 'Note', type: 'text', required: false });
    ref.setInput('error', 'This is required');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('This is required');
  });
});
