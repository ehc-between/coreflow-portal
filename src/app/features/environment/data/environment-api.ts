import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import {
  Aspect,
  AspectCreate,
  AspectListQuery,
  AspectUpdate,
  Drill,
  DrillCreate,
  EmergencyPlan,
  Emissions,
  EnvironmentOverview,
  Measurement,
  MeasurementCreate,
  MeasurementQuery,
  MeasurementUpdate,
  Metric,
  MetricCreate,
  MetricListQuery,
  MetricUpdate,
  Page,
  PlanCreate,
  PlanListQuery,
  PlanUpdate,
  ReviewIn,
  ScoringMethod,
  ScoringMethodIn,
  Trend,
  TrendBucket,
} from './environment.models';

/** Pages show coded errors themselves, so the generic toast is skipped. */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

function csv(values: readonly string[] | undefined): string | undefined {
  return values?.length ? values.join(',') : undefined;
}

/** Query parameters of `GET aspects` (csv status, unset values dropped). */
export function aspectListParams(query: AspectListQuery): QueryParams {
  return {
    q: query.q?.trim() || undefined,
    status: csv(query.status),
    significant: query.significant,
    impact_type: query.impact_type || undefined,
    condition: query.condition || undefined,
    lifecycle_stage: query.lifecycle_stage || undefined,
    owner: query.owner || undefined,
    department_id: query.department_id || undefined,
    site: query.site?.trim() || undefined,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  };
}

/** Query parameters of `GET emergency-plans`. */
export function planListParams(query: PlanListQuery): QueryParams {
  return {
    q: query.q?.trim() || undefined,
    status: csv(query.status),
    owner: query.owner || undefined,
    site: query.site?.trim() || undefined,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  };
}

/** Query parameters of `GET metrics`. */
export function metricListParams(query: MetricListQuery): QueryParams {
  return {
    q: query.q?.trim() || undefined,
    category: query.category || undefined,
    ghg_scope: query.ghg_scope || undefined,
    status: csv(query.status),
    owner: query.owner || undefined,
    site: query.site?.trim() || undefined,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  };
}

/** Environmental management API (M17): `v1/orgs/{org}/environment/...`. */
@Injectable({ providedIn: 'root' })
export class EnvironmentApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/environment`;
  }

  overview(orgId: string): Observable<EnvironmentOverview> {
    return this.api.get<EnvironmentOverview>(`${this.base(orgId)}/overview`, IN_PLACE);
  }

  // --- scoring ----------------------------------------------------------------------

  scoring(orgId: string): Observable<ScoringMethod> {
    return this.api.get<ScoringMethod>(`${this.base(orgId)}/scoring`, IN_PLACE);
  }

  updateScoring(orgId: string, body: ScoringMethodIn): Observable<ScoringMethod> {
    return this.api.put<ScoringMethod>(`${this.base(orgId)}/scoring`, body, IN_PLACE);
  }

  // --- aspects ----------------------------------------------------------------------

  listAspects(orgId: string, query: AspectListQuery = {}): Observable<Page<Aspect>> {
    return this.api.get<Page<Aspect>>(`${this.base(orgId)}/aspects`, {
      ...IN_PLACE,
      params: aspectListParams(query),
    });
  }

  getAspect(orgId: string, id: string): Observable<Aspect> {
    return this.api.get<Aspect>(`${this.base(orgId)}/aspects/${id}`, IN_PLACE);
  }

  createAspect(orgId: string, body: AspectCreate): Observable<Aspect> {
    return this.api.post<Aspect>(`${this.base(orgId)}/aspects`, body, IN_PLACE);
  }

  updateAspect(orgId: string, id: string, body: AspectUpdate): Observable<Aspect> {
    return this.api.patch<Aspect>(`${this.base(orgId)}/aspects/${id}`, body, IN_PLACE);
  }

  reviewAspect(orgId: string, id: string, body: ReviewIn): Observable<Aspect> {
    return this.api.post<Aspect>(`${this.base(orgId)}/aspects/${id}/review`, body, IN_PLACE);
  }

  deleteAspect(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/aspects/${id}`, IN_PLACE);
  }

  // --- emergency plans and drills ---------------------------------------------------

  listPlans(orgId: string, query: PlanListQuery = {}): Observable<Page<EmergencyPlan>> {
    return this.api.get<Page<EmergencyPlan>>(`${this.base(orgId)}/emergency-plans`, {
      ...IN_PLACE,
      params: planListParams(query),
    });
  }

  getPlan(orgId: string, id: string): Observable<EmergencyPlan> {
    return this.api.get<EmergencyPlan>(`${this.base(orgId)}/emergency-plans/${id}`, IN_PLACE);
  }

  createPlan(orgId: string, body: PlanCreate): Observable<EmergencyPlan> {
    return this.api.post<EmergencyPlan>(`${this.base(orgId)}/emergency-plans`, body, IN_PLACE);
  }

  updatePlan(orgId: string, id: string, body: PlanUpdate): Observable<EmergencyPlan> {
    return this.api.patch<EmergencyPlan>(
      `${this.base(orgId)}/emergency-plans/${id}`,
      body,
      IN_PLACE,
    );
  }

  reviewPlan(orgId: string, id: string, body: ReviewIn): Observable<EmergencyPlan> {
    return this.api.post<EmergencyPlan>(
      `${this.base(orgId)}/emergency-plans/${id}/review`,
      body,
      IN_PLACE,
    );
  }

  deletePlan(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/emergency-plans/${id}`, IN_PLACE);
  }

  listDrills(orgId: string, planId: string): Observable<Page<Drill>> {
    return this.api.get<Page<Drill>>(
      `${this.base(orgId)}/emergency-plans/${planId}/drills`,
      IN_PLACE,
    );
  }

  recordDrill(orgId: string, planId: string, body: DrillCreate): Observable<Drill> {
    return this.api.post<Drill>(
      `${this.base(orgId)}/emergency-plans/${planId}/drills`,
      body,
      IN_PLACE,
    );
  }

  deleteDrill(orgId: string, planId: string, drillId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.base(orgId)}/emergency-plans/${planId}/drills/${drillId}`,
      IN_PLACE,
    );
  }

  // --- metrics and measurements -----------------------------------------------------

  listMetrics(orgId: string, query: MetricListQuery = {}): Observable<Page<Metric>> {
    return this.api.get<Page<Metric>>(`${this.base(orgId)}/metrics`, {
      ...IN_PLACE,
      params: metricListParams(query),
    });
  }

  getMetric(orgId: string, id: string): Observable<Metric> {
    return this.api.get<Metric>(`${this.base(orgId)}/metrics/${id}`, IN_PLACE);
  }

  createMetric(orgId: string, body: MetricCreate): Observable<Metric> {
    return this.api.post<Metric>(`${this.base(orgId)}/metrics`, body, IN_PLACE);
  }

  updateMetric(orgId: string, id: string, body: MetricUpdate): Observable<Metric> {
    return this.api.patch<Metric>(`${this.base(orgId)}/metrics/${id}`, body, IN_PLACE);
  }

  deleteMetric(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/metrics/${id}`, IN_PLACE);
  }

  trend(
    orgId: string,
    metricId: string,
    bucket: TrendBucket,
    from?: string,
    to?: string,
  ): Observable<Trend> {
    return this.api.get<Trend>(`${this.base(orgId)}/metrics/${metricId}/trend`, {
      ...IN_PLACE,
      params: { bucket, from: from || undefined, to: to || undefined },
    });
  }

  listMeasurements(
    orgId: string,
    metricId: string,
    query: MeasurementQuery = {},
  ): Observable<Page<Measurement>> {
    return this.api.get<Page<Measurement>>(`${this.base(orgId)}/metrics/${metricId}/measurements`, {
      ...IN_PLACE,
      params: {
        from: query.from || undefined,
        to: query.to || undefined,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  recordMeasurement(
    orgId: string,
    metricId: string,
    body: MeasurementCreate,
  ): Observable<Measurement> {
    return this.api.post<Measurement>(
      `${this.base(orgId)}/metrics/${metricId}/measurements`,
      body,
      IN_PLACE,
    );
  }

  updateMeasurement(orgId: string, id: string, body: MeasurementUpdate): Observable<Measurement> {
    return this.api.patch<Measurement>(`${this.base(orgId)}/measurements/${id}`, body, IN_PLACE);
  }

  deleteMeasurement(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/measurements/${id}`, IN_PLACE);
  }

  emissions(orgId: string, year?: number): Observable<Emissions> {
    return this.api.get<Emissions>(`${this.base(orgId)}/emissions`, {
      ...IN_PLACE,
      params: { year },
    });
  }
}
