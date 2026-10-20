import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { DeviationClassificationFields } from './classification-fields';

function setup() {
  TestBed.configureTestingModule({
    imports: [DeviationClassificationFields, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(DeviationClassificationFields);
  fixture.componentRef.setInput('idPrefix', 't');
  fixture.componentRef.setInput('standards', ['iso9001']);
  fixture.componentRef.setInput('tags', ['a']);
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('DeviationClassificationFields', () => {
  it('toggles standards', async () => {
    const { fixture, root } = setup();
    await fixture.whenStable();
    const boxes = root.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(boxes[0].checked).toBe(true);
    boxes[0].click();
    boxes[1].click();
    expect(fixture.componentInstance.standards()).toEqual(['iso14001']);
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

  it('adds, edits and removes clause rows', async () => {
    const { fixture, root } = setup();
    await fixture.whenStable();
    const add = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('deviations.create.addClause'),
    )!;
    add.click();
    await fixture.whenStable();
    const clause = root.querySelector<HTMLInputElement>('input[type=text]')!;
    clause.value = '8.7';
    clause.dispatchEvent(new Event('input'));
    const select = root.querySelector<HTMLSelectElement>('select')!;
    select.value = 'iso45001';
    select.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.clauses()).toEqual([{ standard: 'iso45001', clause: '8.7' }]);

    await fixture.whenStable();
    root
      .querySelector<HTMLButtonElement>('button[aria-label$="deviations.create.removeClause"]')!
      .click();
    expect(fixture.componentInstance.clauses()).toEqual([]);
  });
});
