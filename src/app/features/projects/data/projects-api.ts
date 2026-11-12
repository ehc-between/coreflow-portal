import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  DesignReview,
  DesignReviewCreate,
  DesignReviewUpdate,
  Lesson,
  LessonIn,
  LessonUpdate,
  MemberRole,
  Milestone,
  MilestoneCreate,
  MilestoneUpdate,
  ProjectCloseBody,
  ProjectCreate,
  ProjectDetail,
  ProjectList,
  ProjectListQuery,
  ProjectMember,
  ProjectPlan,
  ProjectReopenBody,
  ProjectSummary,
  ProjectUpdate,
} from './project.models';

/** Pages show coded errors themselves, so the generic toast is skipped. */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** The query parameters of `GET projects` (csv lists, unset values dropped). */
export function projectListParams(query: ProjectListQuery): QueryParams {
  return {
    q: query.q?.trim() || undefined,
    status: query.status?.length ? query.status.join(',') : undefined,
    owner: query.owner || undefined,
    member: query.member || undefined,
    kind: query.kind || undefined,
    department_id: query.department_id || undefined,
    overdue: query.overdue,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  };
}

/** Projects API (M14): `v1/orgs/{org}/projects/...`. */
@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/projects`;
  }

  private one(orgId: string, id: string): string {
    return `${this.base(orgId)}/${id}`;
  }

  // --- projects -----------------------------------------------------------------------

  list(orgId: string, query: ProjectListQuery = {}): Observable<ProjectList> {
    return this.api.get<ProjectList>(this.base(orgId), {
      ...IN_PLACE,
      params: projectListParams(query),
    });
  }

  get(orgId: string, id: string): Observable<ProjectDetail> {
    return this.api.get<ProjectDetail>(this.one(orgId, id), IN_PLACE);
  }

  create(orgId: string, body: ProjectCreate): Observable<ProjectDetail> {
    return this.api.post<ProjectDetail>(this.base(orgId), body, IN_PLACE);
  }

  update(orgId: string, id: string, body: ProjectUpdate): Observable<ProjectDetail> {
    return this.api.patch<ProjectDetail>(this.one(orgId, id), body, IN_PLACE);
  }

  delete(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(this.one(orgId, id), IN_PLACE);
  }

  close(orgId: string, id: string, body: ProjectCloseBody): Observable<ProjectDetail> {
    return this.api.post<ProjectDetail>(`${this.one(orgId, id)}/close`, body, IN_PLACE);
  }

  reopen(orgId: string, id: string, body: ProjectReopenBody = {}): Observable<ProjectDetail> {
    return this.api.post<ProjectDetail>(`${this.one(orgId, id)}/reopen`, body, IN_PLACE);
  }

  summary(orgId: string, id: string): Observable<ProjectSummary> {
    return this.api.get<ProjectSummary>(`${this.one(orgId, id)}/summary`, IN_PLACE);
  }

  plan(orgId: string, id: string): Observable<ProjectPlan> {
    return this.api.get<ProjectPlan>(`${this.one(orgId, id)}/plan`, IN_PLACE);
  }

  // --- team ---------------------------------------------------------------------------

  members(orgId: string, id: string): Observable<readonly ProjectMember[]> {
    return this.api
      .get<{ items: readonly ProjectMember[] }>(`${this.one(orgId, id)}/members`, IN_PLACE)
      .pipe(map((r) => r.items));
  }

  setMember(
    orgId: string,
    id: string,
    userId: string,
    role: MemberRole,
  ): Observable<readonly ProjectMember[]> {
    return this.api
      .put<{
        items: readonly ProjectMember[];
      }>(`${this.one(orgId, id)}/members/${userId}`, { role }, IN_PLACE)
      .pipe(map((r) => r.items));
  }

  removeMember(orgId: string, id: string, userId: string): Observable<void> {
    return this.api.delete<void>(`${this.one(orgId, id)}/members/${userId}`, IN_PLACE);
  }

  // --- phases and milestones ----------------------------------------------------------

  milestones(orgId: string, id: string): Observable<readonly Milestone[]> {
    return this.api
      .get<{ items: readonly Milestone[] }>(`${this.one(orgId, id)}/milestones`, IN_PLACE)
      .pipe(map((r) => r.items));
  }

  addMilestone(orgId: string, id: string, body: MilestoneCreate): Observable<Milestone> {
    return this.api.post<Milestone>(`${this.one(orgId, id)}/milestones`, body, IN_PLACE);
  }

  updateMilestone(
    orgId: string,
    id: string,
    milestoneId: string,
    body: MilestoneUpdate,
  ): Observable<Milestone> {
    return this.api.patch<Milestone>(
      `${this.one(orgId, id)}/milestones/${milestoneId}`,
      body,
      IN_PLACE,
    );
  }

  deleteMilestone(orgId: string, id: string, milestoneId: string): Observable<void> {
    return this.api.delete<void>(`${this.one(orgId, id)}/milestones/${milestoneId}`, IN_PLACE);
  }

  // --- design reviews -----------------------------------------------------------------

  designReviews(orgId: string, id: string): Observable<readonly DesignReview[]> {
    return this.api
      .get<{ items: readonly DesignReview[] }>(`${this.one(orgId, id)}/design-reviews`, IN_PLACE)
      .pipe(map((r) => r.items));
  }

  addDesignReview(orgId: string, id: string, body: DesignReviewCreate): Observable<DesignReview> {
    return this.api.post<DesignReview>(`${this.one(orgId, id)}/design-reviews`, body, IN_PLACE);
  }

  updateDesignReview(
    orgId: string,
    id: string,
    reviewId: string,
    body: DesignReviewUpdate,
  ): Observable<DesignReview> {
    return this.api.patch<DesignReview>(
      `${this.one(orgId, id)}/design-reviews/${reviewId}`,
      body,
      IN_PLACE,
    );
  }

  deleteDesignReview(orgId: string, id: string, reviewId: string): Observable<void> {
    return this.api.delete<void>(`${this.one(orgId, id)}/design-reviews/${reviewId}`, IN_PLACE);
  }

  // --- lessons learned ----------------------------------------------------------------

  lessons(orgId: string, id: string): Observable<readonly Lesson[]> {
    return this.api
      .get<{ items: readonly Lesson[] }>(`${this.one(orgId, id)}/lessons`, IN_PLACE)
      .pipe(map((r) => r.items));
  }

  addLesson(orgId: string, id: string, body: LessonIn): Observable<Lesson> {
    return this.api.post<Lesson>(`${this.one(orgId, id)}/lessons`, body, IN_PLACE);
  }

  updateLesson(
    orgId: string,
    id: string,
    lessonId: string,
    body: LessonUpdate,
  ): Observable<Lesson> {
    return this.api.patch<Lesson>(`${this.one(orgId, id)}/lessons/${lessonId}`, body, IN_PLACE);
  }

  deleteLesson(orgId: string, id: string, lessonId: string): Observable<void> {
    return this.api.delete<void>(`${this.one(orgId, id)}/lessons/${lessonId}`, IN_PLACE);
  }
}
