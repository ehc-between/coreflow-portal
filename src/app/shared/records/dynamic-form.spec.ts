import { ComponentRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { FieldSpec, LayoutSection } from '../../core/records/record.models';
import { DynamicForm } from './dynamic-form';

const FIELDS: FieldSpec[] = [
  { key: 'title', label: { en: 'Title', nb: 'Tittel' }, type: 'text', required: true },
  {
    key: 'kind',
    label: 'Kind',
    type: 'select',
    options: [
      { value: 'incident', label: { en: 'Incident', nb: 'Hendelse' } },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    key: 'injury',
    label: 'Injury',
    type: 'checkbox',
    visible_if: { field: 'kind', equals: 'incident' },
  },
  { key: 'l', label: 'Likelihood', type: 'number', width: 'half' },
  { key: 'c', label: 'Consequence', type: 'number', width: 'half' },
  { key: 'score', label: 'Score', type: 'calculated', formula: 'l * c' },
];

const LAYOUT: LayoutSection[] = [
  {
    key: 'main',
    label: { en: 'Main', nb: 'Hoved' },
    fields: ['title', 'kind', 'injury'],
    columns: 1,
  },
  { key: 'risk', label: 'Risk', fields: ['l', 'c', 'score'], columns: 2 },
];

function setup(value: Record<string, unknown> = {}, lang = 'en') {
  TestBed.configureTestingModule({
    imports: [DynamicForm, TranslocoTestingModule.forRoot({ langs: { en: {}, 'records/en': {} } })],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(DynamicForm);
  const ref = fixture.componentRef as ComponentRef<DynamicForm>;
  ref.setInput('fields', FIELDS);
  ref.setInput('layout', LAYOUT);
  ref.setInput('value', value);
  ref.setInput('lang', lang);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, ref, root };
}

describe('DynamicForm', () => {
  it('renders sections with localized legends and labels', () => {
    const { root } = setup({}, 'nb');
    const legends = [...root.querySelectorAll('legend')].map((l) => l.textContent?.trim());
    expect(legends).toContain('Hoved');
    expect(root.textContent).toContain('Tittel');
    expect(root.querySelector('[data-field="title"] input')).toBeTruthy();
  });

  it('hides fields until their visible_if condition holds', () => {
    const { fixture, ref, root } = setup({ kind: 'other' });
    expect(root.querySelector('[data-field="injury"]')).toBeNull();
    ref.setInput('value', { kind: 'incident' });
    fixture.detectChanges();
    expect(root.querySelector('[data-field="injury"]')).toBeTruthy();
  });

  it('shows calculated values read-only and emits recomputed data', () => {
    const { fixture, root } = setup({ l: 2, c: 3 });
    expect(root.querySelector('[data-field="score"] input')).toBeNull();
    expect(root.querySelector('[data-field="score"]')?.textContent).toContain('6');

    const emitted: Record<string, unknown>[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    const input = root.querySelector<HTMLInputElement>('[data-field="l"] input')!;
    input.value = '4';
    input.dispatchEvent(new Event('input'));
    expect(emitted.at(-1)).toEqual({ l: 4, c: 3, score: 12 });
  });

  it('marks fields with server errors and links the message', () => {
    const { fixture, ref, root } = setup();
    ref.setInput('errors', { title: 'required' });
    fixture.detectChanges();
    const input = root.querySelector<HTMLInputElement>('[data-field="title"] input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby')!;
    expect(root.querySelector(`#${describedBy}`)?.textContent).toContain(
      'records.form.errors.required',
    );
  });

  it('renders the read view when readonly', () => {
    const { fixture, ref, root } = setup({ title: 'Leak', kind: 'incident' });
    ref.setInput('readonly', true);
    fixture.detectChanges();
    expect(root.querySelector('input')).toBeNull();
    expect(root.textContent).toContain('Leak');
    expect(root.textContent).toContain('Incident');
  });
});
