import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  AuditPack,
  AuditPackList,
  AuditPackListQuery,
  CalendarQuery,
  CalendarResponse,
  ComplianceResponse,
  CreateAuditPackRequest,
  CreateDefinitionRequest,
  DashboardConfig,
  DashboardConfigList,
  DashboardResponse,
  DefinitionList,
  DefinitionListQuery,
  ExportFormat,
  FrameworkKey,
  RegisterExportQuery,
  RegisterList,
  RegisterPreview,
  RegisterQuery,
  ReportDefinition,
  ReportFilters,
  ScheduleRequest,
  ScheduleResponse,
  UpdateDefinitionRequest,
  WidgetCatalog,
  WidgetConfig,
} from './reports.models';

/** Calls that show their own, code-specific message skip the generic error toast. */
const quiet = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

function csv(values: readonly string[] | undefined | null): string | undefined {
  return values && values.length ? values.join(',') : undefined;
}

/** Register filters as query params (empty values are left out). */
export function filterParams(filters: ReportFilters): Record<string, string | undefined> {
  return {
    q: filters.q?.trim() || undefined,
    status: csv(filters.status),
    from: filters.from || undefined,
    to: filters.to || undefined,
    standard_key: filters.standard_key || undefined,
  };
}

/**
 * Reports, dashboards, calendar and audit packs (M23), under
 * `v1/orgs/{org}/reports`. Goes through ApiService (base URL, bearer, errors).
 *
 * Permissions: `reports:read` for the dashboards, calendar, registers and saved
 * reports (plus each register's own read permission), `reports:write` to save
 * reports, `reports:manage` for role dashboards, `reports:audit_pack` for packs.
 */
@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${encodeURIComponent(orgId)}/reports`;
  }

  // --- compliance and calendar ------------------------------------------------------

  compliance(orgId: string, framework: FrameworkKey | null = null): Observable<ComplianceResponse> {
    return this.api.get<ComplianceResponse>(`${this.base(orgId)}/compliance`, {
      params: { framework: framework ?? undefined },
    });
  }

  calendar(orgId: string, query: CalendarQuery = {}): Observable<CalendarResponse> {
    return this.api.get<CalendarResponse>(`${this.base(orgId)}/calendar`, {
      params: this.calendarParams(query),
      ...quiet(),
    });
  }

  calendarIcs(orgId: string, query: CalendarQuery = {}): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/calendar.ics`, {
      params: {
        from: query.from || undefined,
        to: query.to || undefined,
        modules: csv(query.modules),
      },
    });
  }

  private calendarParams(query: CalendarQuery): QueryParams {
    return {
      from: query.from || undefined,
      to: query.to || undefined,
      modules: csv(query.modules),
      framework: query.framework ?? undefined,
      include_overdue: query.include_overdue ? true : undefined,
    };
  }

  // --- dashboards ---------------------------------------------------------------------

  widgets(orgId: string): Observable<WidgetCatalog> {
    return this.api.get<WidgetCatalog>(`${this.base(orgId)}/widgets`);
  }

  dashboard(orgId: string, framework: FrameworkKey | null = null): Observable<DashboardResponse> {
    return this.api.get<DashboardResponse>(`${this.base(orgId)}/dashboard`, {
      params: { framework: framework ?? undefined },
      ...quiet(),
    });
  }

  dashboards(orgId: string): Observable<DashboardConfigList> {
    return this.api.get<DashboardConfigList>(`${this.base(orgId)}/dashboards`);
  }

  saveDashboard(
    orgId: string,
    scope: string,
    widgets: readonly WidgetConfig[],
  ): Observable<DashboardConfig> {
    return this.api.put<DashboardConfig>(
      `${this.base(orgId)}/dashboards/${encodeURIComponent(scope)}`,
      {
        widgets: widgets.map((w) => ({ key: w.key, framework: w.framework ?? null, size: w.size })),
      },
      quiet(),
    );
  }

  resetDashboard(orgId: string, scope: string): Observable<void> {
    return this.api.delete<void>(
      `${this.base(orgId)}/dashboards/${encodeURIComponent(scope)}`,
      quiet(),
    );
  }

  // --- registers ----------------------------------------------------------------------

  registers(orgId: string): Observable<RegisterList> {
    return this.api.get<RegisterList>(`${this.base(orgId)}/registers`);
  }

  previewRegister(
    orgId: string,
    key: string,
    query: RegisterQuery = {},
  ): Observable<RegisterPreview> {
    return this.api.get<RegisterPreview>(
      `${this.base(orgId)}/registers/${encodeURIComponent(key)}`,
      {
        params: { ...filterParams(query), lang: query.lang, limit: query.limit },
        ...quiet(),
      },
    );
  }

  exportRegister(orgId: string, key: string, query: RegisterExportQuery): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/registers/${encodeURIComponent(key)}/export`, {
      params: {
        ...filterParams(query),
        format: query.format,
        columns: csv(query.columns),
        lang: query.lang,
      },
      ...quiet(),
    });
  }

  // --- saved reports ------------------------------------------------------------------

  listDefinitions(orgId: string, query: DefinitionListQuery = {}): Observable<DefinitionList> {
    return this.api.get<DefinitionList>(`${this.base(orgId)}/definitions`, {
      params: {
        q: query.q?.trim() || undefined,
        register_key: query.register_key || undefined,
        owner: query.owner || undefined,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  createDefinition(orgId: string, body: CreateDefinitionRequest): Observable<ReportDefinition> {
    return this.api.post<ReportDefinition>(`${this.base(orgId)}/definitions`, body, quiet());
  }

  getDefinition(orgId: string, id: string): Observable<ReportDefinition> {
    return this.api.get<ReportDefinition>(`${this.base(orgId)}/definitions/${id}`, quiet());
  }

  updateDefinition(
    orgId: string,
    id: string,
    body: UpdateDefinitionRequest,
  ): Observable<ReportDefinition> {
    return this.api.patch<ReportDefinition>(`${this.base(orgId)}/definitions/${id}`, body, quiet());
  }

  deleteDefinition(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/definitions/${id}`, quiet());
  }

  exportDefinition(orgId: string, id: string, format?: ExportFormat): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/definitions/${id}/export`, {
      params: { format },
      ...quiet(),
    });
  }

  scheduleDefinition(
    orgId: string,
    id: string,
    body: ScheduleRequest,
  ): Observable<ScheduleResponse> {
    return this.api.post<ScheduleResponse>(
      `${this.base(orgId)}/definitions/${id}/schedule`,
      body,
      quiet(),
    );
  }

  // --- audit packs ----------------------------------------------------------------------

  listAuditPacks(orgId: string, query: AuditPackListQuery = {}): Observable<AuditPackList> {
    return this.api.get<AuditPackList>(`${this.base(orgId)}/audit-packs`, {
      params: {
        standard_key: query.standard_key || undefined,
        framework: query.framework ?? undefined,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  createAuditPack(orgId: string, body: CreateAuditPackRequest): Observable<AuditPack> {
    return this.api.post<AuditPack>(`${this.base(orgId)}/audit-packs`, body, quiet());
  }

  getAuditPack(orgId: string, id: string): Observable<AuditPack> {
    return this.api.get<AuditPack>(`${this.base(orgId)}/audit-packs/${id}`, quiet());
  }

  downloadAuditPack(orgId: string, id: string): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/audit-packs/${id}/download`, quiet());
  }

  deleteAuditPack(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/audit-packs/${id}`, quiet());
  }
}
