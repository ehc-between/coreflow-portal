import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  Application,
  ApplicationCreate,
  ApplicationDetail,
  ApplicationQuery,
  ApplicationUpdate,
  Candidate,
  CandidateCreate,
  CandidateDetail,
  CandidateQuery,
  CandidateUpdate,
  Check,
  CheckCreate,
  CheckUpdate,
  Interview,
  InterviewCreate,
  InterviewUpdate,
  ListResponse,
  MoveRequest,
  OfferRequest,
  OfferResponse,
  Pipeline,
  PrivacyUpdate,
  RecruitmentSettings,
  RecruitmentSettingsInput,
  Requisition,
  RequisitionCreate,
  RequisitionDetail,
  RequisitionQuery,
  RequisitionUpdate,
  Scorecard,
  ScorecardInput,
  TeamRole,
} from './recruitment.models';

/** Mutations skip the generic toast: pages show a translated, code-specific message. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/** `['a', 'b']` -> `'a,b'` (the backend takes comma-separated filters); empty -> undefined. */
function csv(values: readonly string[] | undefined): string | undefined {
  return values && values.length > 0 ? values.join(',') : undefined;
}

/**
 * Recruitment (M10) API: requisitions, candidates, applications and their
 * interviews, scorecards and background checks, plus GDPR settings. Paths are
 * `v1/orgs/{org}/recruitment/...`; requests go through ApiService (base URL,
 * bearer, error handling). Candidate data is visible only to the requisition's
 * hiring team, the record's creator and `recruitment:manage` holders; others get 404.
 */
@Injectable({ providedIn: 'root' })
export class RecruitmentApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/recruitment`;
  }

  // --- settings ------------------------------------------------------------------------

  getSettings(orgId: string): Observable<RecruitmentSettings> {
    return this.api.get<RecruitmentSettings>(`${this.base(orgId)}/settings`);
  }

  updateSettings(orgId: string, body: RecruitmentSettingsInput): Observable<RecruitmentSettings> {
    return this.api.put<RecruitmentSettings>(`${this.base(orgId)}/settings`, body, skipToast());
  }

  purgeExpired(orgId: string): Observable<{ erased: number }> {
    return this.api.post<{ erased: number }>(`${this.base(orgId)}/purge-expired`, {}, skipToast());
  }

  // --- requisitions --------------------------------------------------------------------

  listRequisitions(
    orgId: string,
    query: RequisitionQuery = {},
  ): Observable<ListResponse<Requisition>> {
    const params: QueryParams = {
      q: query.q || undefined,
      status: csv(query.status),
      department_id: query.department_id || undefined,
      owner: query.owner,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
    };
    return this.api.get<ListResponse<Requisition>>(`${this.base(orgId)}/requisitions`, { params });
  }

  createRequisition(orgId: string, body: RequisitionCreate): Observable<RequisitionDetail> {
    return this.api.post<RequisitionDetail>(`${this.base(orgId)}/requisitions`, body, skipToast());
  }

  getRequisition(orgId: string, id: string): Observable<RequisitionDetail> {
    return this.api.get<RequisitionDetail>(`${this.base(orgId)}/requisitions/${id}`, skipToast());
  }

  updateRequisition(
    orgId: string,
    id: string,
    body: RequisitionUpdate,
  ): Observable<RequisitionDetail> {
    return this.api.patch<RequisitionDetail>(
      `${this.base(orgId)}/requisitions/${id}`,
      body,
      skipToast(),
    );
  }

  deleteRequisition(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/requisitions/${id}`, skipToast());
  }

  /** `submit`, `open` and `hold` take no body; `approve`/`reject` a note; `close` an outcome. */
  transitionRequisition(
    orgId: string,
    id: string,
    action: 'submit' | 'approve' | 'reject' | 'open' | 'hold',
    note?: string | null,
  ): Observable<RequisitionDetail> {
    const body = action === 'approve' || action === 'reject' ? { note: note ?? null } : {};
    return this.api.post<RequisitionDetail>(
      `${this.base(orgId)}/requisitions/${id}/${action}`,
      body,
      skipToast(),
    );
  }

  closeRequisition(
    orgId: string,
    id: string,
    outcome: 'filled' | 'cancelled',
    note?: string | null,
  ): Observable<RequisitionDetail> {
    return this.api.post<RequisitionDetail>(
      `${this.base(orgId)}/requisitions/${id}/close`,
      { outcome, note: note ?? null },
      skipToast(),
    );
  }

  setTeam(
    orgId: string,
    id: string,
    members: readonly { readonly user_id: string; readonly team_role: TeamRole }[],
  ): Observable<RequisitionDetail> {
    return this.api.put<RequisitionDetail>(
      `${this.base(orgId)}/requisitions/${id}/team`,
      { members },
      skipToast(),
    );
  }

  getPipeline(orgId: string, id: string): Observable<Pipeline> {
    return this.api.get<Pipeline>(`${this.base(orgId)}/requisitions/${id}/pipeline`);
  }

  // --- candidates ----------------------------------------------------------------------

  listCandidates(orgId: string, query: CandidateQuery = {}): Observable<ListResponse<Candidate>> {
    const params: QueryParams = {
      q: query.q || undefined,
      talent_pool: query.talent_pool,
      retention_before: query.retention_before || undefined,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
    };
    return this.api.get<ListResponse<Candidate>>(`${this.base(orgId)}/candidates`, { params });
  }

  createCandidate(orgId: string, body: CandidateCreate): Observable<CandidateDetail> {
    return this.api.post<CandidateDetail>(`${this.base(orgId)}/candidates`, body, skipToast());
  }

  getCandidate(orgId: string, id: string): Observable<CandidateDetail> {
    return this.api.get<CandidateDetail>(`${this.base(orgId)}/candidates/${id}`, skipToast());
  }

  updateCandidate(orgId: string, id: string, body: CandidateUpdate): Observable<CandidateDetail> {
    return this.api.patch<CandidateDetail>(
      `${this.base(orgId)}/candidates/${id}`,
      body,
      skipToast(),
    );
  }

  setPrivacy(orgId: string, id: string, body: PrivacyUpdate): Observable<CandidateDetail> {
    return this.api.post<CandidateDetail>(
      `${this.base(orgId)}/candidates/${id}/privacy`,
      body,
      skipToast(),
    );
  }

  /** GDPR Art. 17 erasure (anonymises the candidate and strips free text). */
  eraseCandidate(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/candidates/${id}`, skipToast());
  }

  // --- applications --------------------------------------------------------------------

  listApplications(
    orgId: string,
    query: ApplicationQuery = {},
  ): Observable<ListResponse<Application>> {
    const params: QueryParams = {
      requisition_id: query.requisition_id || undefined,
      candidate_id: query.candidate_id || undefined,
      stage: csv(query.stage),
      q: query.q || undefined,
      limit: query.limit,
      offset: query.offset,
    };
    return this.api.get<ListResponse<Application>>(`${this.base(orgId)}/applications`, {
      params,
    });
  }

  createApplication(orgId: string, body: ApplicationCreate): Observable<ApplicationDetail> {
    return this.api.post<ApplicationDetail>(`${this.base(orgId)}/applications`, body, skipToast());
  }

  getApplication(orgId: string, id: string): Observable<ApplicationDetail> {
    return this.api.get<ApplicationDetail>(`${this.base(orgId)}/applications/${id}`, skipToast());
  }

  updateApplication(
    orgId: string,
    id: string,
    body: ApplicationUpdate,
  ): Observable<ApplicationDetail> {
    return this.api.patch<ApplicationDetail>(
      `${this.base(orgId)}/applications/${id}`,
      body,
      skipToast(),
    );
  }

  deleteApplication(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/applications/${id}`, skipToast());
  }

  move(orgId: string, id: string, body: MoveRequest): Observable<ApplicationDetail> {
    return this.api.post<ApplicationDetail>(
      `${this.base(orgId)}/applications/${id}/move`,
      body,
      skipToast(),
    );
  }

  planChecks(orgId: string, id: string): Observable<ApplicationDetail> {
    return this.api.post<ApplicationDetail>(
      `${this.base(orgId)}/applications/${id}/checks/plan`,
      {},
      skipToast(),
    );
  }

  extendOffer(orgId: string, id: string, body: OfferRequest): Observable<ApplicationDetail> {
    return this.api.post<ApplicationDetail>(
      `${this.base(orgId)}/applications/${id}/offer`,
      body,
      skipToast(),
    );
  }

  respondOffer(orgId: string, id: string, body: OfferResponse): Observable<ApplicationDetail> {
    return this.api.post<ApplicationDetail>(
      `${this.base(orgId)}/applications/${id}/offer/respond`,
      body,
      skipToast(),
    );
  }

  hire(orgId: string, id: string): Observable<ApplicationDetail> {
    return this.api.post<ApplicationDetail>(
      `${this.base(orgId)}/applications/${id}/hire`,
      {},
      skipToast(),
    );
  }

  // --- interviews ----------------------------------------------------------------------

  scheduleInterview(
    orgId: string,
    applicationId: string,
    body: InterviewCreate,
  ): Observable<Interview> {
    return this.api.post<Interview>(
      `${this.base(orgId)}/applications/${applicationId}/interviews`,
      body,
      skipToast(),
    );
  }

  updateInterview(orgId: string, id: string, body: InterviewUpdate): Observable<Interview> {
    return this.api.patch<Interview>(`${this.base(orgId)}/interviews/${id}`, body, skipToast());
  }

  deleteInterview(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/interviews/${id}`, skipToast());
  }

  // --- scorecards ----------------------------------------------------------------------

  createScorecard(
    orgId: string,
    applicationId: string,
    body: ScorecardInput,
  ): Observable<Scorecard> {
    return this.api.post<Scorecard>(
      `${this.base(orgId)}/applications/${applicationId}/scorecards`,
      body,
      skipToast(),
    );
  }

  updateScorecard(
    orgId: string,
    id: string,
    body: Partial<Omit<ScorecardInput, 'interview_id'>>,
  ): Observable<Scorecard> {
    return this.api.patch<Scorecard>(`${this.base(orgId)}/scorecards/${id}`, body, skipToast());
  }

  // --- checks --------------------------------------------------------------------------

  addCheck(orgId: string, applicationId: string, body: CheckCreate): Observable<Check> {
    return this.api.post<Check>(
      `${this.base(orgId)}/applications/${applicationId}/checks`,
      body,
      skipToast(),
    );
  }

  updateCheck(orgId: string, id: string, body: CheckUpdate): Observable<Check> {
    return this.api.patch<Check>(`${this.base(orgId)}/checks/${id}`, body, skipToast());
  }

  deleteCheck(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/checks/${id}`, skipToast());
  }
}
