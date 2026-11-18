import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { TrainingApi } from './training-api';
import {
  addDaysInput,
  addMonthsInput,
  assignmentBadge,
  cellBadge,
  completionRuleOf,
  effectivenessBadge,
  exportFileName,
  fromDateInput,
  recordBadge,
  toDateInput,
  trainingErrorKey,
} from './training-display';
import { toneFor } from '../../../shared/ui/tones';
import { TrainingRecord } from './training.models';

const BASE = 'http://test/api';
const url = (path: string) => `${BASE}/v1/orgs/org-1/training/${path}`;

describe('TrainingApi', () => {
  let api: TrainingApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    api = TestBed.inject(TrainingApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists courses with repeatable status and drops empty filters', () => {
    api
      .listCourses('org-1', {
        q: 'fire',
        status: ['draft', 'published'],
        category: '',
        sort: 'code',
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('courses'));
    expect(req.request.params.getAll('status')).toEqual(['draft', 'published']);
    expect(req.request.params.get('q')).toBe('fire');
    expect(req.request.params.get('sort')).toBe('code');
    expect(req.request.params.has('category')).toBe(false);
    req.flush({ items: [], total: 0 });
  });

  it('creates a course without the generic error toast', () => {
    api.createCourse('org-1', { title: 'Fire safety' }).subscribe();
    const req = http.expectOne(url('courses'));
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({});
  });

  it('replaces lessons with the change reason', () => {
    api.replaceLessons('org-1', 'c1', [{ title: 'L', body: '', quiz: [] }], 'why').subscribe();
    const req = http.expectOne(url('courses/c1/lessons'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      lessons: [{ title: 'L', body: '', quiz: [] }],
      change_reason: 'why',
    });
    req.flush({});
  });

  it('publishes, archives and deletes', () => {
    api.publishCourse('org-1', 'c1').subscribe();
    http.expectOne(url('courses/c1/publish')).flush({});
    api.archiveCourse('org-1', 'c1', 'old').subscribe();
    const archive = http.expectOne(url('courses/c1/archive'));
    expect(archive.request.body).toEqual({ change_reason: 'old' });
    archive.flush({});
    api.deleteCourse('org-1', 'c1').subscribe();
    expect(http.expectOne(url('courses/c1')).request.method).toBe('DELETE');
  });

  it('submits an attempt to the course', () => {
    api.submitAttempt('org-1', 'c1', { answers: { l1: [0, 1] }, acknowledged: false }).subscribe();
    const req = http.expectOne(url('courses/c1/attempts'));
    expect(req.request.body.answers).toEqual({ l1: [0, 1] });
    req.flush({
      passed: true,
      score: 100,
      pass_mark: 0.8,
      results: [],
      assignment: null,
      record: null,
    });
  });

  it('lists my overdue assignments', () => {
    api
      .listAssignments('org-1', { mine: true, status: ['assigned', 'in_progress'], overdue: true })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('assignments'));
    expect(req.request.params.get('mine')).toBe('true');
    expect(req.request.params.get('overdue')).toBe('true');
    expect(req.request.params.getAll('status')).toEqual(['assigned', 'in_progress']);
    req.flush({ items: [], total: 0 });
  });

  it('does not send mine=false', () => {
    api.listRecords('org-1', { mine: false, expiring_within_days: 30 }).subscribe();
    const req = http.expectOne((r) => r.url === url('records'));
    expect(req.request.params.has('mine')).toBe(false);
    expect(req.request.params.get('expiring_within_days')).toBe('30');
    req.flush({ items: [], total: 0 });
  });

  it('assigns people, adds rules and runs the planner', () => {
    api
      .createAssignments('org-1', { course_id: 'c1', user_ids: ['u1', 'u2'], due_at: null })
      .subscribe();
    expect(http.expectOne(url('assignments')).request.body.user_ids).toEqual(['u1', 'u2']);
    api.createRule('org-1', 'c1', { target_type: 'role', target_value: 'auditor' }).subscribe();
    expect(http.expectOne(url('courses/c1/rules')).request.method).toBe('POST');
    api.updateRule('org-1', 'r1', { active: false }).subscribe();
    expect(http.expectOne(url('rules/r1')).request.method).toBe('PATCH');
    api.sync('org-1').subscribe();
    expect(http.expectOne(url('sync')).request.method).toBe('POST');
  });

  it('evaluates and gives feedback on records', () => {
    api.evaluate('org-1', 'r1', 'effective', '').subscribe();
    expect(http.expectOne(url('records/r1/evaluation')).request.body).toEqual({
      effectiveness: 'effective',
      notes: null,
    });
    api.feedback('org-1', 'r1', 4, 'good').subscribe();
    expect(http.expectOne(url('records/r1/feedback')).request.body).toEqual({
      rating: 4,
      comment: 'good',
    });
  });

  it('sends matrix course ids as csv', () => {
    api.matrix('org-1', { course_ids: ['a', 'b'], department_id: 'd1' }).subscribe();
    const req = http.expectOne((r) => r.url === url('matrix'));
    expect(req.request.params.get('course_ids')).toBe('a,b');
    expect(req.request.params.get('department_id')).toBe('d1');
    req.flush({});
  });

  it('loads needs, stats, the player and certificates', () => {
    api.needs('org-1').subscribe();
    expect(http.expectOne((r) => r.url === url('needs')).request.params.has('user_id')).toBe(false);
    api.stats('org-1').subscribe();
    http.expectOne(url('stats')).flush({});
    api.player('org-1', 'c1').subscribe();
    http.expectOne(url('courses/c1/player')).flush({});
    api.certificate('org-1', 'r1').subscribe();
    http.expectOne(url('records/r1/certificate')).flush({});
  });

  it('previews, undoes and repeats rules', () => {
    api
      .previewRule('org-1', 'c1', { target_type: 'position', target_value: 'p1', due_days: 30 })
      .subscribe();
    const preview = http.expectOne(url('courses/c1/rules/preview'));
    expect(preview.request.method).toBe('POST');
    expect(preview.request.body).toEqual({
      target_type: 'position',
      target_value: 'p1',
      due_days: 30,
    });
    expect(preview.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    preview.flush({});
    api.undoRule('org-1', 'r1').subscribe();
    expect(http.expectOne(url('rules/r1/undo')).request.method).toBe('POST');
  });

  it('searches assignments on the server and acts on many', () => {
    api
      .listAssignments('org-1', { q: ' kari ', due_before: '2026-12-01', sort: 'person' })
      .subscribe();
    const list = http.expectOne((r) => r.url === url('assignments'));
    expect(list.request.params.get('q')).toBe('kari');
    expect(list.request.params.get('due_before')).toBe('2026-12-01');
    expect(list.request.params.get('sort')).toBe('person');
    list.flush({ items: [], total: 0 });
    api
      .bulkAssignments('org-1', { ids: ['a1'], action: 'extend', due_at: '2026-12-01T23:59:59' })
      .subscribe();
    expect(http.expectOne(url('assignments/bulk')).request.body.action).toBe('extend');
    api.remindAssignment('org-1', 'a1').subscribe();
    expect(http.expectOne(url('assignments/a1/remind')).request.method).toBe('POST');
  });

  it('exports CSV with the list filters and the UI language', () => {
    api.exportCsv('org-1', 'records', { missing_evidence: true, q: 'first aid' }, 'nb').subscribe();
    const req = http.expectOne((r) => r.url === url('records/export.csv'));
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('missing_evidence')).toBe('true');
    expect(req.request.params.get('q')).toBe('first aid');
    expect(req.request.params.get('lang')).toBe('nb');
    req.flush(new Blob(['a;b']));
    api.exportCsv('org-1', 'matrix', { position_id: 'p1' }, 'en').subscribe();
    const matrix = http.expectOne((r) => r.url === url('matrix/export.csv'));
    expect(matrix.request.params.get('position_id')).toBe('p1');
    matrix.flush(new Blob(['']));
  });

  it('loads the person profile, the plan, document status and the public check', () => {
    api.person('org-1', 'u1').subscribe();
    http.expectOne(url('people/u1')).flush({});
    api.plan('org-1', { start: '2026-11', months: 12 }).subscribe();
    const plan = http.expectOne((r) => r.url === url('plan'));
    expect(plan.request.params.get('start')).toBe('2026-11');
    plan.flush({});
    api.documentAcknowledgements('org-1', 'd1').subscribe();
    http.expectOne(url('documents/d1/acknowledgements')).flush({});
    api.verifyCertificate('AB 12').subscribe();
    http.expectOne(`${BASE}/v1/training-certificates/AB%2012`).flush({});
    api.reassign('org-1', 'r1').subscribe();
    expect(http.expectOne(url('records/r1/reassign')).request.body).toEqual({ due_at: null });
    api
      .addEvaluation('org-1', 'c1', {
        evaluated_on: '2026-11-01',
        method: 'survey',
        result: 'effective',
      })
      .subscribe();
    expect(http.expectOne(url('courses/c1/evaluations')).request.method).toBe('POST');
    api.deleteEvaluation('org-1', 'e1').subscribe();
    expect(http.expectOne(url('evaluations/e1')).request.method).toBe('DELETE');
  });
});

describe('training display helpers', () => {
  const error = (status: number, code?: string) =>
    new HttpErrorResponse({ status, error: code ? { detail: { code } } : null });

  it('maps API error codes to scoped messages', () => {
    expect(trainingErrorKey(error(422, 'document_required'))).toBe(
      'training.errors.document_required',
    );
    expect(trainingErrorKey(error(409, 'unknown_code'))).toBe('training.errors.conflict');
    expect(trainingErrorKey(error(403))).toBe('training.errors.forbidden');
    expect(trainingErrorKey(error(404))).toBe('training.errors.notFound');
    expect(trainingErrorKey(error(422))).toBe('training.errors.invalid');
    expect(trainingErrorKey(error(500))).toBe('training.errors.generic');
    expect(trainingErrorKey(new Error('x'))).toBe('training.errors.generic');
  });

  it('maps statuses to the shared tone map (overdue is a to-do, not a failure)', () => {
    const tone = (b: { meaning: Parameters<typeof toneFor>[0]; value: string }) =>
      toneFor(b.meaning, b.value);
    expect(tone(assignmentBadge({ status: 'assigned', overdue: true }))).toBe('warn');
    expect(assignmentBadge({ status: 'assigned', overdue: true }).labelKey).toBe(
      'training.assignmentStatus.overdue',
    );
    expect(tone(assignmentBadge({ status: 'completed', overdue: true }))).toBe('pass');
    expect(tone(assignmentBadge({ status: 'in_progress', overdue: false }))).toBe('accent');
    expect(tone(assignmentBadge({ status: 'assigned', overdue: false }))).toBe('info');
    expect(tone(cellBadge('compliant'))).toBe('pass');
    expect(tone(cellBadge('expiring'))).toBe('warn');
    expect(tone(cellBadge('expired'))).toBe('fail');
    expect(tone(cellBadge('overdue'))).toBe('warn');
    expect(tone(cellBadge('missing'))).toBe('neutral');
    expect(tone(effectivenessBadge('effective'))).toBe('pass');
    expect(tone(effectivenessBadge('partially_effective'))).toBe('warn');
    expect(tone(effectivenessBadge('not_effective'))).toBe('fail');
    expect(effectivenessBadge(null).labelKey).toBe('training.effectiveness.pending');
  });

  it('labels a record by validity, flagging expiry within 30 days', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    const base = { passed: true, expired: false } as TrainingRecord;
    const key = (r: Partial<TrainingRecord>) =>
      recordBadge({ ...base, ...r } as TrainingRecord, now).labelKey;
    expect(key({ expires_at: '2026-11-20T00:00:00' })).toBe('training.records.expiringSoon');
    expect(key({ expires_at: '2027-06-01T00:00:00' })).toBe('training.records.valid');
    expect(key({ expires_at: null })).toBe('training.records.valid');
    expect(key({ expired: true, expires_at: null })).toBe('training.records.expired');
    expect(key({ passed: false, expires_at: null })).toBe('training.records.notPassed');
  });

  it('derives how a course is completed when the backend does not say', () => {
    expect(completionRuleOf({ kind: 'course', quiz_count: 3 })).toBe('quiz');
    expect(completionRuleOf({ kind: 'course', quiz_count: 0 })).toBe('lessons');
    expect(completionRuleOf({ kind: 'read_and_understood', quiz_count: 0 })).toBe('read_ack');
    expect(completionRuleOf({ kind: 'external', quiz_count: 0 })).toBe('external');
    expect(completionRuleOf({ kind: 'course', quiz_count: 0, completion_rule: 'quiz' })).toBe(
      'quiz',
    );
  });

  it('adds months end-of-month safe and names exports', () => {
    expect(addMonthsInput('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsInput('2026-11-17', 12)).toBe('2027-11-17');
    expect(addMonthsInput('', 12)).toBe('');
    expect(exportFileName('records', new Date(2026, 10, 17))).toBe(
      'training-records-2026-11-17.csv',
    );
  });

  it('converts between date inputs and naive UTC', () => {
    expect(toDateInput('2026-12-01T23:59:59')).toBe('2026-12-01');
    expect(toDateInput(null)).toBe('');
    expect(fromDateInput('2026-12-01', true)).toBe('2026-12-01T23:59:59');
    expect(fromDateInput('2026-12-01')).toBe('2026-12-01T00:00:00');
    expect(fromDateInput('')).toBeNull();
    expect(addDaysInput(30, new Date(2026, 0, 15))).toBe('2026-02-14');
  });
});
