import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import trainingEn from '../../../../assets/i18n/training/en.json';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { LearningProgressService } from '../../../core/guidance/learning-progress.service';
import { TutorService } from '../../../core/guidance/tutor.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { TrainingApi } from '../data/training-api';
import { Assignment, AttemptOut, Course, PlayerOut } from '../data/training.models';
import { CoursePlayer } from './course-player';

const COURSE: Course = {
  id: 'c1',
  code: 'TRN-001',
  title: 'Incident reporting',
  description: null,
  category: 'information_security',
  kind: 'course',
  status: 'published',
  owner: null,
  pass_mark: 0.8,
  validity_months: 12,
  estimated_minutes: 10,
  document_id: null,
  source: 'manual',
  version: 1,
  published_at: '2026-11-01T00:00:00',
  lesson_count: 2,
  quiz_count: 1,
  created_by: null,
  created_at: '2026-11-01T00:00:00',
  updated_at: '2026-11-01T00:00:00',
  url: '/training/courses/c1',
  can_edit: false,
};

const ASSIGNMENT = {
  id: 'a1',
  course: {
    id: 'c1',
    code: 'TRN-001',
    title: 'Incident reporting',
    kind: 'course',
    status: 'published',
    url: '',
  },
  user: { id: 'u1', name: 'Kari' },
  status: 'assigned',
  overdue: false,
  reason: 'rule',
  due_at: '2026-12-01T23:59:59',
} as Assignment;

function player(over: Partial<PlayerOut> = {}): PlayerOut {
  return {
    course: COURSE,
    document: null,
    assignment: ASSIGNMENT,
    latest_record: null,
    items: [
      {
        id: 'l1',
        position: 1,
        lesson_key: 'training.c1.l1',
        video_url: null,
        document: null,
        lesson: {
          title: 'What is an incident',
          minutes: 3,
          sections: [{ heading: 'Definition', body: 'Text' }],
          quiz: [{ question: 'Report within?', options: ['1 hour', '1 week'] }],
          pass_mark: 0.8,
        },
        progress: null,
      },
      {
        id: 'l2',
        position: 2,
        lesson_key: 'training.c1.l2',
        video_url: 'https://video.example/x',
        document: null,
        lesson: {
          title: 'How to report',
          minutes: 2,
          sections: [{ heading: 'Steps', body: 'Text' }],
          quiz: [],
          pass_mark: 0.8,
        },
        progress: null,
      },
    ],
    ...over,
  };
}

async function render(fixture: ComponentFixture<CoursePlayer>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function setup(data: PlayerOut, attempt?: AttemptOut) {
  const api = {
    player: vi.fn(() => of(data)),
    start: vi.fn(() => of({ ...data, assignment: { ...ASSIGNMENT, status: 'in_progress' } })),
    submitAttempt: vi.fn(() => of(attempt)),
  };
  const progress = { record: vi.fn(() => of(null)) };
  const fake = provideFakeGuidance({}, 'standard');
  TestBed.configureTestingModule({
    imports: [
      CoursePlayer,
      TranslocoTestingModule.forRoot({
        langs: { en: { training: trainingEn }, 'guidance/en': {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      ...fake.providers,
      { provide: TrainingApi, useValue: api },
      { provide: LearningProgressService, useValue: progress },
      { provide: TutorService, useValue: { teach: vi.fn(), explainClause: vi.fn() } },
      { provide: AiAvailability, useValue: { unavailable: signal(false) } },
      { provide: AskPanelService, useValue: { askAbout: vi.fn() } },
      {
        provide: LanguageService,
        useValue: { translate: (key: string) => key, locale: () => 'en', active: () => 'en' },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({
            id: 'org-1',
            name: 'Acme',
            roles: [],
            permissions: ['training:read'],
          }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CoursePlayer);
  fixture.componentRef.setInput('id', 'c1');
  return { fixture, api, progress };
}

function click(el: HTMLElement, selector: string) {
  const target = el.querySelector<HTMLElement>(
    `[data-testid="${selector}"] button, [data-testid="${selector}"]`,
  );
  if (!target) {
    throw new Error(`missing ${selector}`);
  }
  (target.tagName === 'BUTTON' ? target : (target.querySelector('button') ?? target)).click();
}

describe('CoursePlayer', () => {
  it('starts the assignment and records the first lesson as seen', async () => {
    const { fixture, api, progress } = setup(player());
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-testid="player-outline"] li')).toHaveLength(4);

    click(el, 'player-begin');
    await render(fixture);
    expect(api.start).toHaveBeenCalledWith('org-1', 'c1');
    expect(progress.record).toHaveBeenCalledWith('training', 'training.c1.l1', 'seen');
    // The shared lesson player shows the lesson without its quiz.
    expect(el.querySelector('[data-testid="lesson-section"]')?.textContent).toContain('Definition');
    expect(el.querySelector('[data-testid="lesson-start-quiz"]')).toBeNull();
  });

  it('submits every quiz answer for server scoring and shows the record', async () => {
    const attempt: AttemptOut = {
      passed: true,
      score: 100,
      pass_mark: 0.8,
      results: [{ lesson_id: 'l1', correct: 1, total: 1 }],
      assignment: null,
      record: { id: 'r1', certificate_no: 'TRN-001-0001' } as AttemptOut['record'],
    };
    const { fixture, api } = setup(player(), attempt);
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;

    click(el, 'player-assessment-link');
    await render(fixture);
    const submit = el.querySelector<HTMLButtonElement>('[data-testid="assessment-submit"] button');
    expect(submit?.disabled).toBe(true);
    expect(el.querySelectorAll('[data-testid="assessment-question"]')).toHaveLength(1);

    el.querySelector<HTMLInputElement>(
      '[data-testid="assessment-question"] input[type="radio"]',
    )?.click();
    await render(fixture);
    expect(submit?.disabled).toBe(false);
    el.querySelector<HTMLFormElement>('[data-testid="assessment-form"]')?.dispatchEvent(
      new Event('submit'),
    );
    await render(fixture);

    expect(api.submitAttempt).toHaveBeenCalledWith('org-1', 'c1', {
      answers: { l1: [0] },
      acknowledged: false,
      feedback_rating: null,
      feedback_comment: null,
    });
    expect(el.querySelector('[data-testid="attempt-result"]')?.textContent).toContain('100 %');
  });

  it('requires the acknowledgement for read-and-understood courses', async () => {
    const data = player({
      course: { ...COURSE, kind: 'read_and_understood' },
      document: {
        id: 'd1',
        title: 'Security policy',
        code: 'POL-1',
        url: '/documents/d1',
        rev: '3',
      },
      items: [],
    });
    const { fixture } = setup(data);
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    click(el, 'player-assessment-link');
    await render(fixture);
    const submit = el.querySelector<HTMLButtonElement>('[data-testid="assessment-submit"] button');
    expect(submit?.disabled).toBe(true);
    el.querySelector<HTMLInputElement>('[data-testid="assessment-ack"]')?.click();
    await render(fixture);
    expect(submit?.disabled).toBe(false);
  });

  it('tells learners that external training is recorded by a manager', async () => {
    const { fixture } = setup(player({ course: { ...COURSE, kind: 'external' } }));
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(trainingEn.player.external);
    expect(el.querySelector('[data-testid="player-outline"]')).toBeNull();
  });
});
