import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { TaskDetail, TaskList } from '../../../core/tasks/task.models';
import {
  Change,
  ChangeCreate,
  ChangeUpdate,
  ClauseDefaults,
  Evaluation,
  EvaluationCreate,
  EvaluationCreated,
  ExportFormat,
  FollowUpIn,
  Obligation,
  ObligationCreate,
  ObligationList,
  ObligationListQuery,
  ObligationSummary,
  ObligationUpdate,
} from './obligation.models';

/** Pages show coded errors themselves, so the generic toast is skipped. */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

function csv(values: readonly string[] | undefined): string | undefined {
  return values?.length ? values.join(',') : undefined;
}

/** The query parameters of `GET obligations` (csv lists, unset values dropped). */
export function obligationListParams(query: ObligationListQuery): QueryParams {
  return {
    q: query.q?.trim() || undefined,
    status: csv(query.status),
    type: csv(query.type),
    compliance: csv(query.compliance),
    framework: query.framework || undefined,
    owner: query.owner || undefined,
    evaluation_overdue: query.evaluation_overdue,
    expiring_within_days: query.expiring_within_days,
    without_schedule: query.without_schedule,
    renewal_due: query.renewal_due,
    clause_ref: query.clause_ref || undefined,
    customer_id: query.customer_id || undefined,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  };
}

/** Compliance obligations register API (M18): `v1/orgs/{org}/obligations/...`. */
@Injectable({ providedIn: 'root' })
export class ObligationsApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/obligations`;
  }

  list(orgId: string, query: ObligationListQuery = {}): Observable<ObligationList> {
    return this.api.get<ObligationList>(this.base(orgId), {
      ...IN_PLACE,
      params: obligationListParams(query),
    });
  }

  summary(orgId: string, expiringWithinDays = 60): Observable<ObligationSummary> {
    return this.api.get<ObligationSummary>(`${this.base(orgId)}/summary`, {
      ...IN_PLACE,
      params: { expiring_within_days: expiringWithinDays },
    });
  }

  /** The clauses the clause picker proposes per ticked framework. */
  clauseDefaults(orgId: string): Observable<ClauseDefaults> {
    return this.api.get<ClauseDefaults>(`${this.base(orgId)}/clause-defaults`, IN_PLACE);
  }

  /** The register as a file ("Lovregister"), with the list filters (paging is ignored). */
  export(
    orgId: string,
    format: ExportFormat,
    lang: string,
    query: ObligationListQuery = {},
  ): Observable<Blob> {
    const params = obligationListParams({ ...query, limit: undefined, offset: undefined });
    return this.api.getBlob(`${this.base(orgId)}/export`, {
      ...IN_PLACE,
      params: { ...params, sort: undefined, format, lang },
    });
  }

  get(orgId: string, id: string): Observable<Obligation> {
    return this.api.get<Obligation>(`${this.base(orgId)}/${id}`, IN_PLACE);
  }

  create(orgId: string, body: ObligationCreate): Observable<Obligation> {
    return this.api.post<Obligation>(this.base(orgId), body, IN_PLACE);
  }

  update(orgId: string, id: string, body: ObligationUpdate): Observable<Obligation> {
    return this.api.patch<Obligation>(`${this.base(orgId)}/${id}`, body, IN_PLACE);
  }

  delete(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/${id}`, IN_PLACE);
  }

  // --- evaluations ------------------------------------------------------------------

  evaluations(orgId: string, id: string): Observable<readonly Evaluation[]> {
    return this.api
      .get<{ items: readonly Evaluation[] }>(`${this.base(orgId)}/${id}/evaluations`, IN_PLACE)
      .pipe(map((r) => r.items));
  }

  evaluate(orgId: string, id: string, body: EvaluationCreate): Observable<EvaluationCreated> {
    return this.api.post<EvaluationCreated>(
      `${this.base(orgId)}/${id}/evaluations`,
      body,
      IN_PLACE,
    );
  }

  /** Link (or unlink with null) the deviation that follows up an evaluation. */
  setEvaluationDeviation(
    orgId: string,
    id: string,
    evaluationId: string,
    deviationId: string | null,
  ): Observable<Evaluation> {
    return this.api.put<Evaluation>(
      `${this.base(orgId)}/${id}/evaluations/${evaluationId}/deviation`,
      { deviation_id: deviationId },
      IN_PLACE,
    );
  }

  removeEvaluation(orgId: string, id: string, evaluationId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/${id}/evaluations/${evaluationId}`, IN_PLACE);
  }

  // --- actions (platform tasks: evaluations and follow-ups) -------------------------

  actions(orgId: string, id: string): Observable<TaskList> {
    return this.api.get<TaskList>(`${this.base(orgId)}/${id}/actions`, IN_PLACE);
  }

  addAction(orgId: string, id: string, body: FollowUpIn): Observable<TaskDetail> {
    return this.api.post<TaskDetail>(`${this.base(orgId)}/${id}/actions`, body, IN_PLACE);
  }

  /** A follow-up task on one duty (assigned to the duty owner, due in 30 days by default). */
  addDutyAction(
    orgId: string,
    id: string,
    dutyId: string,
    body: FollowUpIn,
  ): Observable<TaskDetail> {
    return this.api.post<TaskDetail>(
      `${this.base(orgId)}/${id}/duties/${dutyId}/actions`,
      body,
      IN_PLACE,
    );
  }

  // --- change monitoring notes ------------------------------------------------------

  changes(orgId: string, id: string): Observable<readonly Change[]> {
    return this.api
      .get<{ items: readonly Change[] }>(`${this.base(orgId)}/${id}/changes`, IN_PLACE)
      .pipe(map((r) => r.items));
  }

  addChange(orgId: string, id: string, body: ChangeCreate): Observable<Change> {
    return this.api.post<Change>(`${this.base(orgId)}/${id}/changes`, body, IN_PLACE);
  }

  updateChange(
    orgId: string,
    id: string,
    changeId: string,
    body: ChangeUpdate,
  ): Observable<Change> {
    return this.api.patch<Change>(`${this.base(orgId)}/${id}/changes/${changeId}`, body, IN_PLACE);
  }

  removeChange(orgId: string, id: string, changeId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/${id}/changes/${changeId}`, IN_PLACE);
  }
}
