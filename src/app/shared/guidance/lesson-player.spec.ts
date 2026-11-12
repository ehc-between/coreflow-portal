import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Lesson, LessonResult } from '../../core/guidance/guidance.models';
import { LessonPlayer, scoreQuiz } from './lesson-player';

const LESSON: Lesson = {
  title: 'Root causes',
  minutes: 3,
  sections: [
    { heading: 'One', body: 'First' },
    { heading: 'Two', body: 'Second' },
  ],
  quiz: [
    { question: 'Q1', options: ['a', 'b'], answer: 1 },
    { question: 'Q2', options: ['a', 'b', 'c'], answer: 0, explanation: 'Because' },
  ],
  pass_mark: 1,
};

function setup(lesson: Lesson = LESSON) {
  TestBed.configureTestingModule({
    imports: [
      LessonPlayer,
      TranslocoTestingModule.forRoot({ langs: { en: {}, 'guidance/en': {} } }),
    ],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(LessonPlayer);
  fixture.componentRef.setInput('lesson', lesson);
  const results: LessonResult[] = [];
  fixture.componentInstance.completed.subscribe((r) => results.push(r));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (testId: string) => {
    el.querySelector<HTMLButtonElement>(`[data-testid="${testId}"] button`)!.click();
    fixture.detectChanges();
  };
  const choose = (question: number, option: number) => {
    const fieldsets = el.querySelectorAll('[data-testid="quiz-question"]');
    const radio =
      fieldsets[question].querySelectorAll<HTMLInputElement>('input[type="radio"]')[option];
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  return { fixture, el, results, click, choose };
}

describe('scoreQuiz', () => {
  it('scores against the pass mark (default 0.8)', () => {
    expect(scoreQuiz(LESSON, [1, 0])).toEqual({ score: 100, passed: true, correct: 2 });
    expect(scoreQuiz(LESSON, [1, 2])).toEqual({ score: 50, passed: false, correct: 1 });
    const lenient = { ...LESSON, pass_mark: undefined };
    expect(scoreQuiz(lenient, [1, 2]).passed).toBe(false);
    const thirds: Lesson = {
      ...LESSON,
      pass_mark: 0.66,
      quiz: [...LESSON.quiz!, { question: 'Q3', options: ['x'], answer: 0 }],
    };
    expect(scoreQuiz(thirds, [1, 0, null])).toEqual({ score: 67, passed: true, correct: 2 });
  });
});

describe('LessonPlayer', () => {
  it('steps through the sections and then the quiz', () => {
    const { el, click, choose, results, fixture } = setup();
    expect(el.querySelector('[data-testid="lesson-section"]')?.textContent).toContain('One');
    click('lesson-next');
    expect(el.querySelector('[data-testid="lesson-section"]')?.textContent).toContain('Two');
    click('lesson-start-quiz');
    expect(el.querySelectorAll('[data-testid="quiz-question"]')).toHaveLength(2);

    const submit = () => el.querySelector<HTMLButtonElement>('[data-testid="quiz-submit"] button')!;
    expect(submit().disabled).toBe(true);
    choose(0, 1);
    choose(1, 2);
    expect(submit().disabled).toBe(false);
    submit().click();
    fixture.detectChanges();
    expect(results).toEqual([{ score: 50, passed: false }]);
    expect(el.querySelector('[data-testid="quiz-result"]')?.textContent).toContain(
      'guidance.quiz.failed',
    );
    expect(el.textContent).toContain('Because');

    click('quiz-retry');
    choose(0, 1);
    choose(1, 0);
    el.querySelector<HTMLButtonElement>('[data-testid="quiz-submit"] button')!.click();
    fixture.detectChanges();
    expect(results.at(-1)).toEqual({ score: 100, passed: true });
    expect(el.querySelector('[data-testid="quiz-retry"]')).toBeNull();
  });

  it('completes a lesson without a quiz once', () => {
    const { el, click, results, fixture } = setup({
      title: 'Short',
      sections: [{ heading: 'Only', body: 'Text' }],
    });
    click('lesson-finish');
    click('lesson-finish');
    fixture.detectChanges();
    expect(results).toEqual([{ score: null, passed: null }]);
    expect(el.querySelector('[data-testid="lesson-step"]')?.textContent).toContain(
      'guidance.lesson.step',
    );
  });
});
