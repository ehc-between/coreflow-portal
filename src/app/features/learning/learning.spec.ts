import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of } from 'rxjs';
import { AiAvailability } from '../../core/ai/ai-availability';
import { GuidanceApi } from '../../core/guidance/guidance-api';
import {
  GuidanceFile,
  LearningProgressItem,
  MemberLearningSummary,
  OrgGuidanceDto,
} from '../../core/guidance/guidance.models';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { LearningProgressService } from '../../core/guidance/learning-progress.service';
import { TutorService } from '../../core/guidance/tutor.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { LessonView } from '../../shared/guidance/lesson';
import { LearningCentre } from './learning-centre';
import { buildCatalog, lessonStatus, matchesQuery } from './lesson-catalog';
import { GuidanceSettings, sortSummary } from './settings/guidance-settings';

const PLATFORM: GuidanceFile = {
  lessons: {
    alpha: { title: 'Alpha lesson', minutes: 3, sections: [{ heading: 'H', body: 'B' }] },
    beta: {
      title: 'Beta lesson',
      sections: [{ heading: 'H', body: 'B' }],
      quiz: [{ question: 'Q', options: ['a', 'b'], answer: 0 }],
    },
  },
};
const GLOSSARY: GuidanceFile = {
  glossary: {
    risk: { term: 'Risk', definition: 'Effect of uncertainty', clauses: ['hs:6.1'] },
    audit: { term: 'Audit', definition: 'An independent check' },
  },
};

function progressItem(over: Partial<LearningProgressItem>): LearningProgressItem {
  return {
    id: 'p',
    module: 'platform',
    lesson_key: 'platform.alpha',
    seen_at: '2026-11-01T10:00:00',
    completed_at: null,
    quiz_score: null,
    quiz_passed: null,
    attempts: 0,
    ...over,
  };
}

function baseProviders(permissions: string[] = []) {
  const fake = provideFakeGuidance({ platform: PLATFORM, glossary: GLOSSARY }, 'standard');
  return [
    provideZonelessChangeDetection(),
    provideRouter([]),
    ...fake.providers,
    { provide: TutorService, useValue: { teach: vi.fn(), explainClause: vi.fn() } },
    { provide: AiAvailability, useValue: { unavailable: signal(false) } },
    { provide: LanguageService, useValue: { translate: (key: string) => key, locale: () => 'en' } },
    {
      provide: SelectedOrgService,
      useValue: {
        currentOrgId: signal('org-1'),
        currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions }),
      },
    },
    { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
  ];
}

const transloco = TranslocoTestingModule.forRoot({ langs: { en: {}, 'guidance/en': {} } });

describe('lesson catalog', () => {
  it('derives a status from progress', () => {
    expect(lessonStatus(null)).toBe('not_started');
    expect(lessonStatus(progressItem({}))).toBe('in_progress');
    expect(lessonStatus(progressItem({ seen_at: null, attempts: 1 }))).toBe('in_progress');
    expect(lessonStatus(progressItem({ completed_at: '2026-11-02T10:00:00' }))).toBe('completed');
  });

  it('joins lessons with progress', () => {
    const catalog = buildCatalog(
      [{ scope: 'platform', file: PLATFORM }],
      new Map([['platform.beta', progressItem({ lesson_key: 'platform.beta' })]]),
    );
    expect(catalog.map((l) => [l.lessonKey, l.status, l.hasQuiz])).toEqual([
      ['platform.alpha', 'not_started', false],
      ['platform.beta', 'in_progress', true],
    ]);
  });

  it('matches queries case- and accent-insensitively', () => {
    expect(matchesQuery('Rotårsak', 'ROTÅR')).toBe(true);
    expect(matchesQuery('Café', 'cafe')).toBe(true);
    expect(matchesQuery('Risk', '  ')).toBe(true);
    expect(matchesQuery('Risk', 'audit')).toBe(false);
  });

  it('sorts the member summary', () => {
    const rows: MemberLearningSummary[] = [
      {
        user_id: '1',
        name: 'Bea',
        lessons_seen: 2,
        lessons_completed: 1,
        quizzes_passed: 0,
        last_activity_at: '2026-11-01T10:00:00',
      },
      {
        user_id: '2',
        name: 'Ada',
        lessons_seen: 3,
        lessons_completed: 3,
        quizzes_passed: 2,
        last_activity_at: null,
      },
      {
        user_id: '3',
        name: null,
        lessons_seen: 0,
        lessons_completed: 0,
        quizzes_passed: 0,
        last_activity_at: '2026-11-05T10:00:00',
      },
    ];
    expect(sortSummary(rows, 'name').map((r) => r.user_id)).toEqual(['3', '2', '1']);
    expect(sortSummary(rows, 'completed').map((r) => r.user_id)).toEqual(['2', '1', '3']);
    expect(sortSummary(rows, 'activity').map((r) => r.user_id)).toEqual(['3', '1', '2']);
  });
});

describe('LearningCentre', () => {
  function setup() {
    const progress = {
      ensureLoaded: vi.fn(),
      byKey: signal(
        new Map([
          [
            'platform.beta',
            progressItem({
              lesson_key: 'platform.beta',
              completed_at: '2026-11-02T10:00:00',
              quiz_passed: true,
              quiz_score: 100,
              attempts: 1,
            }),
          ],
        ]),
      ),
      quizzesPassed: signal(1),
    };
    TestBed.configureTestingModule({
      imports: [LearningCentre, transloco],
      providers: [...baseProviders(), { provide: LearningProgressService, useValue: progress }],
    });
    const fixture = TestBed.createComponent(LearningCentre);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, progress, render: () => fixture.detectChanges() };
  }

  it('lists lessons with their status and filters them', () => {
    const { el, render, progress } = setup();
    expect(progress.ensureLoaded).toHaveBeenCalled();
    const rows = () =>
      Array.from(el.querySelectorAll<HTMLAnchorElement>('[data-testid="lesson-row"]'));
    // Default sort: by status (in progress, not started, completed).
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Alpha lesson'),
      expect.stringContaining('Beta lesson'),
    ]);
    expect(rows()[1].getAttribute('href')).toBe('/account/learning/platform/beta');

    const status = el.querySelector<HTMLSelectElement>('[data-testid="lesson-status-filter"]')!;
    status.value = 'completed';
    status.dispatchEvent(new Event('change'));
    render();
    expect(rows()).toHaveLength(1);

    const search = el.querySelector<HTMLInputElement>('[data-testid="lesson-search"]')!;
    search.value = 'alpha';
    search.dispatchEvent(new Event('input'));
    render();
    expect(el.querySelector('[data-testid="lessons-empty"]')).not.toBeNull();
  });

  it('searches the glossary', () => {
    const { el, render } = setup();
    const entries = () => el.querySelectorAll('[data-testid="glossary-entry"]');
    expect(entries()).toHaveLength(2);
    const search = el.querySelector<HTMLInputElement>('[data-testid="glossary-search"]')!;
    search.value = 'uncertainty';
    search.dispatchEvent(new Event('input'));
    render();
    expect(entries()).toHaveLength(1);
    expect(entries()[0].textContent).toContain('Risk');
  });
});

describe('LessonView', () => {
  function setup() {
    const record$ = new Subject<LearningProgressItem>();
    const progress = {
      ensureLoaded: vi.fn(),
      byKey: signal(new Map<string, LearningProgressItem>()),
      record: vi.fn((_m: string, _k: string, event: string) =>
        event === 'seen' ? of(null) : record$,
      ),
    };
    TestBed.configureTestingModule({
      imports: [LessonView, transloco],
      providers: [...baseProviders(), { provide: LearningProgressService, useValue: progress }],
    });
    const fixture = TestBed.createComponent(LessonView);
    fixture.componentRef.setInput('scope', 'platform');
    fixture.componentRef.setInput('lesson', 'alpha');
    fixture.detectChanges();
    return { fixture, progress, record$, el: fixture.nativeElement as HTMLElement };
  }

  it('records "seen" once and "completed" at the end', () => {
    const { fixture, progress, record$, el } = setup();
    expect(progress.record).toHaveBeenCalledWith('platform', 'platform.alpha', 'seen');
    fixture.detectChanges();
    expect(progress.record).toHaveBeenCalledTimes(1);

    const finished: unknown[] = [];
    fixture.componentInstance.finished.subscribe((r) => finished.push(r));
    el.querySelector<HTMLButtonElement>('[data-testid="lesson-finish"] button')!.click();
    expect(progress.record).toHaveBeenLastCalledWith('platform', 'platform.alpha', 'completed');
    record$.next(progressItem({ completed_at: '2026-11-02T10:00:00' }));
    expect(finished).toEqual([{ score: null, passed: null }]);
  });

  it('says when the lesson does not exist', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('lesson', 'missing');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="lesson-missing"]')).not.toBeNull();
  });
});

describe('GuidanceSettings', () => {
  function setup(permissions: string[]) {
    const update$ = new Subject<OrgGuidanceDto>();
    const api = {
      getOrgGuidance: vi.fn(() => of({ default_level: 'standard' })),
      updateOrgGuidance: vi.fn(() => update$),
      summary: vi.fn(() =>
        of({
          items: [
            {
              user_id: 'u-1',
              name: 'Ada',
              lessons_seen: 2,
              lessons_completed: 1,
              quizzes_passed: 1,
              last_activity_at: null,
            },
            {
              user_id: 'u-2',
              name: 'Bob',
              lessons_seen: 0,
              lessons_completed: 0,
              quizzes_passed: 0,
              last_activity_at: null,
            },
          ],
        }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [GuidanceSettings, transloco],
      providers: [...baseProviders(permissions), { provide: GuidanceApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(GuidanceSettings);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, api, update$, render: () => fixture.detectChanges() };
  }

  it('lets an admin change the default level and see members', () => {
    const { el, api, update$, render } = setup(['org:manage', 'learning:read']);
    expect(api.getOrgGuidance).toHaveBeenCalledWith('org-1');
    expect(api.summary).toHaveBeenCalledWith('org-1', null);
    expect(el.querySelectorAll('[data-testid="member-row"]')).toHaveLength(2);

    const save = () => el.querySelector<HTMLButtonElement>('[data-testid="save-default"] button')!;
    expect(save().disabled).toBe(true);
    const beginner = el.querySelector<HTMLInputElement>('[data-testid="level-option-beginner"]')!;
    beginner.checked = true;
    beginner.dispatchEvent(new Event('change'));
    render();
    expect(save().disabled).toBe(false);
    save().click();
    expect(api.updateOrgGuidance).toHaveBeenCalledWith('org-1', 'beginner');
    update$.next({ default_level: 'beginner' });
    render();
    expect(save().disabled).toBe(true);

    const search = el.querySelector<HTMLInputElement>('[data-testid="member-search"]')!;
    search.value = 'bo';
    search.dispatchEvent(new Event('input'));
    render();
    expect(el.querySelectorAll('[data-testid="member-row"]')).toHaveLength(1);
  });

  it('hides member progress without learning:read and blocks others', () => {
    const manager = setup(['org:manage']);
    expect(manager.el.querySelector('[data-testid="member-learning"]')).toBeNull();
    expect(manager.api.summary).not.toHaveBeenCalled();
    TestBed.resetTestingModule();

    const nobody = setup([]);
    expect(nobody.el.querySelector('[data-testid="guidance-no-access"]')).not.toBeNull();
  });
});
