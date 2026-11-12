import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { TaskDetail, TaskList } from '../../../core/tasks/task.models';
import {
  BiaDetail,
  BiaFields,
  BiaListItem,
  BiaListQuery,
  BiaUpdate,
  Contact,
  ContactCreate,
  ContactFields,
  ContactScope,
  ControlledAction,
  ExerciseAction,
  ExerciseCompleteRequest,
  ExerciseCreate,
  ExerciseDetail,
  ExerciseListItem,
  ExerciseListQuery,
  ExerciseScheduleRequest,
  ExerciseUpdate,
  FollowUpRequest,
  IctDetail,
  IctFields,
  IctListItem,
  IctListQuery,
  IctUpdate,
  Overview,
  Page,
  PlanDetail,
  PlanFields,
  PlanListItem,
  PlanListQuery,
  PlanUpdate,
} from './continuity.models';

/** Mutations skip the generic toast: pages show a translated, code-specific message. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

const csv = (values: readonly string[] | undefined) =>
  values && values.length ? values.join(',') : undefined;

/**
 * The M20 business continuity API: business impact analyses, continuity plans (with
 * crisis contacts and a recurring exercise schedule), exercises and tests with their
 * follow-up actions, ICT readiness and the org-wide crisis contact list. Every call
 * goes through ApiService (base URL, bearer, error handling).
 *
 * Permissions: `continuity:read` to read, `continuity:write` to create and edit,
 * `continuity:approve` to approve, reject and review BIAs and plans,
 * `continuity:manage` to retire, restore and delete.
 */
@Injectable({ providedIn: 'root' })
export class ContinuityApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/continuity`;
  }

  overview(orgId: string): Observable<Overview> {
    return this.api.get<Overview>(`${this.base(orgId)}/overview`);
  }

  // --- BIAs --------------------------------------------------------------------------

  listBias(orgId: string, query: BiaListQuery = {}): Observable<Page<BiaListItem>> {
    return this.api.get<Page<BiaListItem>>(`${this.base(orgId)}/bias`, {
      params: {
        q: query.q || undefined,
        status: csv(query.status),
        criticality: csv(query.criticality),
        owner: query.owner || undefined,
        uncovered: query.uncovered,
        review_due: query.review_due,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getBia(orgId: string, id: string): Observable<BiaDetail> {
    return this.api.get<BiaDetail>(`${this.base(orgId)}/bias/${id}`);
  }

  createBia(orgId: string, body: BiaFields): Observable<BiaDetail> {
    return this.api.post<BiaDetail>(`${this.base(orgId)}/bias`, body, skipToast());
  }

  updateBia(orgId: string, id: string, body: BiaUpdate): Observable<BiaDetail> {
    return this.api.patch<BiaDetail>(`${this.base(orgId)}/bias/${id}`, body, skipToast());
  }

  deleteBia(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/bias/${id}`, skipToast());
  }

  biaAction(
    orgId: string,
    id: string,
    action: ControlledAction,
    note: string | null = null,
  ): Observable<BiaDetail> {
    return this.api.post<BiaDetail>(
      `${this.base(orgId)}/bias/${id}/${action}`,
      { note },
      skipToast(),
    );
  }

  // --- plans -------------------------------------------------------------------------

  listPlans(orgId: string, query: PlanListQuery = {}): Observable<Page<PlanListItem>> {
    return this.api.get<Page<PlanListItem>>(`${this.base(orgId)}/plans`, {
      params: {
        q: query.q || undefined,
        status: csv(query.status),
        type: query.type || undefined,
        owner: query.owner || undefined,
        bia_id: query.bia_id || undefined,
        review_due: query.review_due,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getPlan(orgId: string, id: string): Observable<PlanDetail> {
    return this.api.get<PlanDetail>(`${this.base(orgId)}/plans/${id}`);
  }

  createPlan(orgId: string, body: PlanFields): Observable<PlanDetail> {
    return this.api.post<PlanDetail>(`${this.base(orgId)}/plans`, body, skipToast());
  }

  updatePlan(orgId: string, id: string, body: PlanUpdate): Observable<PlanDetail> {
    return this.api.patch<PlanDetail>(`${this.base(orgId)}/plans/${id}`, body, skipToast());
  }

  deletePlan(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/plans/${id}`, skipToast());
  }

  planAction(
    orgId: string,
    id: string,
    action: ControlledAction,
    note: string | null = null,
  ): Observable<PlanDetail> {
    return this.api.post<PlanDetail>(
      `${this.base(orgId)}/plans/${id}/${action}`,
      { note },
      skipToast(),
    );
  }

  exerciseSchedule(orgId: string, planId: string): Observable<TaskList> {
    return this.api.get<TaskList>(`${this.base(orgId)}/plans/${planId}/exercise-schedule`);
  }

  scheduleExercises(
    orgId: string,
    planId: string,
    body: ExerciseScheduleRequest,
  ): Observable<TaskDetail> {
    return this.api.post<TaskDetail>(
      `${this.base(orgId)}/plans/${planId}/exercise-schedule`,
      body,
      skipToast(),
    );
  }

  // --- exercises ---------------------------------------------------------------------

  listExercises(orgId: string, query: ExerciseListQuery = {}): Observable<Page<ExerciseListItem>> {
    return this.api.get<Page<ExerciseListItem>>(`${this.base(orgId)}/exercises`, {
      params: {
        q: query.q || undefined,
        status: query.status || undefined,
        type: query.type || undefined,
        plan_id: query.plan_id || undefined,
        ict_system_id: query.ict_system_id || undefined,
        owner: query.owner || undefined,
        overdue: query.overdue,
        from: query.from || undefined,
        to: query.to || undefined,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getExercise(orgId: string, id: string): Observable<ExerciseDetail> {
    return this.api.get<ExerciseDetail>(`${this.base(orgId)}/exercises/${id}`);
  }

  createExercise(orgId: string, body: ExerciseCreate): Observable<ExerciseDetail> {
    return this.api.post<ExerciseDetail>(`${this.base(orgId)}/exercises`, body, skipToast());
  }

  updateExercise(orgId: string, id: string, body: ExerciseUpdate): Observable<ExerciseDetail> {
    return this.api.patch<ExerciseDetail>(`${this.base(orgId)}/exercises/${id}`, body, skipToast());
  }

  deleteExercise(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/exercises/${id}`, skipToast());
  }

  completeExercise(
    orgId: string,
    id: string,
    body: ExerciseCompleteRequest,
  ): Observable<ExerciseDetail> {
    return this.api.post<ExerciseDetail>(
      `${this.base(orgId)}/exercises/${id}/complete`,
      body,
      skipToast(),
    );
  }

  exerciseAction(
    orgId: string,
    id: string,
    action: Exclude<ExerciseAction, 'complete'>,
    note: string | null = null,
  ): Observable<ExerciseDetail> {
    return this.api.post<ExerciseDetail>(
      `${this.base(orgId)}/exercises/${id}/${action}`,
      action === 'cancel' ? { note } : {},
      skipToast(),
    );
  }

  followUps(orgId: string, exerciseId: string): Observable<TaskList> {
    return this.api.get<TaskList>(`${this.base(orgId)}/exercises/${exerciseId}/follow-ups`);
  }

  addFollowUp(orgId: string, exerciseId: string, body: FollowUpRequest): Observable<TaskDetail> {
    return this.api.post<TaskDetail>(
      `${this.base(orgId)}/exercises/${exerciseId}/follow-ups`,
      body,
      skipToast(),
    );
  }

  // --- ICT services ------------------------------------------------------------------

  listIct(orgId: string, query: IctListQuery = {}): Observable<Page<IctListItem>> {
    return this.api.get<Page<IctListItem>>(`${this.base(orgId)}/ict-systems`, {
      params: {
        q: query.q || undefined,
        status: query.status || undefined,
        readiness: csv(query.readiness),
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getIct(orgId: string, id: string): Observable<IctDetail> {
    return this.api.get<IctDetail>(`${this.base(orgId)}/ict-systems/${id}`);
  }

  createIct(orgId: string, body: IctFields): Observable<IctDetail> {
    return this.api.post<IctDetail>(`${this.base(orgId)}/ict-systems`, body, skipToast());
  }

  updateIct(orgId: string, id: string, body: IctUpdate): Observable<IctDetail> {
    return this.api.patch<IctDetail>(`${this.base(orgId)}/ict-systems/${id}`, body, skipToast());
  }

  deleteIct(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/ict-systems/${id}`, skipToast());
  }

  // --- contacts ----------------------------------------------------------------------

  listContacts(
    orgId: string,
    scope: ContactScope = 'org',
    planId: string | null = null,
  ): Observable<readonly Contact[]> {
    return this.api
      .get<{ items: readonly Contact[] }>(`${this.base(orgId)}/contacts`, {
        params: { scope, plan_id: planId || undefined },
      })
      .pipe(map((res) => res.items));
  }

  createContact(orgId: string, body: ContactCreate): Observable<Contact> {
    return this.api.post<Contact>(`${this.base(orgId)}/contacts`, body, skipToast());
  }

  updateContact(orgId: string, id: string, body: Partial<ContactFields>): Observable<Contact> {
    return this.api.patch<Contact>(`${this.base(orgId)}/contacts/${id}`, body, skipToast());
  }

  deleteContact(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/contacts/${id}`, skipToast());
  }
}
