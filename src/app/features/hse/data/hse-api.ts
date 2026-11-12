import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { TaskDetail, TaskList, TaskStatus } from '../../../core/tasks/task.models';
import {
  ChecklistTemplate,
  Consultation,
  ConsultationCreate,
  ConsultationHold,
  ConsultationQuery,
  ConsultationUpdate,
  HseActionCreate,
  HseLang,
  HseOverview,
  ListResponse,
  Ppe,
  PpeCreate,
  PpeInspection,
  PpeInspectionCreate,
  PpeIssue,
  PpeQuery,
  PpeUpdate,
  SafetyRoundCreate,
  Sja,
  SjaAction,
  SjaCreate,
  SjaQuery,
  SjaUpdate,
} from './hse.models';

/** Mutations toast their own coded message (see `hseErrorKey`), so skip the generic one. */
const quiet = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/** The entity types of the module, with the path segment of each record API. */
export type HseEntityType = 'sja' | 'ppe_item' | 'worker_consultation';

const SEGMENT: Readonly<Record<HseEntityType, string>> = {
  sja: 'sja',
  ppe_item: 'ppe',
  worker_consultation: 'consultations',
};

function csv(values: readonly string[] | undefined): string | undefined {
  return values && values.length ? values.join(',') : undefined;
}

/**
 * Health and safety (M21) API: safe job analyses, the PPE register, worker
 * consultation records, follow-up actions (F2 tasks) and safety rounds.
 * Every route is under `v1/orgs/{org}/hse` and gated by the `hse` module.
 */
@Injectable({ providedIn: 'root' })
export class HseApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/hse`;
  }

  overview(orgId: string): Observable<HseOverview> {
    return this.api.get<HseOverview>(`${this.base(orgId)}/overview`);
  }

  // --- SJA ----------------------------------------------------------------------------

  listSja(orgId: string, query: SjaQuery = {}): Observable<ListResponse<Sja>> {
    const params: QueryParams = { ...query, status: csv(query.status) };
    return this.api.get<ListResponse<Sja>>(`${this.base(orgId)}/sja`, { params });
  }

  getSja(orgId: string, id: string): Observable<Sja> {
    return this.api.get<Sja>(`${this.base(orgId)}/sja/${id}`);
  }

  createSja(orgId: string, body: SjaCreate): Observable<Sja> {
    return this.api.post<Sja>(`${this.base(orgId)}/sja`, body, quiet());
  }

  updateSja(orgId: string, id: string, body: SjaUpdate): Observable<Sja> {
    return this.api.patch<Sja>(`${this.base(orgId)}/sja/${id}`, body, quiet());
  }

  transitionSja(
    orgId: string,
    id: string,
    action: SjaAction,
    reason?: string | null,
  ): Observable<Sja> {
    return this.api.post<Sja>(
      `${this.base(orgId)}/sja/${id}/transitions/${action}`,
      reason ? { reason } : {},
      quiet(),
    );
  }

  deleteSja(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/sja/${id}`, quiet());
  }

  // --- PPE ----------------------------------------------------------------------------

  listPpe(orgId: string, query: PpeQuery = {}): Observable<ListResponse<Ppe>> {
    const params: QueryParams = { ...query, status: csv(query.status) };
    return this.api.get<ListResponse<Ppe>>(`${this.base(orgId)}/ppe`, { params });
  }

  getPpe(orgId: string, id: string): Observable<Ppe> {
    return this.api.get<Ppe>(`${this.base(orgId)}/ppe/${id}`);
  }

  createPpe(orgId: string, body: PpeCreate): Observable<Ppe> {
    return this.api.post<Ppe>(`${this.base(orgId)}/ppe`, body, quiet());
  }

  updatePpe(orgId: string, id: string, body: PpeUpdate): Observable<Ppe> {
    return this.api.patch<Ppe>(`${this.base(orgId)}/ppe/${id}`, body, quiet());
  }

  issuePpe(orgId: string, id: string, body: PpeIssue): Observable<Ppe> {
    return this.api.post<Ppe>(`${this.base(orgId)}/ppe/${id}/issue`, body, quiet());
  }

  returnPpe(orgId: string, id: string): Observable<Ppe> {
    return this.api.post<Ppe>(`${this.base(orgId)}/ppe/${id}/return`, {}, quiet());
  }

  listInspections(orgId: string, id: string): Observable<readonly PpeInspection[]> {
    return this.api
      .get<{ items: readonly PpeInspection[] }>(`${this.base(orgId)}/ppe/${id}/inspections`)
      .pipe(map((res) => res.items));
  }

  recordInspection(
    orgId: string,
    id: string,
    body: PpeInspectionCreate,
  ): Observable<PpeInspection> {
    return this.api.post<PpeInspection>(`${this.base(orgId)}/ppe/${id}/inspections`, body, quiet());
  }

  deletePpe(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/ppe/${id}`, quiet());
  }

  // --- worker consultation ------------------------------------------------------------------

  listConsultations(
    orgId: string,
    query: ConsultationQuery = {},
  ): Observable<ListResponse<Consultation>> {
    const params: QueryParams = { ...query, status: csv(query.status) };
    return this.api.get<ListResponse<Consultation>>(`${this.base(orgId)}/consultations`, {
      params,
    });
  }

  getConsultation(orgId: string, id: string): Observable<Consultation> {
    return this.api.get<Consultation>(`${this.base(orgId)}/consultations/${id}`);
  }

  createConsultation(orgId: string, body: ConsultationCreate): Observable<Consultation> {
    return this.api.post<Consultation>(`${this.base(orgId)}/consultations`, body, quiet());
  }

  updateConsultation(
    orgId: string,
    id: string,
    body: ConsultationUpdate,
  ): Observable<Consultation> {
    return this.api.patch<Consultation>(`${this.base(orgId)}/consultations/${id}`, body, quiet());
  }

  holdConsultation(orgId: string, id: string, body: ConsultationHold): Observable<Consultation> {
    return this.api.post<Consultation>(
      `${this.base(orgId)}/consultations/${id}/hold`,
      body,
      quiet(),
    );
  }

  cancelConsultation(orgId: string, id: string): Observable<Consultation> {
    return this.api.post<Consultation>(
      `${this.base(orgId)}/consultations/${id}/cancel`,
      {},
      quiet(),
    );
  }

  deleteConsultation(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/consultations/${id}`, quiet());
  }

  // --- follow-up actions (F2 tasks with module `hse`) -----------------------------------------

  createAction(
    orgId: string,
    entityType: HseEntityType,
    id: string,
    body: HseActionCreate,
  ): Observable<TaskDetail> {
    return this.api.post<TaskDetail>(
      `${this.base(orgId)}/${SEGMENT[entityType]}/${id}/actions`,
      body,
      quiet(),
    );
  }

  // --- safety rounds --------------------------------------------------------------------------

  checklistTemplate(orgId: string, lang: HseLang): Observable<ChecklistTemplate> {
    return this.api.get<ChecklistTemplate>(`${this.base(orgId)}/safety-rounds/checklist-template`, {
      params: { lang },
    });
  }

  listSafetyRounds(
    orgId: string,
    query: { status?: readonly TaskStatus[]; limit?: number; offset?: number } = {},
  ): Observable<TaskList> {
    const params: QueryParams = { ...query, status: csv(query.status) };
    return this.api.get<TaskList>(`${this.base(orgId)}/safety-rounds`, { params });
  }

  createSafetyRound(orgId: string, body: SafetyRoundCreate): Observable<TaskDetail> {
    return this.api.post<TaskDetail>(`${this.base(orgId)}/safety-rounds`, body, quiet());
  }
}
