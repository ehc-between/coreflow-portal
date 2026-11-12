import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams, RequestOptions } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  AiGovernanceCatalog,
  AiGovernanceOverview,
  AiGovernanceSettings,
  AiGovernanceSettingsUpdate,
  AiIncident,
  AiSystem,
  AiSystemListQuery,
  AiSystemSummary,
  AiSystemUpdate,
  AiSystemWrite,
  Assessment,
  AssessmentCompleteRequest,
  AssessmentCreate,
  AssessmentListQuery,
  AssessmentSummary,
  AssessmentUpdate,
  ClassificationPreviewRequest,
  ClassificationResult,
  LiteracyCoverage,
  LiteracyCreate,
  LiteracyQuery,
  LiteracyRecord,
  MonitoringCreate,
  MonitoringEntry,
  Obligation,
  Page,
  RegisterFeaturesResult,
  ReviewScheduleRequest,
  ReviewScheduleResult,
  TechnicalDocumentation,
} from './ai-governance.models';

/** Mutations skip the generic toast: pages show a translated, coded message instead. */
const quiet = (): RequestOptions => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/**
 * The `ai_governance` module API (`v1/orgs/{org}/ai-governance/...`): AI system
 * inventory, classification wizard, assessments (impact / FRIA), documentation,
 * monitoring, incidents, AI literacy and settings. Goes through ApiService.
 */
@Injectable({ providedIn: 'root' })
export class AiGovernanceApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${encodeURIComponent(orgId)}/ai-governance`;
  }

  // --- overview, catalogue, settings ---------------------------------------------------

  overview(orgId: string): Observable<AiGovernanceOverview> {
    return this.api.get<AiGovernanceOverview>(`${this.base(orgId)}/overview`);
  }

  catalog(orgId: string): Observable<AiGovernanceCatalog> {
    return this.api.get<AiGovernanceCatalog>(`${this.base(orgId)}/catalog`);
  }

  settings(orgId: string): Observable<AiGovernanceSettings> {
    return this.api.get<AiGovernanceSettings>(`${this.base(orgId)}/settings`);
  }

  updateSettings(
    orgId: string,
    body: AiGovernanceSettingsUpdate,
  ): Observable<AiGovernanceSettings> {
    return this.api.put<AiGovernanceSettings>(`${this.base(orgId)}/settings`, body, quiet());
  }

  // --- systems ---------------------------------------------------------------------------

  listSystems(orgId: string, query: AiSystemListQuery = {}): Observable<Page<AiSystemSummary>> {
    return this.api.get<Page<AiSystemSummary>>(`${this.base(orgId)}/systems`, {
      params: clean(query),
    });
  }

  getSystem(orgId: string, id: string): Observable<AiSystem> {
    return this.api.get<AiSystem>(`${this.base(orgId)}/systems/${id}`);
  }

  createSystem(orgId: string, body: AiSystemWrite): Observable<AiSystem> {
    return this.api.post<AiSystem>(`${this.base(orgId)}/systems`, body, quiet());
  }

  updateSystem(orgId: string, id: string, body: AiSystemUpdate): Observable<AiSystem> {
    return this.api.patch<AiSystem>(`${this.base(orgId)}/systems/${id}`, body, quiet());
  }

  deleteSystem(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/systems/${id}`, quiet());
  }

  registerPlatformFeatures(orgId: string, lang?: string): Observable<RegisterFeaturesResult> {
    return this.api.post<RegisterFeaturesResult>(
      `${this.base(orgId)}/systems/register-platform-features`,
      lang ? { lang } : {},
      quiet(),
    );
  }

  updateDocumentation(
    orgId: string,
    id: string,
    sections: Readonly<Record<string, string | null>>,
    changeReason?: string | null,
  ): Observable<AiSystem> {
    return this.api.put<AiSystem>(
      `${this.base(orgId)}/systems/${id}/documentation`,
      changeReason ? { sections, change_reason: changeReason } : { sections },
      quiet(),
    );
  }

  technicalDocumentation(orgId: string, id: string): Observable<TechnicalDocumentation> {
    return this.api.get<TechnicalDocumentation>(
      `${this.base(orgId)}/systems/${id}/technical-documentation`,
    );
  }

  obligations(orgId: string, id: string): Observable<Obligation[]> {
    return this.api.get<Obligation[]>(`${this.base(orgId)}/systems/${id}/obligations`);
  }

  scheduleReview(
    orgId: string,
    id: string,
    body: ReviewScheduleRequest,
  ): Observable<ReviewScheduleResult> {
    return this.api.post<ReviewScheduleResult>(
      `${this.base(orgId)}/systems/${id}/review-schedule`,
      body,
      quiet(),
    );
  }

  listIncidents(orgId: string, id: string): Observable<{ items: AiIncident[] }> {
    return this.api.get<{ items: AiIncident[] }>(`${this.base(orgId)}/systems/${id}/incidents`);
  }

  linkIncident(orgId: string, id: string, deviationId: string): Observable<AiIncident> {
    return this.api.post<AiIncident>(
      `${this.base(orgId)}/systems/${id}/incidents`,
      { deviation_id: deviationId },
      quiet(),
    );
  }

  listMonitoring(
    orgId: string,
    id: string,
    paging: { limit?: number; offset?: number } = {},
  ): Observable<Page<MonitoringEntry>> {
    return this.api.get<Page<MonitoringEntry>>(`${this.base(orgId)}/systems/${id}/monitoring`, {
      params: clean(paging),
    });
  }

  addMonitoring(orgId: string, id: string, body: MonitoringCreate): Observable<MonitoringEntry> {
    return this.api.post<MonitoringEntry>(
      `${this.base(orgId)}/systems/${id}/monitoring`,
      body,
      quiet(),
    );
  }

  deleteMonitoring(orgId: string, id: string, entryId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.base(orgId)}/systems/${id}/monitoring/${entryId}`,
      quiet(),
    );
  }

  // --- classification and assessments ------------------------------------------------------

  previewClassification(
    orgId: string,
    body: ClassificationPreviewRequest,
  ): Observable<ClassificationResult> {
    return this.api.post<ClassificationResult>(
      `${this.base(orgId)}/classification/preview`,
      body,
      quiet(),
    );
  }

  listAssessments(
    orgId: string,
    query: AssessmentListQuery = {},
  ): Observable<Page<AssessmentSummary>> {
    return this.api.get<Page<AssessmentSummary>>(`${this.base(orgId)}/assessments`, {
      params: clean(query),
    });
  }

  getAssessment(orgId: string, id: string): Observable<Assessment> {
    return this.api.get<Assessment>(`${this.base(orgId)}/assessments/${id}`);
  }

  createAssessment(orgId: string, body: AssessmentCreate): Observable<Assessment> {
    return this.api.post<Assessment>(`${this.base(orgId)}/assessments`, body, quiet());
  }

  updateAssessment(orgId: string, id: string, body: AssessmentUpdate): Observable<Assessment> {
    return this.api.patch<Assessment>(`${this.base(orgId)}/assessments/${id}`, body, quiet());
  }

  completeAssessment(
    orgId: string,
    id: string,
    body: AssessmentCompleteRequest,
  ): Observable<Assessment> {
    return this.api.post<Assessment>(
      `${this.base(orgId)}/assessments/${id}/complete`,
      body,
      quiet(),
    );
  }

  approveAssessment(orgId: string, id: string): Observable<Assessment> {
    return this.api.post<Assessment>(`${this.base(orgId)}/assessments/${id}/approve`, {}, quiet());
  }

  reopenAssessment(orgId: string, id: string): Observable<Assessment> {
    return this.api.post<Assessment>(`${this.base(orgId)}/assessments/${id}/reopen`, {}, quiet());
  }

  deleteAssessment(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/assessments/${id}`, quiet());
  }

  // --- AI literacy ------------------------------------------------------------------------

  listLiteracy(orgId: string, query: LiteracyQuery = {}): Observable<Page<LiteracyRecord>> {
    return this.api.get<Page<LiteracyRecord>>(`${this.base(orgId)}/literacy`, {
      params: clean(query),
    });
  }

  literacyCoverage(orgId: string): Observable<LiteracyCoverage> {
    return this.api.get<LiteracyCoverage>(`${this.base(orgId)}/literacy/coverage`);
  }

  addLiteracy(orgId: string, body: LiteracyCreate): Observable<LiteracyRecord> {
    return this.api.post<LiteracyRecord>(`${this.base(orgId)}/literacy`, body, quiet());
  }

  deleteLiteracy(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/literacy/${id}`, quiet());
  }
}

/** Drop empty strings / null / undefined so they are not sent as query params. */
function clean(query: object): QueryParams {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    out[key] = value as string | number;
  }
  return out;
}
