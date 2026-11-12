import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import suppliersEn from '../../../assets/i18n/suppliers/en.json';
import { Question, SupplierStatus } from './data/supplier.models';
import { StatusChange, SupplierStatusDialog } from './detail/status-dialog';
import {
  AnswerChange,
  DraftAnswer,
  QuestionnaireAnswers,
} from './evaluations/questionnaire-answers';
import { EditableQuestion, QuestionEditor, toEditable } from './shared/question-editor';

const transloco = () =>
  TranslocoTestingModule.forRoot({
    langs: { en: { ...en, suppliers: suppliersEn } },
    translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
    preloadLangs: true,
  });

const question = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  text: `Question ${id}`,
  help: null,
  category: 'general',
  type: 'yes_no',
  weight: 1,
  max_score: 5,
  critical: false,
  required: true,
  ...over,
});

@Component({
  imports: [QuestionnaireAnswers, QuestionEditor, SupplierStatusDialog],
  template: `
    <app-questionnaire-answers
      [questions]="questions()"
      [answers]="answers()"
      [editable]="editable()"
      [highlight]="highlight()"
      (answerChange)="changes.push($event)"
    />
    <app-question-editor [questions]="rows()" (questionsChange)="rows.set($event)" />
    <app-supplier-status-dialog
      [open]="statusOpen()"
      [current]="status()"
      [canApprove]="canApprove()"
      (confirmed)="confirmed.push($event)"
    />
  `,
})
class Host {
  readonly questions = signal<readonly Question[]>([
    question('a', { critical: true }),
    question('b', { type: 'score', max_score: 3, category: 'Quality' }),
    question('c', { type: 'text', required: false }),
  ]);
  readonly answers = signal<Readonly<Record<string, DraftAnswer>>>({});
  readonly editable = signal(true);
  readonly highlight = signal<readonly string[]>([]);
  readonly rows = signal<readonly EditableQuestion[]>([toEditable({ text: 'First' })]);
  readonly statusOpen = signal(false);
  readonly status = signal<SupplierStatus>('prospective');
  readonly canApprove = signal(false);
  readonly changes: AnswerChange[] = [];
  readonly confirmed: StatusChange[] = [];
}

async function setup(): Promise<{ fixture: ComponentFixture<Host>; root: HTMLElement }> {
  TestBed.configureTestingModule({
    imports: [Host, transloco()],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('supplier components', () => {
  afterEach(() => document.body.replaceChildren());

  it('renders one control per question type, grouped by section, and marks critical ones', async () => {
    const { root } = await setup();
    expect(root.querySelectorAll('app-questionnaire-answers section').length).toBe(2);
    expect(root.querySelectorAll('input[type="radio"][name="q-a"]').length).toBe(3);
    const options = root.querySelectorAll('[data-question="b"] select option');
    // choose + 0..3 + not applicable
    expect(options.length).toBe(6);
    expect(root.querySelector('[data-question="c"] textarea')).not.toBeNull();
    expect(root.querySelector('[data-question="a"]')?.textContent).toContain('Critical');
    expect(root.querySelector('[data-question="c"]')?.textContent).toContain('Optional');
  });

  it('emits answer changes with normalised values', async () => {
    const { fixture, root } = await setup();
    root.querySelector<HTMLInputElement>('input[name="q-a"][value="no"]')!.click();
    const select = root.querySelector<HTMLSelectElement>('[data-question="b"] select')!;
    select.value = '2';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const changes = fixture.componentInstance.changes;
    expect(changes[0]).toEqual({ id: 'a', answer: { value: 'no', comment: '' } });
    expect(changes[1]).toEqual({ id: 'b', answer: { value: 2, comment: '' } });
  });

  it('highlights unanswered required questions and disables a read-only questionnaire', async () => {
    const { fixture, root } = await setup();
    fixture.componentInstance.highlight.set(['a']);
    fixture.componentInstance.editable.set(false);
    await fixture.whenStable();
    expect(root.querySelector('[data-question="a"]')?.classList).toContain('border-fail');
    expect(root.querySelector<HTMLFieldSetElement>('[data-question="a"] fieldset')!.disabled).toBe(
      true,
    );
  });

  it('adds, edits and removes questions in the editor', async () => {
    const { fixture, root } = await setup();
    root.querySelector<HTMLButtonElement>('[data-testid="question-add"]')!.click();
    await fixture.whenStable();
    expect(root.querySelectorAll('[data-testid="question-row"]').length).toBe(2);
    const text = root.querySelectorAll<HTMLTextAreaElement>(
      '[data-testid="question-row"] textarea',
    )[1];
    text.value = 'Second';
    text.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(fixture.componentInstance.rows()[1].text).toBe('Second');
    root.querySelector<HTMLButtonElement>('[aria-label="Remove question 1"]')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.rows().map((r) => r.text)).toEqual(['Second']);
  });

  it('offers only permitted statuses and requires a reason', async () => {
    const { fixture } = await setup();
    fixture.componentInstance.statusOpen.set(true);
    await fixture.whenStable();
    const select = document.querySelector<HTMLSelectElement>('#sup-st')!;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['', 'under_evaluation', 'inactive']);

    select.value = 'inactive';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const submit = document.querySelector<HTMLButtonElement>(
      'app-supplier-status-dialog button[type="submit"]',
    )!;
    expect(submit.disabled).toBe(true);

    const reason = document.querySelector<HTMLTextAreaElement>('#sup-st-r')!;
    reason.value = 'No longer used';
    reason.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(submit.disabled).toBe(false);
    submit.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.confirmed).toEqual([
      { status: 'inactive', reason: 'No longer used' },
    ]);
  });
});
