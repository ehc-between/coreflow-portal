import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { TrainingApi } from './training-api';
import {
  addDaysInput,
  assignmentTone,
  cellTone,
  fromDateInput,
  recordValidityTone,
  toDateInput,
  trainingErrorKey,
} from './training-display';
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

  it('picks badge tones', () => {
    expect(assignmentTone('assigned', true)).toBe('fail');
    expect(assignmentTone('completed', true)).toBe('pass');
    expect(assignmentTone('in_progress')).toBe('accent');
    expect(cellTone('expiring')).toBe('warn');
    expect(cellTone('missing')).toBe('neutral');
  });

  it('flags records that expire within 30 days', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    const base = { passed: true, expired: false } as TrainingRecord;
    expect(recordValidityTone({ ...base, expires_at: '2026-11-20T00:00:00' }, now)).toBe('warn');
    expect(recordValidityTone({ ...base, expires_at: '2027-06-01T00:00:00' }, now)).toBe('pass');
    expect(recordValidityTone({ ...base, expires_at: null }, now)).toBe('pass');
    expect(recordValidityTone({ ...base, expired: true, expires_at: null }, now)).toBe('fail');
    expect(recordValidityTone({ ...base, passed: false, expires_at: null }, now)).toBe('fail');
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
