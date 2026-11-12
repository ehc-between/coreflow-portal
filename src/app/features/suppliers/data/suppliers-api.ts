import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  CreateEvaluationRequest,
  CreateSupplierRequest,
  DecideEvaluationRequest,
  EvaluationDetail,
  EvaluationListItem,
  EvaluationListQuery,
  EvaluationKind,
  Page,
  PerformanceEntry,
  PerformanceList,
  PerformanceQuery,
  PerformanceRequest,
  Questionnaire,
  QuestionnaireRequest,
  SupplierDetail,
  SupplierListItem,
  SupplierListQuery,
  SupplierStatusRequest,
  SupplierSummary,
  UpdateEvaluationRequest,
  UpdateSupplierRequest,
} from './supplier.models';

/** Mutations skip the generic toast: pages show a translated, code-specific message. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

const csv = (values: readonly string[] | undefined) =>
  values && values.length ? values.join(',') : undefined;

/**
 * The M13 suppliers API: the supplier register, evaluations (scored questionnaires
 * with an approval decision), questionnaire templates and the performance log.
 * Every call goes through ApiService (base URL, bearer, error handling).
 *
 * Permissions: `suppliers:read` to read, `suppliers:write` to register, edit,
 * evaluate and log performance, `suppliers:approve` to decide evaluations and move a
 * supplier into or out of an approval status, `suppliers:manage` to delete and to
 * manage questionnaire templates.
 */
@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/suppliers`;
  }

  // --- register ----------------------------------------------------------------------

  list(orgId: string, query: SupplierListQuery = {}): Observable<Page<SupplierListItem>> {
    return this.api.get<Page<SupplierListItem>>(this.base(orgId), {
      params: {
        q: query.q || undefined,
        status: csv(query.status),
        criticality: csv(query.criticality),
        category: csv(query.category),
        owner: query.owner || undefined,
        department_id: query.department_id || undefined,
        evaluation_due: query.evaluation_due,
        processes_personal_data: query.processes_personal_data,
        has_system_access: query.has_system_access,
        provides_cloud_services: query.provides_cloud_services,
        provides_ai: query.provides_ai,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  summary(orgId: string): Observable<SupplierSummary> {
    return this.api.get<SupplierSummary>(`${this.base(orgId)}/summary`);
  }

  get(orgId: string, id: string): Observable<SupplierDetail> {
    return this.api.get<SupplierDetail>(`${this.base(orgId)}/${id}`);
  }

  create(orgId: string, body: CreateSupplierRequest): Observable<SupplierDetail> {
    return this.api.post<SupplierDetail>(this.base(orgId), body, skipToast());
  }

  update(orgId: string, id: string, body: UpdateSupplierRequest): Observable<SupplierDetail> {
    return this.api.patch<SupplierDetail>(`${this.base(orgId)}/${id}`, body, skipToast());
  }

  setStatus(orgId: string, id: string, body: SupplierStatusRequest): Observable<SupplierDetail> {
    return this.api.post<SupplierDetail>(`${this.base(orgId)}/${id}/status`, body, skipToast());
  }

  delete(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/${id}`, skipToast());
  }

  // --- evaluations -------------------------------------------------------------------

  listEvaluations(
    orgId: string,
    query: EvaluationListQuery = {},
  ): Observable<Page<EvaluationListItem>> {
    return this.api.get<Page<EvaluationListItem>>(`${this.base(orgId)}/evaluations`, {
      params: {
        supplier_id: query.supplier_id,
        status: csv(query.status),
        kind: query.kind,
        evaluator: query.evaluator || undefined,
        overdue: query.overdue || undefined,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  listSupplierEvaluations(
    orgId: string,
    supplierId: string,
    query: Pick<EvaluationListQuery, 'status' | 'kind' | 'limit' | 'offset'> = {},
  ): Observable<Page<EvaluationListItem>> {
    return this.api.get<Page<EvaluationListItem>>(`${this.base(orgId)}/${supplierId}/evaluations`, {
      params: {
        status: csv(query.status),
        kind: query.kind,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  createEvaluation(
    orgId: string,
    supplierId: string,
    body: CreateEvaluationRequest,
  ): Observable<EvaluationDetail> {
    return this.api.post<EvaluationDetail>(
      `${this.base(orgId)}/${supplierId}/evaluations`,
      body,
      skipToast(),
    );
  }

  getEvaluation(orgId: string, evaluationId: string): Observable<EvaluationDetail> {
    return this.api.get<EvaluationDetail>(`${this.base(orgId)}/evaluations/${evaluationId}`);
  }

  updateEvaluation(
    orgId: string,
    evaluationId: string,
    body: UpdateEvaluationRequest,
  ): Observable<EvaluationDetail> {
    return this.api.patch<EvaluationDetail>(
      `${this.base(orgId)}/evaluations/${evaluationId}`,
      body,
      skipToast(),
    );
  }

  submitEvaluation(orgId: string, evaluationId: string): Observable<EvaluationDetail> {
    return this.api.post<EvaluationDetail>(
      `${this.base(orgId)}/evaluations/${evaluationId}/submit`,
      {},
      skipToast(),
    );
  }

  reopenEvaluation(
    orgId: string,
    evaluationId: string,
    reason?: string | null,
  ): Observable<EvaluationDetail> {
    return this.api.post<EvaluationDetail>(
      `${this.base(orgId)}/evaluations/${evaluationId}/reopen`,
      { reason: reason || null },
      skipToast(),
    );
  }

  decideEvaluation(
    orgId: string,
    evaluationId: string,
    body: DecideEvaluationRequest,
  ): Observable<EvaluationDetail> {
    return this.api.post<EvaluationDetail>(
      `${this.base(orgId)}/evaluations/${evaluationId}/decide`,
      body,
      skipToast(),
    );
  }

  cancelEvaluation(
    orgId: string,
    evaluationId: string,
    reason?: string | null,
  ): Observable<EvaluationDetail> {
    return this.api.post<EvaluationDetail>(
      `${this.base(orgId)}/evaluations/${evaluationId}/cancel`,
      { reason: reason || null },
      skipToast(),
    );
  }

  deleteEvaluation(orgId: string, evaluationId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/evaluations/${evaluationId}`, skipToast());
  }

  // --- questionnaire templates -------------------------------------------------------

  listQuestionnaires(
    orgId: string,
    query: { readonly kind?: EvaluationKind; readonly lang?: string } = {},
  ): Observable<{ readonly items: readonly Questionnaire[] }> {
    return this.api.get<{ readonly items: readonly Questionnaire[] }>(
      `${this.base(orgId)}/questionnaires`,
      { params: { kind: query.kind, lang: query.lang } },
    );
  }

  getQuestionnaire(orgId: string, id: string, lang?: string): Observable<Questionnaire> {
    return this.api.get<Questionnaire>(`${this.base(orgId)}/questionnaires/${id}`, {
      params: { lang },
    });
  }

  createQuestionnaire(orgId: string, body: QuestionnaireRequest): Observable<Questionnaire> {
    return this.api.post<Questionnaire>(`${this.base(orgId)}/questionnaires`, body, skipToast());
  }

  updateQuestionnaire(
    orgId: string,
    id: string,
    body: Partial<QuestionnaireRequest>,
  ): Observable<Questionnaire> {
    return this.api.patch<Questionnaire>(
      `${this.base(orgId)}/questionnaires/${id}`,
      body,
      skipToast(),
    );
  }

  deleteQuestionnaire(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/questionnaires/${id}`, skipToast());
  }

  // --- performance -------------------------------------------------------------------

  listPerformance(
    orgId: string,
    supplierId: string,
    query: PerformanceQuery = {},
  ): Observable<PerformanceList> {
    return this.api.get<PerformanceList>(`${this.base(orgId)}/${supplierId}/performance`, {
      params: { kind: query.kind, since: query.since, limit: query.limit, offset: query.offset },
    });
  }

  logPerformance(
    orgId: string,
    supplierId: string,
    body: PerformanceRequest,
  ): Observable<PerformanceEntry> {
    return this.api.post<PerformanceEntry>(
      `${this.base(orgId)}/${supplierId}/performance`,
      body,
      skipToast(),
    );
  }

  updatePerformance(
    orgId: string,
    entryId: string,
    body: Partial<PerformanceRequest>,
  ): Observable<PerformanceEntry> {
    return this.api.patch<PerformanceEntry>(
      `${this.base(orgId)}/performance/${entryId}`,
      body,
      skipToast(),
    );
  }

  deletePerformance(orgId: string, entryId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/performance/${entryId}`, skipToast());
  }
}
