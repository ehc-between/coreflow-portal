import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  Assignment,
  AssignmentList,
  BulkAssignmentsIn,
  BulkAssignmentsOut,
  CertificateCheck,
  CourseEvaluation,
  CourseEvaluationIn,
  DocumentAcknowledgements,
  NamedOption,
  PersonTraining,
  PlanQuery,
  RulePreview,
  RuleUndo,
  TrainingPlan,
  AssignmentQuery,
  AssignmentsCreate,
  AssignmentsCreated,
  AttemptIn,
  AttemptOut,
  Certificate,
  CourseCreate,
  CourseDetail,
  CourseList,
  CourseQuery,
  CourseUpdate,
  LessonIn,
  Matrix,
  MatrixQuery,
  Needs,
  PlayerOut,
  RecordCreate,
  RecordList,
  RecordQuery,
  Rule,
  RuleCreate,
  RuleCreated,
  RuleUpdate,
  TrainingRecord,
  TrainingStats,
  Effectiveness,
} from './training.models';

/** A People position as listed by `GET people/positions` (only what pickers need). */
export interface PeopleOption {
  readonly id: string;
  readonly title: string;
  readonly code?: string | null;
}

/** A supplier as listed by `GET suppliers` (only what pickers need). */
export interface SupplierOption {
  readonly id: string;
  readonly name: string;
  readonly code?: string | null;
}

/** Mutations report their own errors in place (codes mapped by `trainingErrorKey`). */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** Which list a CSV export follows. */
export type TrainingExport = 'records' | 'assignments' | 'matrix';

/** Query values as the API params (empty values dropped). */
type Params = Record<string, string | number | boolean | readonly string[] | null | undefined>;

function assignmentParams(query: AssignmentQuery): Params {
  return {
    course_id: query.course_id || null,
    user_id: query.user_id || null,
    mine: query.mine ? true : null,
    status: query.status?.length ? query.status : null,
    overdue: query.overdue ?? null,
    q: query.q?.trim() || null,
    due_before: query.due_before || null,
    reason: query.reason || null,
    sort: query.sort ?? null,
  };
}

function recordParams(query: RecordQuery): Params {
  return {
    course_id: query.course_id || null,
    user_id: query.user_id || null,
    mine: query.mine ? true : null,
    passed: query.passed ?? null,
    expiring_within_days: query.expiring_within_days ?? null,
    expired: query.expired ?? null,
    expires_before: query.expires_before || null,
    method: query.method || null,
    missing_evidence: query.missing_evidence ?? null,
    q: query.q?.trim() || null,
    sort: query.sort ?? null,
  };
}

function matrixParams(query: MatrixQuery): Params {
  return {
    course_ids: query.course_ids?.length ? query.course_ids.join(',') : null,
    category: query.category || null,
    department_id: query.department_id || null,
    position_id: query.position_id || null,
  };
}

/**
 * Training (M11) API client: `v1/orgs/{org}/training/...` through `ApiService`
 * (base URL, bearer + refresh, error handling). Mutations skip the generic error
 * toast so pages can show the specific `{"detail": {"code"}}` message.
 */
@Injectable({ providedIn: 'root' })
export class TrainingApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/training`;
  }

  // --- courses ---------------------------------------------------------------------

  listCourses(orgId: string, query: CourseQuery = {}): Observable<CourseList> {
    return this.api.get<CourseList>(`${this.base(orgId)}/courses`, {
      params: {
        q: query.q || null,
        status: query.status?.length ? query.status : null,
        category: query.category || null,
        kind: query.kind || null,
        owner: query.owner || null,
        sort: query.sort ?? null,
        limit: query.limit ?? null,
        offset: query.offset ?? null,
      },
    });
  }

  getCourse(orgId: string, id: string): Observable<CourseDetail> {
    return this.api.get<CourseDetail>(`${this.base(orgId)}/courses/${id}`);
  }

  createCourse(orgId: string, body: CourseCreate): Observable<CourseDetail> {
    return this.api.post<CourseDetail>(`${this.base(orgId)}/courses`, body, IN_PLACE);
  }

  updateCourse(orgId: string, id: string, body: CourseUpdate): Observable<CourseDetail> {
    return this.api.patch<CourseDetail>(`${this.base(orgId)}/courses/${id}`, body, IN_PLACE);
  }

  replaceLessons(
    orgId: string,
    id: string,
    lessons: readonly LessonIn[],
    changeReason?: string | null,
  ): Observable<CourseDetail> {
    return this.api.put<CourseDetail>(
      `${this.base(orgId)}/courses/${id}/lessons`,
      { lessons, change_reason: changeReason || null },
      IN_PLACE,
    );
  }

  publishCourse(orgId: string, id: string, changeReason?: string | null): Observable<CourseDetail> {
    return this.api.post<CourseDetail>(
      `${this.base(orgId)}/courses/${id}/publish`,
      { change_reason: changeReason || null },
      IN_PLACE,
    );
  }

  archiveCourse(orgId: string, id: string, changeReason?: string | null): Observable<CourseDetail> {
    return this.api.post<CourseDetail>(
      `${this.base(orgId)}/courses/${id}/archive`,
      { change_reason: changeReason || null },
      IN_PLACE,
    );
  }

  deleteCourse(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/courses/${id}`, IN_PLACE);
  }

  /** A course-level effectiveness evaluation (`training:manage`). */
  addEvaluation(
    orgId: string,
    courseId: string,
    body: CourseEvaluationIn,
  ): Observable<CourseEvaluation> {
    return this.api.post<CourseEvaluation>(
      `${this.base(orgId)}/courses/${courseId}/evaluations`,
      body,
      IN_PLACE,
    );
  }

  deleteEvaluation(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/evaluations/${id}`, IN_PLACE);
  }

  // --- learning --------------------------------------------------------------------

  player(orgId: string, courseId: string): Observable<PlayerOut> {
    return this.api.get<PlayerOut>(`${this.base(orgId)}/courses/${courseId}/player`);
  }

  start(orgId: string, courseId: string): Observable<PlayerOut> {
    return this.api.post<PlayerOut>(`${this.base(orgId)}/courses/${courseId}/start`, {}, IN_PLACE);
  }

  submitAttempt(orgId: string, courseId: string, body: AttemptIn): Observable<AttemptOut> {
    return this.api.post<AttemptOut>(
      `${this.base(orgId)}/courses/${courseId}/attempts`,
      body,
      IN_PLACE,
    );
  }

  // --- rules -----------------------------------------------------------------------

  listRules(orgId: string, courseId: string): Observable<{ readonly items: readonly Rule[] }> {
    return this.api.get<{ readonly items: readonly Rule[] }>(
      `${this.base(orgId)}/courses/${courseId}/rules`,
    );
  }

  /** What a rule would do (who it assigns), without saving anything. */
  previewRule(orgId: string, courseId: string, body: RuleCreate): Observable<RulePreview> {
    return this.api.post<RulePreview>(
      `${this.base(orgId)}/courses/${courseId}/rules/preview`,
      body,
      IN_PLACE,
    );
  }

  /** Delete a rule and withdraw the assignments it created that nobody has started. */
  undoRule(orgId: string, ruleId: string): Observable<RuleUndo> {
    return this.api.post<RuleUndo>(`${this.base(orgId)}/rules/${ruleId}/undo`, {}, IN_PLACE);
  }

  createRule(orgId: string, courseId: string, body: RuleCreate): Observable<RuleCreated> {
    return this.api.post<RuleCreated>(
      `${this.base(orgId)}/courses/${courseId}/rules`,
      body,
      IN_PLACE,
    );
  }

  updateRule(orgId: string, ruleId: string, body: RuleUpdate): Observable<Rule> {
    return this.api.patch<Rule>(`${this.base(orgId)}/rules/${ruleId}`, body, IN_PLACE);
  }

  deleteRule(orgId: string, ruleId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/rules/${ruleId}`, IN_PLACE);
  }

  sync(orgId: string): Observable<{ readonly created: number }> {
    return this.api.post<{ readonly created: number }>(`${this.base(orgId)}/sync`, {}, IN_PLACE);
  }

  // --- assignments -----------------------------------------------------------------

  listAssignments(orgId: string, query: AssignmentQuery = {}): Observable<AssignmentList> {
    return this.api.get<AssignmentList>(`${this.base(orgId)}/assignments`, {
      params: {
        ...assignmentParams(query),
        limit: query.limit ?? null,
        offset: query.offset ?? null,
      },
    });
  }

  getAssignment(orgId: string, id: string): Observable<Assignment> {
    return this.api.get<Assignment>(`${this.base(orgId)}/assignments/${id}`);
  }

  createAssignments(orgId: string, body: AssignmentsCreate): Observable<AssignmentsCreated> {
    return this.api.post<AssignmentsCreated>(`${this.base(orgId)}/assignments`, body, IN_PLACE);
  }

  updateAssignment(orgId: string, id: string, dueAt: string | null): Observable<Assignment> {
    return this.api.patch<Assignment>(
      `${this.base(orgId)}/assignments/${id}`,
      { due_at: dueAt },
      IN_PLACE,
    );
  }

  cancelAssignment(orgId: string, id: string): Observable<Assignment> {
    return this.api.post<Assignment>(`${this.base(orgId)}/assignments/${id}/cancel`, {}, IN_PLACE);
  }

  /** Send the learner a reminder (409 `recently_reminded` within 20 hours). */
  remindAssignment(orgId: string, id: string): Observable<Assignment> {
    return this.api.post<Assignment>(`${this.base(orgId)}/assignments/${id}/remind`, {}, IN_PLACE);
  }

  /** Extend, cancel or remind many assignments at once. */
  bulkAssignments(orgId: string, body: BulkAssignmentsIn): Observable<BulkAssignmentsOut> {
    return this.api.post<BulkAssignmentsOut>(
      `${this.base(orgId)}/assignments/bulk`,
      body,
      IN_PLACE,
    );
  }

  // --- records ---------------------------------------------------------------------

  listRecords(orgId: string, query: RecordQuery = {}): Observable<RecordList> {
    return this.api.get<RecordList>(`${this.base(orgId)}/records`, {
      params: {
        ...recordParams(query),
        limit: query.limit ?? null,
        offset: query.offset ?? null,
      },
    });
  }

  getRecord(orgId: string, id: string): Observable<TrainingRecord> {
    return this.api.get<TrainingRecord>(`${this.base(orgId)}/records/${id}`);
  }

  createRecord(orgId: string, body: RecordCreate): Observable<TrainingRecord> {
    return this.api.post<TrainingRecord>(`${this.base(orgId)}/records`, body, IN_PLACE);
  }

  certificate(orgId: string, id: string): Observable<Certificate> {
    return this.api.get<Certificate>(`${this.base(orgId)}/records/${id}/certificate`, IN_PLACE);
  }

  evaluate(
    orgId: string,
    id: string,
    effectiveness: Effectiveness,
    notes?: string | null,
  ): Observable<TrainingRecord> {
    return this.api.post<TrainingRecord>(
      `${this.base(orgId)}/records/${id}/evaluation`,
      { effectiveness, notes: notes || null },
      IN_PLACE,
    );
  }

  feedback(
    orgId: string,
    id: string,
    rating: number,
    comment?: string | null,
  ): Observable<TrainingRecord> {
    return this.api.post<TrainingRecord>(
      `${this.base(orgId)}/records/${id}/feedback`,
      { rating, comment: comment || null },
      IN_PLACE,
    );
  }

  deleteRecord(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/records/${id}`, IN_PLACE);
  }

  /** Assign the record's course to the same person again (reason "retraining"). */
  reassign(orgId: string, recordId: string, dueAt?: string | null): Observable<Assignment> {
    return this.api.post<Assignment>(
      `${this.base(orgId)}/records/${recordId}/reassign`,
      { due_at: dueAt ?? null },
      IN_PLACE,
    );
  }

  /** CSV of a list with the same filters as on screen (headers in `lang`). */
  exportCsv(
    orgId: string,
    kind: TrainingExport,
    query: AssignmentQuery | RecordQuery | MatrixQuery,
    lang: string,
  ): Observable<Blob> {
    const params =
      kind === 'assignments'
        ? assignmentParams(query as AssignmentQuery)
        : kind === 'records'
          ? recordParams(query as RecordQuery)
          : matrixParams(query as MatrixQuery);
    return this.api.getBlob(`${this.base(orgId)}/${kind}/export.csv`, {
      ...IN_PLACE,
      params: { ...params, lang },
    });
  }

  // --- overviews -------------------------------------------------------------------

  matrix(orgId: string, query: MatrixQuery = {}): Observable<Matrix> {
    return this.api.get<Matrix>(`${this.base(orgId)}/matrix`, { params: matrixParams(query) });
  }

  needs(orgId: string, userId?: string | null): Observable<Needs> {
    return this.api.get<Needs>(`${this.base(orgId)}/needs`, {
      params: { user_id: userId || null },
    });
  }

  stats(orgId: string): Observable<TrainingStats> {
    return this.api.get<TrainingStats>(`${this.base(orgId)}/stats`);
  }

  /** One person's training (the caller, or anyone for people who oversee training). */
  person(orgId: string, userId: string): Observable<PersonTraining> {
    return this.api.get<PersonTraining>(`${this.base(orgId)}/people/${userId}`, IN_PLACE);
  }

  /** Due dates and expiries by month (only your own unless you oversee training). */
  plan(orgId: string, query: PlanQuery = {}): Observable<TrainingPlan> {
    return this.api.get<TrainingPlan>(`${this.base(orgId)}/plan`, {
      params: {
        start: query.start || null,
        months: query.months ?? null,
        course_id: query.course_id || null,
        department_id: query.department_id || null,
        user_id: query.user_id || null,
      },
    });
  }

  /** Read-and-understood status of a document's current approved revision. */
  documentAcknowledgements(
    orgId: string,
    documentId: string,
  ): Observable<DocumentAcknowledgements> {
    return this.api.get<DocumentAcknowledgements>(
      `${this.base(orgId)}/documents/${documentId}/acknowledgements`,
      IN_PLACE,
    );
  }

  /** Public certificate check (no login), from the code printed on a certificate. */
  verifyCertificate(code: string): Observable<CertificateCheck> {
    return this.api.get<CertificateCheck>(
      `v1/training-certificates/${encodeURIComponent(code)}`,
      IN_PLACE,
    );
  }

  // --- options from other modules (pickers) ---------------------------------------------

  /** People job positions (rule target "position"); empty without People access. */
  positions(orgId: string): Observable<{ readonly items: readonly PeopleOption[] }> {
    return this.api.get<{ readonly items: readonly PeopleOption[] }>(
      `v1/orgs/${orgId}/people/positions`,
      { ...IN_PLACE, params: { limit: 200 } },
    );
  }

  /** People competences (what a course gives). */
  competences(orgId: string): Observable<{ readonly items: readonly NamedOption[] }> {
    return this.api.get<{ readonly items: readonly NamedOption[] }>(
      `v1/orgs/${orgId}/people/competences`,
      { ...IN_PLACE, params: { limit: 200 } },
    );
  }

  /** Suppliers that may have provided external training. */
  suppliers(orgId: string): Observable<{ readonly items: readonly SupplierOption[] }> {
    return this.api.get<{ readonly items: readonly SupplierOption[] }>(
      `v1/orgs/${orgId}/suppliers`,
      { ...IN_PLACE, params: { limit: 200 } },
    );
  }
}
