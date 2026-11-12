import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  CreateKpiRequest,
  CreateMeasurementRequest,
  CreateObjectiveRequest,
  KpiDetail,
  KpiList,
  KpiListQuery,
  KpiSeries,
  ManagementSystem,
  Measurement,
  MeasurementList,
  MeasurementListQuery,
  ObjectiveDetail,
  ObjectiveList,
  ObjectiveListQuery,
  ObjectivesOverview,
  UpdateKpiRequest,
  UpdateMeasurementRequest,
  UpdateObjectiveRequest,
} from './objectives.models';

/** Mutations skip the generic toast: callers show a translated, code-specific message. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

const csv = (values?: readonly string[]) => (values?.length ? values.join(',') : undefined);

/**
 * Objectives, KPIs and measurements (M08), under `v1/orgs/{org}/objectives`.
 * Permissions: `objectives:read` to read, `objectives:write` to create/edit,
 * `objectives:measure` (or write) to record measurements, `objectives:manage` to
 * delete anyone's records. While the module is disabled every call is a 404
 * `module_disabled`.
 */
@Injectable({ providedIn: 'root' })
export class ObjectivesApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/objectives`;
  }

  // --- objectives ------------------------------------------------------------------

  list(orgId: string, query: ObjectiveListQuery = {}): Observable<ObjectiveList> {
    return this.api.get<ObjectiveList>(this.base(orgId), {
      params: {
        q: query.q || undefined,
        status: csv(query.status),
        management_system: query.management_system,
        owner: query.owner,
        department_id: query.department_id,
        overdue: query.overdue || undefined,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  overview(orgId: string, managementSystem?: ManagementSystem): Observable<ObjectivesOverview> {
    return this.api.get<ObjectivesOverview>(`${this.base(orgId)}/overview`, {
      params: { management_system: managementSystem },
    });
  }

  get(orgId: string, id: string): Observable<ObjectiveDetail> {
    return this.api.get<ObjectiveDetail>(`${this.base(orgId)}/${id}`);
  }

  create(orgId: string, body: CreateObjectiveRequest): Observable<ObjectiveDetail> {
    return this.api.post<ObjectiveDetail>(this.base(orgId), body, skipToast());
  }

  update(orgId: string, id: string, body: UpdateObjectiveRequest): Observable<ObjectiveDetail> {
    return this.api.patch<ObjectiveDetail>(`${this.base(orgId)}/${id}`, body, skipToast());
  }

  delete(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/${id}`, skipToast());
  }

  // --- KPIs ------------------------------------------------------------------------

  listKpis(orgId: string, query: KpiListQuery = {}): Observable<KpiList> {
    return this.api.get<KpiList>(`${this.base(orgId)}/kpis`, {
      params: {
        q: query.q || undefined,
        status: csv(query.status),
        last_status: csv(query.last_status),
        objective_id: query.objective_id,
        management_system: query.management_system,
        owner: query.owner,
        department_id: query.department_id,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getKpi(orgId: string, id: string): Observable<KpiDetail> {
    return this.api.get<KpiDetail>(`${this.base(orgId)}/kpis/${id}`);
  }

  createKpi(orgId: string, body: CreateKpiRequest): Observable<KpiDetail> {
    return this.api.post<KpiDetail>(`${this.base(orgId)}/kpis`, body, skipToast());
  }

  updateKpi(orgId: string, id: string, body: UpdateKpiRequest): Observable<KpiDetail> {
    return this.api.patch<KpiDetail>(`${this.base(orgId)}/kpis/${id}`, body, skipToast());
  }

  deleteKpi(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/kpis/${id}`, skipToast());
  }

  series(orgId: string, kpiId: string, limit = 60): Observable<KpiSeries> {
    return this.api.get<KpiSeries>(`${this.base(orgId)}/kpis/${kpiId}/series`, {
      params: { limit },
    });
  }

  // --- measurements ----------------------------------------------------------------

  listMeasurements(
    orgId: string,
    kpiId: string,
    query: MeasurementListQuery = {},
  ): Observable<MeasurementList> {
    return this.api.get<MeasurementList>(`${this.base(orgId)}/kpis/${kpiId}/measurements`, {
      params: { from: query.from, to: query.to, limit: query.limit, offset: query.offset },
    });
  }

  createMeasurement(
    orgId: string,
    kpiId: string,
    body: CreateMeasurementRequest,
  ): Observable<Measurement> {
    return this.api.post<Measurement>(
      `${this.base(orgId)}/kpis/${kpiId}/measurements`,
      body,
      skipToast(),
    );
  }

  updateMeasurement(
    orgId: string,
    kpiId: string,
    measurementId: string,
    body: UpdateMeasurementRequest,
  ): Observable<Measurement> {
    return this.api.patch<Measurement>(
      `${this.base(orgId)}/kpis/${kpiId}/measurements/${measurementId}`,
      body,
      skipToast(),
    );
  }

  deleteMeasurement(orgId: string, kpiId: string, measurementId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.base(orgId)}/kpis/${kpiId}/measurements/${measurementId}`,
      skipToast(),
    );
  }
}
