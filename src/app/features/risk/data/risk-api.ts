import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  Heatmap,
  HeatmapQuery,
  ListResponse,
  Matrix,
  MatrixCreate,
  MatrixTemplate,
  MatrixUpdate,
  Opportunity,
  OpportunityCreate,
  OpportunityListQuery,
  OpportunityUpdate,
  Register,
  RegisterCreate,
  RegisterUpdate,
  Risk,
  RiskAcceptRequest,
  RiskCategory,
  RiskCreate,
  RiskListQuery,
  RiskOverview,
  RiskReviewRequest,
  RiskUpdate,
  SetupResult,
  Soa,
  SoaEntry,
  SoaEntryUpdate,
  SoaGenerateResult,
  SoaQuery,
  SoaStandard,
  Treatment,
  TreatmentCreate,
  TreatmentUpdate,
} from './risk.models';

/** Comma-joined list, or undefined when empty (so the param is omitted). */
function csv(values: readonly string[] | undefined): string | undefined {
  return values && values.length ? values.join(',') : undefined;
}

/** Mutations report their own coded errors, so the generic toast is skipped. */
const QUIET = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** Drop empty strings so blank filters never reach the API. */
function clean(params: Record<string, string | number | boolean | undefined | null>): QueryParams {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * The M04 risk API (`/api/v1/orgs/{org}/risk/...`, module `risk`). A disabled module
 * answers 404 `module_disabled`; lists return `{items, total}`.
 */
@Injectable({ providedIn: 'root' })
export class RiskApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/risk`;
  }

  // --- setup / dashboard ------------------------------------------------------------

  setup(orgId: string): Observable<SetupResult> {
    return this.api.post<SetupResult>(`${this.base(orgId)}/setup`, {}, QUIET);
  }

  overview(orgId: string): Observable<RiskOverview> {
    return this.api.get<RiskOverview>(`${this.base(orgId)}/overview`);
  }

  heatmap(orgId: string, query: HeatmapQuery = {}): Observable<Heatmap> {
    return this.api.get<Heatmap>(`${this.base(orgId)}/heatmap`, {
      params: clean({ ...query }),
      context: QUIET.context,
    });
  }

  // --- matrices ---------------------------------------------------------------------

  matrixTemplates(orgId: string): Observable<{ readonly items: readonly MatrixTemplate[] }> {
    return this.api.get(`${this.base(orgId)}/matrix-templates`);
  }

  listMatrices(orgId: string): Observable<ListResponse<Matrix>> {
    return this.api.get<ListResponse<Matrix>>(`${this.base(orgId)}/matrices`);
  }

  getMatrix(orgId: string, id: string): Observable<Matrix> {
    return this.api.get<Matrix>(`${this.base(orgId)}/matrices/${id}`);
  }

  createMatrix(orgId: string, body: MatrixCreate): Observable<Matrix> {
    return this.api.post<Matrix>(`${this.base(orgId)}/matrices`, body, QUIET);
  }

  updateMatrix(orgId: string, id: string, body: MatrixUpdate): Observable<Matrix> {
    return this.api.patch<Matrix>(`${this.base(orgId)}/matrices/${id}`, body, QUIET);
  }

  deleteMatrix(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/matrices/${id}`, QUIET);
  }

  // --- registers --------------------------------------------------------------------

  listRegisters(orgId: string, category?: RiskCategory): Observable<ListResponse<Register>> {
    return this.api.get<ListResponse<Register>>(`${this.base(orgId)}/registers`, {
      params: clean({ category }),
    });
  }

  getRegister(orgId: string, id: string): Observable<Register> {
    return this.api.get<Register>(`${this.base(orgId)}/registers/${id}`);
  }

  createRegister(orgId: string, body: RegisterCreate): Observable<Register> {
    return this.api.post<Register>(`${this.base(orgId)}/registers`, body, QUIET);
  }

  updateRegister(orgId: string, id: string, body: RegisterUpdate): Observable<Register> {
    return this.api.patch<Register>(`${this.base(orgId)}/registers/${id}`, body, QUIET);
  }

  deleteRegister(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/registers/${id}`, QUIET);
  }

  // --- risks ------------------------------------------------------------------------

  listRisks(orgId: string, query: RiskListQuery = {}): Observable<ListResponse<Risk>> {
    return this.api.get<ListResponse<Risk>>(`${this.base(orgId)}/risks`, {
      params: clean({
        q: query.q?.trim(),
        status: csv(query.status),
        register_id: query.register_id,
        category: query.category,
        owner: query.owner,
        level: csv(query.level),
        source_type: query.source_type,
        review_due: query.review_due,
        include_closed: query.include_closed,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      }),
    });
  }

  getRisk(orgId: string, id: string): Observable<Risk> {
    return this.api.get<Risk>(`${this.base(orgId)}/risks/${id}`);
  }

  createRisk(orgId: string, body: RiskCreate): Observable<Risk> {
    return this.api.post<Risk>(`${this.base(orgId)}/risks`, body, QUIET);
  }

  updateRisk(orgId: string, id: string, body: RiskUpdate): Observable<Risk> {
    return this.api.patch<Risk>(`${this.base(orgId)}/risks/${id}`, body, QUIET);
  }

  deleteRisk(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/risks/${id}`, QUIET);
  }

  acceptRisk(orgId: string, id: string, body: RiskAcceptRequest): Observable<Risk> {
    return this.api.post<Risk>(`${this.base(orgId)}/risks/${id}/accept`, body, QUIET);
  }

  revokeAcceptance(orgId: string, id: string, reason?: string | null): Observable<Risk> {
    return this.api.post<Risk>(
      `${this.base(orgId)}/risks/${id}/revoke-acceptance`,
      {
        reason: reason || null,
      },
      QUIET,
    );
  }

  reviewRisk(orgId: string, id: string, body: RiskReviewRequest): Observable<Risk> {
    return this.api.post<Risk>(`${this.base(orgId)}/risks/${id}/review`, body, QUIET);
  }

  // --- treatments -------------------------------------------------------------------

  listTreatments(orgId: string, riskId: string): Observable<ListResponse<Treatment>> {
    return this.api.get<ListResponse<Treatment>>(`${this.base(orgId)}/risks/${riskId}/treatments`);
  }

  createTreatment(orgId: string, riskId: string, body: TreatmentCreate): Observable<Treatment> {
    return this.api.post<Treatment>(`${this.base(orgId)}/risks/${riskId}/treatments`, body, QUIET);
  }

  getTreatment(orgId: string, id: string): Observable<Treatment> {
    return this.api.get<Treatment>(`${this.base(orgId)}/treatments/${id}`);
  }

  updateTreatment(orgId: string, id: string, body: TreatmentUpdate): Observable<Treatment> {
    return this.api.patch<Treatment>(`${this.base(orgId)}/treatments/${id}`, body, QUIET);
  }

  deleteTreatment(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/treatments/${id}`, QUIET);
  }

  // --- opportunities ----------------------------------------------------------------

  listOpportunities(
    orgId: string,
    query: OpportunityListQuery = {},
  ): Observable<ListResponse<Opportunity>> {
    return this.api.get<ListResponse<Opportunity>>(`${this.base(orgId)}/opportunities`, {
      params: clean({
        q: query.q?.trim(),
        status: csv(query.status),
        register_id: query.register_id,
        owner: query.owner,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      }),
    });
  }

  getOpportunity(orgId: string, id: string): Observable<Opportunity> {
    return this.api.get<Opportunity>(`${this.base(orgId)}/opportunities/${id}`);
  }

  createOpportunity(orgId: string, body: OpportunityCreate): Observable<Opportunity> {
    return this.api.post<Opportunity>(`${this.base(orgId)}/opportunities`, body, QUIET);
  }

  updateOpportunity(orgId: string, id: string, body: OpportunityUpdate): Observable<Opportunity> {
    return this.api.patch<Opportunity>(`${this.base(orgId)}/opportunities/${id}`, body, QUIET);
  }

  deleteOpportunity(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/opportunities/${id}`, QUIET);
  }

  // --- Statement of Applicability ---------------------------------------------------

  listSoaStandards(orgId: string): Observable<readonly SoaStandard[]> {
    return this.api.get<readonly SoaStandard[]>(`${this.base(orgId)}/soa`);
  }

  generateSoa(orgId: string, standardKey: string): Observable<SoaGenerateResult> {
    return this.api.post<SoaGenerateResult>(
      `${this.base(orgId)}/soa/generate`,
      {
        standard_key: standardKey,
      },
      QUIET,
    );
  }

  getSoa(orgId: string, standardKey: string, query: SoaQuery = {}): Observable<Soa> {
    return this.api.get<Soa>(`${this.base(orgId)}/soa/${encodeURIComponent(standardKey)}`, {
      params: clean({ ...query, q: query.q?.trim() }),
    });
  }

  exportSoa(orgId: string, standardKey: string): Observable<Blob> {
    return this.api.getBlob(
      `${this.base(orgId)}/soa/${encodeURIComponent(standardKey)}/export.csv`,
    );
  }

  getSoaEntry(orgId: string, id: string): Observable<SoaEntry> {
    return this.api.get<SoaEntry>(`${this.base(orgId)}/soa/entries/${id}`);
  }

  updateSoaEntry(orgId: string, id: string, body: SoaEntryUpdate): Observable<SoaEntry> {
    return this.api.patch<SoaEntry>(`${this.base(orgId)}/soa/entries/${id}`, body, QUIET);
  }
}
