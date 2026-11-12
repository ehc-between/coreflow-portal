import { matchesAssignment, statusQuery } from './assignments/assignment-list';
import { targetNeedsValue } from './courses/course-rules';
import { Assignment, NeedItem, PlayerItem, TrainingRecord } from './data/training.models';
import { sortNeeds } from './home/training-home';
import { indexCells } from './matrix/training-matrix';
import {
  allAnswered,
  attemptBody,
  emptyAnswers,
  lessonState,
  questionCount,
  readingLesson,
  setAnswer,
} from './player/player-model';
import { emptyManualRecord, manualRecordPayload } from './records/record-form';
import { matchesRecord, validityQuery } from './records/record-list';
import { filterPeople } from './shared/people';

function item(id: string, questions: number, progress: PlayerItem['progress'] = null): PlayerItem {
  return {
    id,
    position: 1,
    lesson_key: `training.c1.${id}`,
    video_url: null,
    document: null,
    lesson: {
      title: `Lesson ${id}`,
      minutes: 3,
      sections: [{ heading: 'H', body: 'B' }],
      quiz: Array.from({ length: questions }, (_, i) => ({
        question: `Q${i}`,
        options: ['a', 'b'],
      })),
      pass_mark: 0.8,
    },
    progress,
  };
}

const course = {
  id: 'c1',
  code: 'TRN-001',
  title: 'Fire safety',
  kind: 'course',
  status: 'published',
  url: '',
};

describe('player model', () => {
  it('shows lessons without their quiz in the shared player', () => {
    const lesson = readingLesson(item('l1', 2).lesson);
    expect(lesson.quiz).toEqual([]);
    expect(lesson.sections).toHaveLength(1);
    expect(readingLesson({ ...item('l2', 0).lesson, sections: [] }).sections[0].heading).toBe(
      'Lesson l2',
    );
  });

  it('tracks answers per lesson and builds the attempt body', () => {
    const items = [item('l1', 2), item('l2', 0)];
    let answers = emptyAnswers(items);
    expect(answers).toEqual({ l1: [null, null] });
    expect(questionCount(items)).toBe(2);
    expect(allAnswered(items, answers)).toBe(false);
    answers = setAnswer(answers, 'l1', 0, 1);
    answers = setAnswer(answers, 'l1', 1, 0);
    expect(allAnswered(items, answers)).toBe(true);
    expect(attemptBody(answers, { acknowledged: true, rating: 4, comment: '  ' })).toEqual({
      answers: { l1: [1, 0] },
      acknowledged: true,
      feedback_rating: 4,
      feedback_comment: null,
    });
  });

  it('derives lesson state from learning progress', () => {
    const p = {
      seen_at: null,
      completed_at: null,
      quiz_score: null,
      quiz_passed: null,
      attempts: 0,
    };
    expect(lessonState(item('a', 0))).toBe('new');
    expect(lessonState(item('a', 0, { ...p, seen_at: '2026-01-01' }))).toBe('seen');
    expect(lessonState(item('a', 0, { ...p, completed_at: '2026-01-01' }))).toBe('done');
    expect(lessonState(item('a', 1, { ...p, quiz_passed: true }))).toBe('done');
  });
});

describe('list helpers', () => {
  it('orders needs: overdue and expired first, then by due date', () => {
    const need = (status: string, due: string | null, title = 'X'): NeedItem =>
      ({ course: { ...course, title }, status, required: true, due_at: due }) as NeedItem;
    const sorted = sortNeeds([
      need('compliant', null, 'A'),
      need('assigned', '2026-12-10', 'B'),
      need('overdue', '2026-11-01', 'C'),
      need('assigned', '2026-12-01', 'D'),
    ]);
    expect(sorted.map((n) => n.course.title)).toEqual(['C', 'D', 'B', 'A']);
  });

  it('maps the assignment status filter to API filters', () => {
    expect(statusQuery('')).toEqual({});
    expect(statusQuery('open')).toEqual({ status: ['assigned', 'in_progress'] });
    expect(statusQuery('overdue')).toEqual({ status: ['assigned', 'in_progress'], overdue: true });
    expect(statusQuery('completed')).toEqual({ status: ['completed'] });
  });

  it('maps the record validity filter to API filters', () => {
    expect(validityQuery('valid')).toEqual({ passed: true, expired: false });
    expect(validityQuery('expiring')).toEqual({ passed: true, expiring_within_days: 30 });
    expect(validityQuery('expired')).toEqual({ expired: true });
    expect(validityQuery('failed')).toEqual({ passed: false });
    expect(validityQuery('')).toEqual({});
  });

  it('filters the loaded page by text', () => {
    const a = { course, user: { id: 'u', name: 'Kari Nordmann' } } as Assignment;
    expect(matchesAssignment(a, 'kari')).toBe(true);
    expect(matchesAssignment(a, 'trn-001')).toBe(true);
    expect(matchesAssignment(a, 'ola')).toBe(false);
    const r = {
      course,
      user: { id: 'u', name: 'Ola' },
      certificate_no: 'TRN-001-0004',
    } as TrainingRecord;
    expect(matchesRecord(r, '0004')).toBe(true);
    expect(
      filterPeople(
        [
          { id: '1', name: 'Ann' },
          { id: '2', name: 'Bob' },
        ],
        'b',
      ),
    ).toEqual([{ id: '2', name: 'Bob' }]);
  });

  it('knows which rule targets need a value', () => {
    expect(targetNeedsValue('all')).toBe(false);
    expect(targetNeedsValue('new_hire')).toBe(false);
    expect(targetNeedsValue('role')).toBe(true);
    expect(targetNeedsValue('user')).toBe(true);
  });

  it('indexes matrix cells by person and course', () => {
    const cells = indexCells([
      {
        user_id: 'u1',
        course_id: 'c1',
        status: 'compliant',
        required: true,
        due_at: null,
        completed_at: null,
        expires_at: null,
        assignment_id: null,
        record_id: 'r1',
      },
    ]);
    expect(cells.get('u1:c1')?.record_id).toBe('r1');
    expect(cells.get('u1:c2')).toBeUndefined();
  });

  it('builds a manual record only with the required fields', () => {
    const form = emptyManualRecord();
    expect(manualRecordPayload(form)).toBeNull();
    form.courseId = 'c1';
    form.userId = 'u1';
    form.completedOn = '2026-11-01';
    form.score = 140;
    form.expiresOn = '2027-11-01';
    form.notes = ' classroom ';
    expect(manualRecordPayload(form)).toEqual({
      course_id: 'c1',
      user_id: 'u1',
      completed_at: '2026-11-01T00:00:00',
      method: 'external',
      passed: true,
      score: 100,
      expires_at: '2027-11-01T00:00:00',
      notes: 'classroom',
    });
  });
});
