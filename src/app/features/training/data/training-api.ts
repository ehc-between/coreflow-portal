import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  Assignment,
  AssignmentList,
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

/** Mutations report their own errors in place (codes mapped by `trainingErrorKey`). */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

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
        course_id: query.course_id || null,
        user_id: query.user_id || null,
        mine: query.mine ? true : null,
        status: query.status?.length ? query.status : null,
        overdue: query.overdue ?? null,
        sort: query.sort ?? null,
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

  // --- records ---------------------------------------------------------------------

  listRecords(orgId: string, query: RecordQuery = {}): Observable<RecordList> {
    return this.api.get<RecordList>(`${this.base(orgId)}/records`, {
      params: {
        course_id: query.course_id || null,
        user_id: query.user_id || null,
        mine: query.mine ? true : null,
        passed: query.passed ?? null,
        expiring_within_days: query.expiring_within_days ?? null,
        expired: query.expired ?? null,
        sort: query.sort ?? null,
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

  // --- overviews -------------------------------------------------------------------

  matrix(orgId: string, query: MatrixQuery = {}): Observable<Matrix> {
    return this.api.get<Matrix>(`${this.base(orgId)}/matrix`, {
      params: {
        course_ids: query.course_ids?.length ? query.course_ids.join(',') : null,
        category: query.category || null,
        department_id: query.department_id || null,
      },
    });
  }

  needs(orgId: string, userId?: string | null): Observable<Needs> {
    return this.api.get<Needs>(`${this.base(orgId)}/needs`, {
      params: { user_id: userId || null },
    });
  }

  stats(orgId: string): Observable<TrainingStats> {
    return this.api.get<TrainingStats>(`${this.base(orgId)}/stats`);
  }
}
