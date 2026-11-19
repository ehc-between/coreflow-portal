import { describe, expect, it, vi } from 'vitest';
import {
  assignmentMissing,
  assignmentStatusSentence,
  courseMissing,
  courseStatusSentence,
} from './training-anatomy';
import { Assignment, CourseDetail } from './training.models';

function course(over: Partial<CourseDetail> = {}): CourseDetail {
  return {
    id: 'c1',
    code: 'TRN-001',
    title: 'Course',
    description: null,
    category: 'quality',
    kind: 'course',
    status: 'published',
    owner: { id: 'u1', name: 'Ola' },
    pass_mark: 0.8,
    validity_months: null,
    estimated_minutes: null,
    document_id: null,
    source: 'manual',
    version: 1,
    published_at: null,
    lesson_count: 1,
    quiz_count: 1,
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    url: '/training/courses/c1',
    can_edit: true,
    lessons: [],
    document: null,
    rule_count: 1,
    counts: { assigned: 0, overdue: 0, completed: 0 },
    ...over,
  } as CourseDetail;
}

const opts = { editLink: ['/edit'], publish: null, rules: null, oversee: true };
const keys = (items: { key: string }[]) => items.map((i) => i.key);

describe('courseStatusSentence', () => {
  it('reads published as done, draft as a to-do and archived as neutral', () => {
    expect(courseStatusSentence({ status: 'published', kind: 'course' }).tone).toBe('pass');
    expect(courseStatusSentence({ status: 'published', kind: 'external' }).key).toBe(
      'training.detail.statusLine.publishedExternal',
    );
    expect(courseStatusSentence({ status: 'draft', kind: 'course' }).tone).toBe('warn');
    expect(courseStatusSentence({ status: 'archived', kind: 'course' }).tone).toBe('neutral');
  });
});

describe('courseMissing', () => {
  it('is empty for a complete published course', () => {
    expect(courseMissing(course(), opts)).toEqual([]);
  });

  it('lists what a draft needs before it can be published', () => {
    const publish = vi.fn();
    const items = courseMissing(course({ status: 'draft', source: 'ai', owner: null }), {
      ...opts,
      publish,
    });
    expect(keys(items)).toEqual(['aiDraft', 'lessons', 'publish', 'owner']);
    items.find((i) => i.key === 'publish')?.action?.();
    expect(publish).toHaveBeenCalled();
  });

  it('asks who must take a published course without rules (managers only)', () => {
    expect(keys(courseMissing(course({ rule_count: 0 }), opts))).toEqual([]);
    expect(keys(courseMissing(course({ rule_count: 0 }), { ...opts, rules: vi.fn() }))).toEqual([
      'rules',
    ]);
  });

  it('links overdue people to the filtered assignment list', () => {
    const counts = { assigned: 3, overdue: 2, completed: 1 };
    const [item] = courseMissing(course({ counts }), opts);
    expect(item.labelKey).toBe('training.detail.missing.overdue');
    expect(item.queryParams).toEqual({ course: 'c1', overdue: 'true' });
    expect(courseMissing(course({ counts }), { ...opts, oversee: false })).toEqual([]);
  });

  it('asks for the document of a read-and-understood course', () => {
    expect(keys(courseMissing(course({ kind: 'read_and_understood' }), opts))).toEqual([
      'document',
    ]);
  });
});

function assignment(over: Partial<Assignment> = {}): Assignment {
  return {
    id: 'a1',
    course: { id: 'c1', code: 'TRN-001', title: 'C', kind: 'course', status: 'published', url: '' },
    user: { id: 'u1', name: 'Emma' },
    status: 'assigned',
    overdue: false,
    reason: 'rule',
    due_at: '2026-12-09T23:59:59',
    assigned_by: null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    attempts: 0,
    last_score: null,
    rule_id: null,
    record_id: null,
    created_at: '2026-11-12',
    url: '',
    can_manage: true,
    ...over,
  };
}

const fmt = { day: (v: string) => `day:${v.slice(0, 10)}`, date: (v: string) => `date:${v}` };

describe('assignmentStatusSentence', () => {
  it('says not started with the due date', () => {
    expect(assignmentStatusSentence(assignment(), fmt)).toEqual({
      key: 'training.assignmentDetail.statusLine.assignedDue',
      params: { date: 'day:2026-12-09' },
      tone: 'info',
    });
  });

  it('marks overdue as a to-do, completed as done and cancelled as neutral', () => {
    expect(assignmentStatusSentence(assignment({ overdue: true }), fmt).tone).toBe('warn');
    const done = assignmentStatusSentence(
      assignment({ status: 'completed', completed_at: '2026-11-20' }),
      fmt,
    );
    expect(done).toEqual({
      key: 'training.assignmentDetail.statusLine.completedOn',
      params: { date: 'date:2026-11-20' },
      tone: 'pass',
    });
    expect(assignmentStatusSentence(assignment({ status: 'cancelled' }), fmt).tone).toBe('neutral');
  });

  it('says in progress once started', () => {
    expect(
      assignmentStatusSentence(assignment({ status: 'in_progress', due_at: null }), fmt).key,
    ).toBe('training.assignmentDetail.statusLine.inProgress');
  });
});

describe('assignmentMissing', () => {
  const setDue = vi.fn();
  it('offers a reminder when overdue and a due date when there is none', () => {
    const remind = vi.fn();
    expect(keys(assignmentMissing(assignment({ overdue: true }), { remind, setDue }))).toEqual([
      'remind',
    ]);
    expect(keys(assignmentMissing(assignment({ due_at: null }), { remind, setDue }))).toEqual([
      'due',
    ]);
  });

  it('is empty for closed assignments and for people who cannot manage them', () => {
    expect(
      assignmentMissing(assignment({ status: 'completed', overdue: true }), {
        remind: vi.fn(),
        setDue,
      }),
    ).toEqual([]);
    expect(
      assignmentMissing(assignment({ can_manage: false, due_at: null }), { remind: null, setDue }),
    ).toEqual([]);
  });
});
