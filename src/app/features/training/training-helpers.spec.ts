import { chipCount, matchesAssignment, statusQuery } from './assignments/assignment-list';
import { clauseSuggestions } from './courses/course-editor';
import { ruleBody, targetNeedsValue } from './courses/course-rules';
import { clauseLabel } from './data/clause-label';
import { Assignment, NeedItem, PlanItem, PlayerItem, TrainingRecord } from './data/training.models';
import { needAction, sortNeeds } from './home/training-home';
import { planLink, shiftMonth } from './plan/training-plan';
import { groupAssignments } from './shared/assignment-table';
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
import { defaultExpiry, emptyManualRecord, manualRecordPayload } from './records/record-form';
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
    expect(targetNeedsValue('position')).toBe(true);
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
      provider_supplier_id: null,
      provider_name: null,
      instructor: null,
      hours: null,
      location: null,
    });
    form.providerName = ' Røde Kors ';
    form.hours = 7.5;
    expect(manualRecordPayload(form)).toMatchObject({ provider_name: 'Røde Kors', hours: 7.5 });
    form.providerSupplierId = 's1';
    expect(manualRecordPayload(form)).toMatchObject({
      provider_supplier_id: 's1',
      provider_name: null,
    });
  });

  it('defaults the expiry to completion + the course validity', () => {
    expect(defaultExpiry('2026-11-17', 24)).toBe('2028-11-17');
    expect(defaultExpiry('2026-11-17', null)).toBe('');
  });

  it('builds rule bodies only when complete, with an optional repeat', () => {
    expect(ruleBody('', '', 30, null)).toBeNull();
    expect(ruleBody('position', '', 30, null)).toBeNull();
    expect(ruleBody('all', '', 400, null)).toBeNull();
    expect(ruleBody('all', 'ignored', 30, '')).toEqual({
      target_type: 'all',
      target_value: null,
      due_days: 30,
      recurrence_months: null,
    });
    expect(ruleBody('position', 'p1', '14', '12')).toEqual({
      target_type: 'position',
      target_value: 'p1',
      due_days: 14,
      recurrence_months: 12,
    });
    expect(ruleBody('all', '', 30, 0)).toBeNull();
  });

  it('groups assignments by course or person and counts the status chips', () => {
    const a = (id: string, courseId: string, user: string) =>
      ({
        id,
        course: { ...course, id: courseId, code: courseId.toUpperCase(), title: courseId },
        user: { id: user, name: user },
      }) as Assignment;
    const items = [a('1', 'c1', 'kari'), a('2', 'c2', 'kari'), a('3', 'c1', 'ola')];
    expect(groupAssignments(items, '')).toHaveLength(1);
    expect(groupAssignments(items, 'course').map((g) => g.items.length)).toEqual([2, 1]);
    expect(groupAssignments(items, 'person').map((g) => g.label)).toEqual(['kari', 'ola']);
    const counts = { assigned: 3, in_progress: 2, overdue: 1, completed: 4, cancelled: 1 };
    expect(chipCount(counts, 'open')).toBe(5);
    expect(chipCount(counts, 'overdue')).toBe(1);
    expect(chipCount(counts, '')).toBe(10);
    expect(chipCount(undefined, 'open')).toBeNull();
  });

  it('suggests clauses for the category that are not picked yet', () => {
    expect(clauseSuggestions('privacy', undefined, ['gdpr:39'])).toEqual([
      'hs:7.3',
      'iso27001:A.6.3',
    ]);
    expect(clauseSuggestions('privacy', ['gdpr:5'], [])).toEqual(['gdpr:5']);
  });

  it('labels clauses without "ISO HS" and links plan items', () => {
    const t = (key: string) => (key === 'training.frameworks.hs' ? 'Felles ISO-krav' : key);
    expect(clauseLabel('hs:7.2', t)).toBe('Felles ISO-krav · 7.2');
    expect(clauseLabel('iso27001-2022:A.6.3', t)).toBe('ISO 27001 · A.6.3');
    const item = { course: { id: 'c1' }, assignment_id: null, record_id: 'r1' } as PlanItem;
    expect(planLink(item)).toEqual(['/training/records', 'r1']);
    expect(shiftMonth('2026-11', 2)).toBe('2027-01');
    expect(needAction({ status: 'missing', course: { kind: 'course' } } as NeedItem)).toBe('start');
    expect(needAction({ status: 'assigned', course: { kind: 'external' } } as NeedItem)).toBeNull();
  });
});
