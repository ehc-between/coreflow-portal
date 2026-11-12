import {
  appendQuiz,
  applyGeneratedCourse,
  courseFormFrom,
  createPayload,
  emptyCourseForm,
  emptyLesson,
  emptyQuestion,
  isGeneratedCourse,
  lessonsPayload,
  moveItem,
  removeOption,
  updatePayload,
  validateCourseForm,
} from './course-form';
import { CourseDetail } from './training.models';

function detail(over: Partial<CourseDetail> = {}): CourseDetail {
  return {
    id: 'c1',
    code: 'TRN-001',
    title: 'Fire safety',
    description: null,
    category: 'hse',
    kind: 'course',
    status: 'published',
    owner: { id: 'u1', name: 'Ann' },
    pass_mark: 0.75,
    validity_months: 12,
    estimated_minutes: 20,
    document_id: null,
    source: 'manual',
    version: 2,
    published_at: '2026-10-01T00:00:00',
    lesson_count: 2,
    quiz_count: 1,
    created_by: 'u1',
    created_at: '2026-09-01T00:00:00',
    updated_at: '2026-10-01T00:00:00',
    url: '/training/courses/c1',
    can_edit: true,
    lessons: [
      {
        id: 'l2',
        position: 2,
        title: 'Second',
        body: 'B',
        video_url: null,
        document_id: null,
        minutes: null,
        quiz: [],
      },
      {
        id: 'l1',
        position: 1,
        title: 'First',
        body: 'A',
        video_url: 'https://video',
        document_id: 'd1',
        minutes: 5,
        quiz: [{ question: 'Q?', options: ['a', 'b'], answer: 1, explanation: null }],
      },
    ],
    document: null,
    rule_count: 0,
    counts: { assigned: 0, overdue: 0, completed: 0 },
    ...over,
  };
}

describe('course form model', () => {
  it('loads a course in lesson order with the pass mark as a percentage', () => {
    const form = courseFormFrom(detail());
    expect(form.passMarkPct).toBe(75);
    expect(form.ownerUserId).toBe('u1');
    expect(form.lessons.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(form.lessons[0].quiz[0].explanation).toBe('');
  });

  it('round-trips lessons, keeping ids and nulling blanks', () => {
    const lessons = lessonsPayload(courseFormFrom(detail()));
    expect(lessons[0]).toEqual({
      id: 'l1',
      title: 'First',
      body: 'A',
      video_url: 'https://video',
      document_id: 'd1',
      minutes: 5,
      quiz: [{ question: 'Q?', options: ['a', 'b'], answer: 1, explanation: null }],
    });
    expect(lessons[1].video_url).toBeNull();
    expect(lessons[1].document_id).toBeNull();
  });

  it('builds create and update bodies', () => {
    const form = emptyCourseForm();
    form.title = '  Security awareness ';
    form.passMarkPct = 90;
    form.lessons[0].title = 'Intro';
    const create = createPayload(form);
    expect(create.title).toBe('Security awareness');
    expect(create.pass_mark).toBeCloseTo(0.9);
    expect(create.source).toBe('manual');
    expect(create.lessons?.[0]).not.toHaveProperty('id');
    expect(create.owner_user_id).toBeNull();

    const update = updatePayload(form, ' new revision ');
    expect(update.change_reason).toBe('new revision');
    expect(update).not.toHaveProperty('lessons');
  });

  it('validates the rules the API enforces', () => {
    const form = emptyCourseForm();
    form.kind = 'read_and_understood';
    form.passMarkPct = 120;
    form.validityMonths = 0;
    form.lessons[0].videoUrl = 'ftp://x';
    form.lessons[0].quiz = [{ question: '', options: ['a', ''], answer: 3, explanation: '' }];
    const keys = validateCourseForm(form).map((i) => i.key);
    expect(keys).toEqual([
      'training.form.issues.title',
      'training.form.issues.document',
      'training.form.issues.passMark',
      'training.form.issues.validity',
      'training.form.issues.lessonTitle',
      'training.form.issues.videoUrl',
      'training.form.issues.question',
      'training.form.issues.options',
      'training.form.issues.answer',
    ]);

    const ok = courseFormFrom(detail());
    expect(validateCourseForm(ok)).toEqual([]);
  });

  it('moves lessons and removes options without losing the correct answer', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 1, 5)).toEqual(['a', 'b']);
    const q = { ...emptyQuestion(), options: ['a', 'b', 'c'], answer: 2 };
    removeOption(q, 0);
    expect(q.options).toEqual(['b', 'c']);
    expect(q.answer).toBe(1);
    removeOption(q, 1);
    expect(q.options).toEqual(['b', 'c']); // never below two options
  });

  it('applies an AI course draft and appends AI quiz questions', () => {
    const form = emptyCourseForm();
    const draft = {
      title: 'Incident reporting',
      description: 'How to report',
      category: 'information_security',
      estimated_minutes: 15,
      lessons: [{ title: 'Why', body: '## Why\ntext', minutes: 5, quiz: [] }],
    };
    expect(isGeneratedCourse(draft)).toBe(true);
    expect(isGeneratedCourse({ text: 'x' })).toBe(false);
    applyGeneratedCourse(form, draft);
    expect(form.source).toBe('ai');
    expect(form.category).toBe('information_security');
    expect(form.lessons).toHaveLength(1);

    applyGeneratedCourse(form, { ...draft, category: 'bogus' });
    expect(form.category).toBe('information_security');

    const lesson = emptyLesson();
    appendQuiz(lesson, [{ question: 'Q', options: ['x', 'y'], answer: 0 }]);
    expect(lesson.quiz[0]).toEqual({
      question: 'Q',
      options: ['x', 'y'],
      answer: 0,
      explanation: '',
    });
  });
});
