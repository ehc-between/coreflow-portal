import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  Acknowledgements,
  AnalysisCreate,
  ApproveRequest,
  CommunicateRequest,
  CommunicateResponse,
  ContextAnalysis,
  FollowUpRequest,
  ContextKind,
  ContextListQuery,
  ContextOverview,
  ContextRecord,
  InterestedParty,
  LifecycleAction,
  ListResponse,
  PartyCreate,
  PartyListResponse,
  Policy,
  PolicyCreate,
  RaciMatrix,
  RemindResponse,
  Responsibility,
  ResponsibilityCreate,
  RetireRequest,
  ReturnRequest,
  ReviewRequest,
  ScopeCreate,
  ScopeStatement,
} from './context.models';
import { KINDS } from '../context-kinds';

/** Mutations skip the generic toast: callers show a translated, code-specific message. */
const quiet = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/** Record type per kind (for the generic methods). */
export interface RecordByKind {
  analysis: ContextAnalysis;
  party: InterestedParty;
  scope: ScopeStatement;
  policy: Policy;
  responsibility: Responsibility;
}

export interface CreateByKind {
  analysis: AnalysisCreate;
  party: PartyCreate;
  scope: ScopeCreate;
  policy: PolicyCreate;
  responsibility: ResponsibilityCreate;
}

/**
 * M01 context-of-the-organisation API (`v1/orgs/{org}/context/...`). Every route
 * needs the `context` module switched on (404 `module_disabled` otherwise) and
 * `context:read` / `:write` / `:approve` / `:manage`. Goes through ApiService
 * (base URL, bearer, error interceptor).
 */
@Injectable({ providedIn: 'root' })
export class ContextApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/context`;
  }

  private path(orgId: string, kind: ContextKind, id?: string, suffix?: string): string {
    const parts = [this.base(orgId), KINDS[kind].segment];
    if (id) {
      parts.push(id);
    }
    if (suffix) {
      parts.push(suffix);
    }
    return parts.join('/');
  }

  overview(orgId: string): Observable<ContextOverview> {
    return this.api.get<ContextOverview>(`${this.base(orgId)}/overview`);
  }

  list<K extends ContextKind>(
    orgId: string,
    kind: K,
    query: ContextListQuery = {},
  ): Observable<ListResponse<RecordByKind[K]> & Partial<Pick<PartyListResponse, 'summary'>>> {
    return this.api.get(this.path(orgId, kind), { params: toParams(query) });
  }

  get<K extends ContextKind>(orgId: string, kind: K, id: string): Observable<RecordByKind[K]> {
    return this.api.get<RecordByKind[K]>(this.path(orgId, kind, id));
  }

  create<K extends ContextKind>(
    orgId: string,
    kind: K,
    body: CreateByKind[K] | Readonly<Record<string, unknown>>,
  ): Observable<RecordByKind[K]> {
    return this.api.post<RecordByKind[K]>(this.path(orgId, kind), body, quiet());
  }

  update<K extends ContextKind>(
    orgId: string,
    kind: K,
    id: string,
    body: Readonly<Record<string, unknown>>,
  ): Observable<RecordByKind[K]> {
    return this.api.patch<RecordByKind[K]>(this.path(orgId, kind, id), body, quiet());
  }

  delete(orgId: string, kind: ContextKind, id: string): Observable<void> {
    return this.api.delete<void>(this.path(orgId, kind, id), quiet());
  }

  /**
   * Lifecycle step on an analysis, scope or policy; `review` also works on
   * interested parties and responsibilities (periodic review).
   */
  transition(
    orgId: string,
    kind: ContextKind,
    id: string,
    action: LifecycleAction,
    body: ApproveRequest | ReturnRequest | ReviewRequest | RetireRequest | null = null,
  ): Observable<ContextRecord> {
    return this.api.post<ContextRecord>(this.path(orgId, kind, id, action), body ?? {}, quiet());
  }

  /** Ask people to read and acknowledge an approved policy (creates a task). */
  communicate(
    orgId: string,
    id: string,
    body: CommunicateRequest,
  ): Observable<CommunicateResponse> {
    return this.api.post<CommunicateResponse>(
      this.path(orgId, 'policy', id, 'communicate'),
      body,
      quiet(),
    );
  }

  /** Link a record created from (or answering) one SWOT / PESTEL factor. */
  addFollowUp(
    orgId: string,
    analysisId: string,
    itemId: string,
    body: FollowUpRequest,
  ): Observable<ContextAnalysis> {
    return this.api.post<ContextAnalysis>(
      `${this.path(orgId, 'analysis', analysisId)}/items/${encodeURIComponent(itemId)}/follow-ups`,
      body,
      quiet(),
    );
  }

  /** Detach a follow-up from a factor (the record link itself stays). */
  removeFollowUp(
    orgId: string,
    analysisId: string,
    itemId: string,
    entityType: string,
    entityId: string,
  ): Observable<ContextAnalysis> {
    const item = encodeURIComponent(itemId);
    return this.api.delete<ContextAnalysis>(
      `${this.path(orgId, 'analysis', analysisId)}/items/${item}/follow-ups/${entityType}/${entityId}`,
      quiet(),
    );
  }

  /** Who has read and confirmed the current approved version of a policy. */
  acknowledgements(orgId: string, policyId: string): Observable<Acknowledgements> {
    return this.api.get<Acknowledgements>(
      this.path(orgId, 'policy', policyId, 'acknowledgements'),
      quiet(),
    );
  }

  /** Remind the people who have not confirmed the policy yet. */
  remindAcknowledgements(
    orgId: string,
    policyId: string,
    message: string | null = null,
  ): Observable<RemindResponse> {
    return this.api.post<RemindResponse>(
      `${this.path(orgId, 'policy', policyId, 'acknowledgements')}/remind`,
      message ? { message } : {},
      quiet(),
    );
  }

  /**
   * The evidence pack for the certification body (scope, policies, RACI, parties
   * and analyses with their approval trail) as a PDF or Excel file.
   */
  evidencePack(orgId: string, format: 'pdf' | 'xlsx', lang: string): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/evidence-pack/export`, {
      params: { format, lang: lang === 'en' ? 'en' : 'nb' },
      ...quiet(),
    });
  }

  matrix(
    orgId: string,
    query: { q?: string; status?: readonly string[]; framework?: string } = {},
  ): Observable<RaciMatrix> {
    return this.api.get<RaciMatrix>(`${this.path(orgId, 'responsibility')}/matrix`, {
      params: {
        q: query.q || undefined,
        status: query.status?.length ? query.status.join(',') : undefined,
        framework: query.framework || undefined,
      },
    });
  }
}

/** List query -> wire params (status as csv, blanks dropped). */
export function toParams(query: ContextListQuery): QueryParams {
  const params: Record<string, string | number | boolean | undefined> = {
    q: query.q?.trim() || undefined,
    status: query.status?.length ? query.status.join(',') : undefined,
    owner: query.owner || undefined,
    framework: query.framework || undefined,
    review_due: query.review_due ? true : undefined,
    sort: query.sort || undefined,
    limit: query.limit,
    offset: query.offset || undefined,
  };
  for (const [key, value] of Object.entries(query.extra ?? {})) {
    if (value) {
      params[key] = value;
    }
  }
  return params;
}
