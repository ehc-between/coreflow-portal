import { ComponentRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it } from 'vitest';
import en from '../../../assets/i18n/forms/en.json';
import nb from '../../../assets/i18n/forms/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { FieldSpec, LayoutSection } from '../../core/records/record.models';
import { DynamicForm } from '../records/dynamic-form';
import { CompleteRecord } from './complete-record';
import { CompleteGroup, fieldSpecGroups, fieldTier, isFilled } from './field-tier';

const FIELDS: FieldSpec[] = [
  { key: 'kind', label: 'Kind', type: 'text', required: true, tier: 'quick' },
  { key: 'where', label: { en: 'Where', nb: 'Hvor' }, type: 'text', tier: 'audit_relevant' },
  { key: 'plain', label: 'Plain', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea', tier: 'advanced' },
  { key: 'forced', label: 'Forced', type: 'text', required: true, tier: 'advanced' },
  { key: 'ok', label: 'OK', type: 'checkbox', tier: 'audit_relevant', section: 'review' },
];

const LAYOUT: LayoutSection[] = [
  {
    key: 'main',
    label: { en: 'Main', nb: 'Hoved' },
    fields: ['kind', 'where', 'plain'],
    columns: 1,
  },
  { key: 'more', label: 'More', fields: ['notes', 'forced', 'ok'], columns: 1 },
];

const transloco = () =>
  TranslocoTestingModule.forRoot({
    langs: { en: {}, 'forms/en': en, 'records/en': {} },
    translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
    preloadLangs: true,
  });

describe('U31 field tiers', () => {
  it('keeps en/nb at parity', () => expectKeyParity(en, nb));

  it('treats unset as audit_relevant and never folds a required field', () => {
    expect(fieldTier({})).toBe('audit_relevant');
    expect(fieldTier({ tier: 'quick' })).toBe('quick');
    expect(fieldTier({ tier: 'advanced' })).toBe('advanced');
    expect(fieldTier({ tier: 'advanced', required: true })).toBe('audit_relevant');
  });

  it('counts an answered checkbox as filled in', () => {
    expect(isFilled(false, 'checkbox')).toBe(true);
    expect(isFilled(undefined, 'checkbox')).toBe(false);
    expect(isFilled('', 'text')).toBe(false);
    expect(isFilled('x', 'text')).toBe(true);
  });

  it('builds checklist groups per section without advanced fields', () => {
    const groups = fieldSpecGroups(FIELDS, LAYOUT, { kind: 'a', ok: false }, 'nb');
    expect(groups.map((g) => g.key)).toEqual(['main', 'more']);
    expect(groups[0].title).toBe('Hoved');
    expect(groups[0].items.map((i) => [i.key, i.label, i.done])).toEqual([
      ['kind', 'Kind', true],
      ['where', 'Hvor', false],
      ['plain', 'Plain', false],
    ]);
    expect(groups[0].reasonKey).toBe('forms.complete.reason.audit');
    expect(groups[1].items.map((i) => i.key)).toEqual(['forced', 'ok']);
  });
});

describe('DynamicForm folding (U31)', () => {
  function setup(value: Record<string, unknown>, readonly = false) {
    TestBed.configureTestingModule({
      imports: [DynamicForm, transloco()],
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(DynamicForm);
    const ref = fixture.componentRef as ComponentRef<DynamicForm>;
    ref.setInput('fields', FIELDS);
    ref.setInput('layout', LAYOUT);
    ref.setInput('value', value);
    ref.setInput('readonly', readonly);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('folds advanced fields under "More fields" while editing', () => {
    const root = setup({});
    const fold = root.querySelector('[data-testid="more-fields"]') as HTMLDetailsElement;
    expect(fold).toBeTruthy();
    expect(fold.open).toBe(false);
    expect(fold.querySelector('summary')?.textContent).toContain('More fields (1)');
    expect(fold.textContent).toContain('Notes');
    // The required one stays on the first screen.
    const firstScreen = root.textContent!.replace(fold.textContent!, '');
    expect(firstScreen).toContain('Forced');
    expect(firstScreen).toContain('Where');
  });

  it('opens the fold when a folded field has a value, and does not fold in the read view', () => {
    const open = setup({ notes: 'x' });
    expect((open.querySelector('[data-testid="more-fields"]') as HTMLDetailsElement).open).toBe(
      true,
    );
    TestBed.resetTestingModule();
    const read = setup({}, true);
    expect(read.querySelector('[data-testid="more-fields"]')).toBeNull();
    expect(read.textContent).toContain('Notes');
  });
});

describe('CompleteRecord', () => {
  function setup(groups: CompleteGroup[], canEdit = true) {
    TestBed.configureTestingModule({
      imports: [CompleteRecord, transloco()],
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(CompleteRecord);
    fixture.componentRef.setInput('groups', groups);
    fixture.componentRef.setInput('canEdit', canEdit);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const GROUPS: CompleteGroup[] = [
    {
      key: 'a',
      title: 'Event',
      reasonKey: 'forms.complete.reason.audit',
      items: [
        { key: 'x', label: 'Where', done: false },
        { key: 'y', labelKey: 'forms.complete.fields.owner', done: true },
      ],
    },
    {
      key: 'b',
      titleKey: 'forms.complete.groups.followUp.title',
      reasonKey: 'forms.complete.groups.followUp.reason',
      items: [{ key: 'z', label: 'Done', done: true }],
    },
  ];

  it('lists only the groups and items still missing, with progress and reason', () => {
    const { root } = setup(GROUPS);
    expect(root.querySelector('[data-testid="complete-record-progress"]')?.textContent).toContain(
      '2 of 3 filled in',
    );
    expect(root.querySelectorAll('[data-testid="complete-record-group"]').length).toBe(1);
    const items = [...root.querySelectorAll('[data-testid="complete-record-item"]')];
    expect(items.map((i) => i.textContent?.trim())).toEqual(['Where']);
    expect(root.textContent).toContain('An auditor looks for this');
  });

  it('emits fill, and disappears when everything is filled in', () => {
    const { fixture, root } = setup(GROUPS);
    let filled = 0;
    fixture.componentInstance.fill.subscribe(() => filled++);
    (root.querySelector('[data-testid="complete-record-fill"]') as HTMLButtonElement).click();
    expect(filled).toBe(1);
    fixture.componentRef.setInput('groups', [GROUPS[1]]);
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="complete-record"]')).toBeNull();
  });
});
