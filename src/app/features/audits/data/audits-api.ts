import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { Task } from '../../../core/tasks/task.models';
import {
  AuditReport,
  AuditorAssignInput,
  AuditorCheck,
  AuditorProfile,
  AuditorProfileInput,
  AuditorRole,
  AuditsOverview,
  Certification,
  CertificationDetail,
  CertificationInput,
  CertificationQuery,
  Checklist,
  ChecklistItemInput,
  ChecklistItemUpdate,
  FindingAction,
  FindingActionInput,
  FindingDetail,
  FindingInput,
  FindingQuery,
  FindingResponseInput,
  Finding,
  ListResponse,
  Plan,
  PlanAction,
  PlanAuditor,
  PlanDetail,
  PlanInput,
  PlanQuery,
  PlanReportInput,
  Programme,
  ProgrammeAction,
  ProgrammeDetail,
  ProgrammeInput,
  ProgrammeQuery,
} from './audit.models';

/** Mutations skip the generic toast: callers show a translated, code-specific message. */
const quiet = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/**
 * Client for the M06 audit API (`v1/orgs/{org}/audits/...`). Goes through
 * ApiService (base URL, bearer + refresh, error handling). The router is gated by
 * module enablement (404 `module_disabled`) and `audits:read|write|manage|approve`.
 */
@Injectable({ providedIn: 'root' })
export class AuditsApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/audits`;
  }

  overview(orgId: string): Observable<AuditsOverview> {
    return this.api.get<AuditsOverview>(`${this.base(orgId)}/overview`);
  }

  // --- programmes ----------------------------------------------------------------

  listProgrammes(orgId: string, query: ProgrammeQuery = {}): Observable<ListResponse<Programme>> {
    return this.api.get<ListResponse<Programme>>(`${this.base(orgId)}/programmes`, {
      params: { ...query },
    });
  }

  getProgramme(orgId: string, id: string): Observable<ProgrammeDetail> {
    return this.api.get<ProgrammeDetail>(`${this.base(orgId)}/programmes/${id}`);
  }

  createProgramme(orgId: string, body: ProgrammeInput): Observable<ProgrammeDetail> {
    return this.api.post<ProgrammeDetail>(`${this.base(orgId)}/programmes`, body, quiet());
  }

  updateProgramme(
    orgId: string,
    id: string,
    body: Partial<ProgrammeInput>,
  ): Observable<ProgrammeDetail> {
    return this.api.patch<ProgrammeDetail>(`${this.base(orgId)}/programmes/${id}`, body, quiet());
  }

  transitionProgramme(
    orgId: string,
    id: string,
    action: ProgrammeAction,
    reason?: string | null,
  ): Observable<ProgrammeDetail> {
    return this.api.post<ProgrammeDetail>(
      `${this.base(orgId)}/programmes/${id}/transition`,
      { action, reason: reason || null },
      quiet(),
    );
  }

  deleteProgramme(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/programmes/${id}`, quiet());
  }

  // --- plans ---------------------------------------------------------------------

  listPlans(orgId: string, query: PlanQuery = {}): Observable<ListResponse<Plan>> {
    return this.api.get<ListResponse<Plan>>(`${this.base(orgId)}/plans`, {
      params: { ...query },
    });
  }

  getPlan(orgId: string, id: string): Observable<PlanDetail> {
    return this.api.get<PlanDetail>(`${this.base(orgId)}/plans/${id}`);
  }

  createPlan(orgId: string, body: PlanInput): Observable<PlanDetail> {
    return this.api.post<PlanDetail>(`${this.base(orgId)}/plans`, body, quiet());
  }

  updatePlan(
    orgId: string,
    id: string,
    body: Partial<PlanInput> & PlanReportInput,
  ): Observable<PlanDetail> {
    return this.api.patch<PlanDetail>(`${this.base(orgId)}/plans/${id}`, body, quiet());
  }

  transitionPlan(
    orgId: string,
    id: string,
    action: PlanAction,
    reason?: string | null,
  ): Observable<PlanDetail> {
    return this.api.post<PlanDetail>(
      `${this.base(orgId)}/plans/${id}/transition`,
      { action, reason: reason || null },
      quiet(),
    );
  }

  deletePlan(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/plans/${id}`, quiet());
  }

  report(orgId: string, id: string): Observable<AuditReport> {
    return this.api.get<AuditReport>(`${this.base(orgId)}/plans/${id}/report`);
  }

  // --- audit team ----------------------------------------------------------------

  listAuditors(orgId: string, planId: string): Observable<{ items: readonly PlanAuditor[] }> {
    return this.api.get<{ items: readonly PlanAuditor[] }>(
      `${this.base(orgId)}/plans/${planId}/auditors`,
    );
  }

  checkAuditor(
    orgId: string,
    planId: string,
    userId: string,
    role: AuditorRole,
  ): Observable<AuditorCheck> {
    return this.api.get<AuditorCheck>(`${this.base(orgId)}/plans/${planId}/auditor-check`, {
      params: { user_id: userId, role },
      ...quiet(),
    });
  }

  assignAuditor(orgId: string, planId: string, body: AuditorAssignInput): Observable<PlanAuditor> {
    return this.api.post<PlanAuditor>(
      `${this.base(orgId)}/plans/${planId}/auditors`,
      body,
      quiet(),
    );
  }

  removeAuditor(orgId: string, planId: string, auditorId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.base(orgId)}/plans/${planId}/auditors/${auditorId}`,
      quiet(),
    );
  }

  // --- checklist -----------------------------------------------------------------

  checklist(orgId: string, planId: string): Observable<Checklist> {
    return this.api.get<Checklist>(`${this.base(orgId)}/plans/${planId}/checklist`);
  }

  addChecklistItem(orgId: string, planId: string, body: ChecklistItemInput): Observable<unknown> {
    return this.api.post(`${this.base(orgId)}/plans/${planId}/checklist`, body, quiet());
  }

  addChecklistItems(
    orgId: string,
    planId: string,
    items: readonly ChecklistItemInput[],
    source: 'manual' | 'ai',
  ): Observable<unknown> {
    return this.api.post(
      `${this.base(orgId)}/plans/${planId}/checklist/bulk`,
      { items, source },
      quiet(),
    );
  }

  generateChecklist(
    orgId: string,
    planId: string,
    body: { clause_refs?: readonly string[]; lang: 'en' | 'nb'; replace?: boolean },
  ): Observable<unknown> {
    return this.api.post(`${this.base(orgId)}/plans/${planId}/checklist/generate`, body, quiet());
  }

  updateChecklistItem(
    orgId: string,
    planId: string,
    itemId: string,
    body: ChecklistItemUpdate,
  ): Observable<unknown> {
    return this.api.patch(`${this.base(orgId)}/plans/${planId}/checklist/${itemId}`, body, quiet());
  }

  deleteChecklistItem(orgId: string, planId: string, itemId: string): Observable<unknown> {
    return this.api.delete(`${this.base(orgId)}/plans/${planId}/checklist/${itemId}`, quiet());
  }

  // --- findings ------------------------------------------------------------------

  listFindings(orgId: string, query: FindingQuery = {}): Observable<ListResponse<Finding>> {
    const { overdue, ...rest } = query;
    return this.api.get<ListResponse<Finding>>(`${this.base(orgId)}/findings`, {
      params: { ...rest, overdue: overdue ? true : undefined },
    });
  }

  getFinding(orgId: string, id: string): Observable<FindingDetail> {
    return this.api.get<FindingDetail>(`${this.base(orgId)}/findings/${id}`);
  }

  createFinding(orgId: string, planId: string, body: FindingInput): Observable<FindingDetail> {
    return this.api.post<FindingDetail>(
      `${this.base(orgId)}/plans/${planId}/findings`,
      body,
      quiet(),
    );
  }

  updateFinding(
    orgId: string,
    id: string,
    body: Partial<FindingInput> & FindingResponseInput,
  ): Observable<FindingDetail> {
    return this.api.patch<FindingDetail>(`${this.base(orgId)}/findings/${id}`, body, quiet());
  }

  transitionFinding(
    orgId: string,
    id: string,
    action: FindingAction,
    reason?: string | null,
  ): Observable<FindingDetail> {
    return this.api.post<FindingDetail>(
      `${this.base(orgId)}/findings/${id}/transition`,
      { action, reason: reason || null },
      quiet(),
    );
  }

  deleteFinding(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/findings/${id}`, quiet());
  }

  findingActions(orgId: string, id: string): Observable<{ items: readonly Task[] }> {
    return this.api.get<{ items: readonly Task[] }>(`${this.base(orgId)}/findings/${id}/actions`);
  }

  createFindingAction(
    orgId: string,
    id: string,
    body: FindingActionInput,
  ): Observable<FindingDetail> {
    return this.api.post<FindingDetail>(
      `${this.base(orgId)}/findings/${id}/actions`,
      body,
      quiet(),
    );
  }

  linkDeviation(orgId: string, id: string, deviationId: string): Observable<FindingDetail> {
    return this.api.post<FindingDetail>(
      `${this.base(orgId)}/findings/${id}/deviations`,
      { deviation_id: deviationId },
      quiet(),
    );
  }

  // --- auditor register ----------------------------------------------------------

  listProfiles(
    orgId: string,
    query: { framework?: string; active?: boolean; limit?: number; offset?: number } = {},
  ): Observable<ListResponse<AuditorProfile>> {
    return this.api.get<ListResponse<AuditorProfile>>(`${this.base(orgId)}/auditors`, {
      params: { ...query },
    });
  }

  createProfile(orgId: string, body: AuditorProfileInput): Observable<AuditorProfile> {
    return this.api.post<AuditorProfile>(`${this.base(orgId)}/auditors`, body, quiet());
  }

  updateProfile(
    orgId: string,
    id: string,
    body: Partial<AuditorProfileInput>,
  ): Observable<AuditorProfile> {
    return this.api.patch<AuditorProfile>(`${this.base(orgId)}/auditors/${id}`, body, quiet());
  }

  deleteProfile(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/auditors/${id}`, quiet());
  }

  // --- certifications ------------------------------------------------------------

  listCertifications(
    orgId: string,
    query: CertificationQuery = {},
  ): Observable<ListResponse<Certification>> {
    return this.api.get<ListResponse<Certification>>(`${this.base(orgId)}/certifications`, {
      params: { ...query },
    });
  }

  getCertification(orgId: string, id: string): Observable<CertificationDetail> {
    return this.api.get<CertificationDetail>(`${this.base(orgId)}/certifications/${id}`);
  }

  createCertification(orgId: string, body: CertificationInput): Observable<CertificationDetail> {
    return this.api.post<CertificationDetail>(`${this.base(orgId)}/certifications`, body, quiet());
  }

  updateCertification(
    orgId: string,
    id: string,
    body: Partial<CertificationInput>,
  ): Observable<CertificationDetail> {
    return this.api.patch<CertificationDetail>(
      `${this.base(orgId)}/certifications/${id}`,
      body,
      quiet(),
    );
  }

  deleteCertification(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/certifications/${id}`, quiet());
  }
}
